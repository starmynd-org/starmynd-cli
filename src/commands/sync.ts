import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import ora from 'ora';
import * as api from '../lib/api.js';
import { saveLocalConfig, ensureLocalDir, getLocalConfig } from '../lib/config.js';
import { parseEntityFile, scanDirectory, hashFileContent, hashEntity } from '../lib/files.js';
import { validateEntities } from '../lib/validation.js';
import type { CliEntityType, CliEntitySnapshot, CliPullResponse } from '../types/cli.js';

const STARMYND_DIR = '.starmynd';

export function registerSyncCommands(program: Command): void {
  // -----------------------------------------------------------------------
  // pull
  // -----------------------------------------------------------------------
  program
    .command('pull')
    .description('Pull workspace state to local .starmynd/ directory')
    .option('--only <types>', 'Comma-separated entity types to pull (e.g. agents,knowledge)')
    .action(async (opts: { only?: string }) => {
      const spinner = ora('Pulling workspace state...').start();

      try {
        const only = opts.only
          ? (opts.only.split(',').map(s => {
              const trimmed = s.trim();
              // Normalize plural to singular (agents -> agent)
              return trimmed.endsWith('s') ? trimmed.slice(0, -1) : trimmed;
            }) as CliEntityType[])
          : undefined;

        const result = await api.pull({ only });
        spinner.text = 'Writing local files...';

        ensureLocalDir();
        writeLocalState(result);

        // Save/update config
        saveLocalConfig({
          workspace_id: result.workspace_id,
          workspace_slug: result.workspace_slug,
          api_endpoint: getLocalConfig()?.api_endpoint || 'https://app.starmynd.com',
          last_pull: result.pulled_at,
        });

        spinner.succeed('Pull complete');
        printPullSummary(result);
      } catch (err) {
        spinner.fail(`Pull failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // push
  // -----------------------------------------------------------------------
  program
    .command('push')
    .description('Push local entity files to StarMynd')
    .argument('<path>', 'File or directory to push')
    .option('--dry-run', 'Show what would change without pushing')
    .action(async (targetPath: string, opts: { dryRun?: boolean }) => {
      const spinner = ora('Reading local files...').start();

      try {
        // Collect entity files
        const files = getFilesToPush(targetPath);
        if (files.length === 0) {
          spinner.fail('No entity files found at the given path');
          process.exit(1);
        }

        const entities = files.map(f => parseEntityFile(f));

        // Client-side validation first
        spinner.text = 'Validating...';
        const localErrors = validateEntities(entities);
        if (localErrors.length > 0) {
          spinner.fail('Validation failed');
          for (const err of localErrors) {
            console.log(chalk.red(`  ${err.type}/${err.slug}: ${err.field} - ${err.message}`));
          }
          process.exit(1);
        }

        if (opts.dryRun) {
          spinner.stop();
          console.log(chalk.bold('\nDry run: the following entities would be pushed:\n'));
          for (const e of entities) {
            console.log(`  ${chalk.cyan(e.type)}/${chalk.white(e.slug)} - ${e.title}`);
            if (e.components?.length) {
              console.log(`    ${e.components.length} component(s)`);
            }
          }
          console.log(`\n${entities.length} entity(ies). Run without --dry-run to push.`);
          return;
        }

        // Push to API
        spinner.text = `Pushing ${entities.length} entity(ies)...`;
        const result = await api.push({ entities });

        spinner.succeed('Push complete');
        console.log(`  Created: ${result.created}`);
        console.log(`  Updated: ${result.updated}`);
        if (result.errors.length > 0) {
          console.log(chalk.yellow(`  Errors: ${result.errors.length}`));
          for (const err of result.errors) {
            console.log(chalk.red(`    ${err.type}/${err.slug}: ${err.message}`));
          }
        }
      } catch (err) {
        spinner.fail(`Push failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // diff
  // -----------------------------------------------------------------------
  program
    .command('diff')
    .description('Compare local entity hashes against remote')
    .action(async () => {
      const spinner = ora('Fetching remote state...').start();

      try {
        const remote = await api.diff();
        spinner.text = 'Comparing...';

        // Build remote hash map
        const remoteMap = new Map<string, { hash: string; updated_at: string }>();
        for (const entry of remote.entries) {
          remoteMap.set(`${entry.type}:${entry.slug}`, {
            hash: entry.hash,
            updated_at: entry.updated_at,
          });
        }

        // Scan local entity files from .starmynd/
        const localDir = STARMYND_DIR;
        if (!fs.existsSync(localDir)) {
          spinner.fail('No .starmynd/ directory. Run: starmynd pull');
          process.exit(1);
        }

        const localFiles = scanDirectory(localDir, ['.yaml', '.yml']);
        const added: string[] = [];
        const modified: string[] = [];
        const unchanged: string[] = [];

        for (const file of localFiles) {
          try {
            // Skip internal config/metadata files
            const relPath = path.relative(localDir, file);
            if (relPath.startsWith('namespaces') || relPath.startsWith('governance') || relPath === 'config.yaml') {
              continue;
            }
            const entity = parseEntityFile(file);
            if (!entity.type || !entity.slug) continue;
            const key = `${entity.type}:${entity.slug}`;
            const localHash = hashEntity(entity);
            const remoteEntry = remoteMap.get(key);

            if (!remoteEntry) {
              added.push(key);
            } else if (remoteEntry.hash !== localHash) {
              modified.push(key);
            } else {
              unchanged.push(key);
            }
            remoteMap.delete(key);
          } catch {
            // Skip unparseable files
          }
        }

        const deleted = Array.from(remoteMap.keys());

        spinner.stop();

        if (added.length === 0 && modified.length === 0 && deleted.length === 0) {
          console.log(chalk.green('Local and remote are in sync.'));
          return;
        }

        if (added.length > 0) {
          console.log(chalk.green(`\nNew locally (${added.length}):`));
          for (const k of added) console.log(`  + ${k}`);
        }
        if (modified.length > 0) {
          console.log(chalk.yellow(`\nModified (${modified.length}):`));
          for (const k of modified) console.log(`  ~ ${k}`);
        }
        if (deleted.length > 0) {
          console.log(chalk.red(`\nRemote only (${deleted.length}):`));
          for (const k of deleted) console.log(`  - ${k}`);
        }
        console.log(`\nSummary: ${added.length} new, ${modified.length} modified, ${deleted.length} remote-only, ${unchanged.length} unchanged`);
      } catch (err) {
        spinner.fail(`Diff failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFilesToPush(targetPath: string): string[] {
  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path not found: ${targetPath}`);
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) return [resolved];
  if (stat.isDirectory()) return scanDirectory(resolved);
  return [];
}

function writeLocalState(data: CliPullResponse): void {
  // Group entities by type
  const byType = new Map<string, CliEntitySnapshot[]>();
  for (const entity of data.entities) {
    const list = byType.get(entity.type) || [];
    list.push(entity);
    byType.set(entity.type, list);
  }

  // Write entity directories
  for (const [type, entities] of byType) {
    const dir = path.join(STARMYND_DIR, `${type}s`);
    fs.mkdirSync(dir, { recursive: true });

    for (const entity of entities) {
      const content = yaml.dump({
        type: entity.type,
        slug: entity.slug,
        title: entity.title,
        description: entity.description,
        status: entity.status,
        tags: entity.tags,
        metadata: entity.metadata,
        content: entity.content,
        components: entity.components.length > 0 ? entity.components : undefined,
      }, { lineWidth: 120 });

      fs.writeFileSync(path.join(dir, `${entity.slug}.yaml`), content, 'utf-8');
    }
  }

  // Write namespaces reference
  if (data.namespaces.length > 0) {
    const nsDir = path.join(STARMYND_DIR, 'namespaces');
    fs.mkdirSync(nsDir, { recursive: true });
    fs.writeFileSync(
      path.join(nsDir, '_index.yaml'),
      yaml.dump(data.namespaces, { lineWidth: 120 }),
      'utf-8',
    );
  }

  // Write governance
  if (data.governance) {
    const govDir = path.join(STARMYND_DIR, 'governance');
    fs.mkdirSync(govDir, { recursive: true });
    fs.writeFileSync(
      path.join(govDir, 'config.yaml'),
      yaml.dump(data.governance, { lineWidth: 120 }),
      'utf-8',
    );
  }

  // Generate GUIDE.md
  const guide = generateGuide(data);
  fs.writeFileSync(path.join(STARMYND_DIR, 'GUIDE.md'), guide, 'utf-8');
}

function generateGuide(data: CliPullResponse): string {
  const byType = new Map<string, number>();
  for (const entity of data.entities) {
    byType.set(entity.type, (byType.get(entity.type) || 0) + 1);
  }

  const lines: string[] = [
    `# ${data.workspace_slug} Workspace Guide`,
    '',
    `> Auto-generated by StarMynd CLI on ${data.pulled_at}`,
    `> Workspace: ${data.workspace_slug} (${data.workspace_id})`,
    '',
    '## Entity Summary',
    '',
    '| Type | Count |',
    '|------|-------|',
  ];

  for (const [type, count] of byType) {
    lines.push(`| ${type} | ${count} |`);
  }

  if (data.namespaces.length > 0) {
    lines.push('', '## Knowledge Namespaces', '');
    for (const ns of data.namespaces) {
      lines.push(`- **${ns.name}** (${ns.slug}): ${ns.node_count} nodes, ${ns.visibility}, ${ns.default_render_mode}`);
    }
  }

  lines.push(
    '',
    '## Quick Commands',
    '',
    '```bash',
    '# Push changes',
    'starmynd push .starmynd/agents/',
    '',
    '# Validate locally',
    'starmynd validate',
    '',
    '# Compare with remote',
    'starmynd diff',
    '',
    '# List entities',
    'starmynd list agents',
    'starmynd list workflows',
    '```',
    '',
    '---',
    `*Generated at ${data.pulled_at}*`,
  );

  return lines.join('\n');
}

function printPullSummary(data: CliPullResponse): void {
  const byType = new Map<string, number>();
  for (const entity of data.entities) {
    byType.set(entity.type, (byType.get(entity.type) || 0) + 1);
  }

  console.log(`  Workspace: ${data.workspace_slug}`);
  for (const [type, count] of byType) {
    console.log(`  ${type}s: ${count}`);
  }
  if (data.namespaces.length > 0) {
    console.log(`  namespaces: ${data.namespaces.length}`);
  }
  console.log(`  GUIDE.md: regenerated`);
}
