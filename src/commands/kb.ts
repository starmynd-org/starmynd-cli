import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import ora from 'ora';
import open from 'open';
import * as api from '../lib/api.js';
import { parseKbFile, scanDirectory, hashString } from '../lib/files.js';
import { getAuthToken, getApiEndpoint } from '../lib/config.js';

const MAX_BATCH_SIZE = 100;

export function registerKbCommands(program: Command): void {
  const kb = program.command('kb').description('Knowledge base operations');

  // -----------------------------------------------------------------------
  // kb upload (single file)
  // -----------------------------------------------------------------------
  kb
    .command('upload')
    .description('Upload a single file as a knowledge node')
    .requiredOption('--namespace <id>', 'Namespace ID')
    .requiredOption('--file <path>', 'File to upload')
    .action(async (opts: { namespace: string; file: string }) => {
      const spinner = ora('Uploading...').start();

      try {
        if (!fs.existsSync(opts.file)) {
          spinner.fail(`File not found: ${opts.file}`);
          process.exit(1);
        }

        const node = parseKbFile(opts.file, opts.namespace);
        const result = await api.kbUpload({ nodes: [node], namespace_id: opts.namespace });

        if (result.errors.length > 0) {
          spinner.fail('Upload failed');
          for (const err of result.errors) {
            console.log(chalk.red(`  ${err.title}: ${err.message}`));
          }
          process.exit(1);
        }

        spinner.succeed(`Uploaded: ${node.title} (${node.node_type})`);
      } catch (err) {
        spinner.fail(`Upload failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // kb upload-dir (bulk)
  // -----------------------------------------------------------------------
  kb
    .command('upload-dir')
    .description('Bulk upload a directory of files as knowledge nodes')
    .requiredOption('--namespace <id>', 'Namespace ID')
    .requiredOption('--directory <dir>', 'Directory to upload')
    .action(async (opts: { namespace: string; directory: string }) => {
      if (!fs.existsSync(opts.directory)) {
        console.log(chalk.red(`Directory not found: ${opts.directory}`));
        process.exit(1);
      }

      const files = scanDirectory(opts.directory, ['.md', '.html', '.htm', '.txt']);
      if (files.length === 0) {
        console.log(chalk.yellow('No uploadable files found in directory.'));
        return;
      }

      console.log(`Found ${files.length} file(s) to upload.`);

      let created = 0;
      let errors = 0;

      // Batch in groups of MAX_BATCH_SIZE
      for (let i = 0; i < files.length; i += MAX_BATCH_SIZE) {
        const batch = files.slice(i, i + MAX_BATCH_SIZE);
        const batchNum = Math.floor(i / MAX_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(files.length / MAX_BATCH_SIZE);
        const spinner = ora(`Batch ${batchNum}/${totalBatches} (${batch.length} files)...`).start();

        try {
          const nodes = batch.map(f => parseKbFile(f, opts.namespace));
          const result = await api.kbUpload({ nodes, namespace_id: opts.namespace });
          created += result.created;
          errors += result.errors.length;

          if (result.errors.length > 0) {
            spinner.warn(`Batch ${batchNum}: ${result.created} created, ${result.errors.length} errors`);
            for (const err of result.errors) {
              console.log(chalk.red(`  ${err.title}: ${err.message}`));
            }
          } else {
            spinner.succeed(`Batch ${batchNum}: ${result.created} created`);
          }
        } catch (err) {
          spinner.fail(`Batch ${batchNum} failed: ${(err as Error).message}`);
          errors += batch.length;
        }
      }

      console.log(`\nDone: ${created} created, ${errors} errors`);
    });

  // -----------------------------------------------------------------------
  // kb pull (export + extract)
  // -----------------------------------------------------------------------
  kb
    .command('pull')
    .description('Export a namespace as a zip and extract locally')
    .requiredOption('--namespace <id>', 'Namespace ID')
    .option('--output <dir>', 'Output directory', './kb-export')
    .action(async (opts: { namespace: string; output: string }) => {
      const spinner = ora('Exporting namespace...').start();

      try {
        // Resolve namespace slug to UUID if needed
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.namespace);
        let namespaceId = opts.namespace;
        if (!isUuid) {
          spinner.text = 'Resolving namespace...';
          const pullResult = await api.pull({ only: ['knowledge'] });
          const match = pullResult.namespaces.find(ns => ns.slug === opts.namespace);
          if (!match) {
            spinner.fail(`Namespace "${opts.namespace}" not found.`);
            process.exit(1);
          }
          namespaceId = match.id;
          spinner.text = 'Exporting namespace...';
        }

        const buffer = await api.kbExport(namespaceId);
        const zipPath = path.resolve(`${opts.output}.zip`);
        const outDir = path.resolve(opts.output);

        // Write zip file
        fs.writeFileSync(zipPath, Buffer.from(buffer));
        spinner.text = 'Extracting...';

        // Extract using built-in Node.js (or tar if available)
        fs.mkdirSync(outDir, { recursive: true });

        // Use unzip command if available, otherwise keep the zip
        const { execSync } = await import('node:child_process');
        try {
          execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: 'pipe' });
          fs.unlinkSync(zipPath); // Clean up zip after extraction
          spinner.succeed(`Exported to ${outDir}`);
        } catch {
          spinner.succeed(`Downloaded to ${zipPath} (install unzip to auto-extract)`);
        }

        // Count files
        const extractedFiles = scanDirectory(outDir, ['.md', '.html', '.htm', '.txt']);
        if (extractedFiles.length > 0) {
          console.log(`  ${extractedFiles.length} file(s) extracted`);
        }
      } catch (err) {
        spinner.fail(`Export failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // kb preview (open HTML in browser)
  // -----------------------------------------------------------------------
  kb
    .command('preview')
    .description('Preview an HTML knowledge file in the browser')
    .requiredOption('--file <path>', 'HTML file to preview')
    .option('--responsive', 'Show responsive preview (600px + 375px)')
    .action(async (opts: { file: string; responsive?: boolean }) => {
      if (!fs.existsSync(opts.file)) {
        console.log(chalk.red(`File not found: ${opts.file}`));
        process.exit(1);
      }

      const html = fs.readFileSync(opts.file, 'utf-8');
      const title = path.basename(opts.file);

      let previewHtml: string;
      if (opts.responsive) {
        previewHtml = wrapResponsivePreview(html, title);
      } else {
        previewHtml = wrapSimplePreview(html, title);
      }

      // Write to temp file and open
      const tmpDir = path.join(process.env.TMPDIR || '/tmp', 'starmynd-preview');
      fs.mkdirSync(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, `preview-${Date.now()}.html`);
      fs.writeFileSync(tmpFile, previewHtml, 'utf-8');

      console.log(`Opening preview: ${title}`);
      await open(tmpFile);
    });

  // -----------------------------------------------------------------------
  // kb diff
  // -----------------------------------------------------------------------
  kb
    .command('diff')
    .description('Compare local KB files against remote namespace')
    .requiredOption('--namespace <id>', 'Namespace ID')
    .requiredOption('--directory <dir>', 'Local directory to compare')
    .action(async (opts: { namespace: string; directory: string }) => {
      const spinner = ora('Fetching remote state...').start();

      try {
        // Pull remote namespace state via the diff endpoint
        const remote = await api.diff();
        spinner.text = 'Comparing...';

        const remoteKb = remote.entries.filter(e => e.type === 'knowledge');
        const remoteMap = new Map(remoteKb.map(e => [e.slug, e.hash]));

        const localFiles = scanDirectory(opts.directory, ['.md', '.html', '.htm']);
        const added: string[] = [];
        const modified: string[] = [];
        const unchanged: string[] = [];

        for (const file of localFiles) {
          const slug = path.basename(file, path.extname(file));
          const localHash = hashString(fs.readFileSync(file, 'utf-8'));
          const remoteHash = remoteMap.get(slug);

          if (!remoteHash) {
            added.push(slug);
          } else if (remoteHash !== localHash) {
            modified.push(slug);
          } else {
            unchanged.push(slug);
          }
          remoteMap.delete(slug);
        }

        const remoteOnly = Array.from(remoteMap.keys());
        spinner.stop();

        if (added.length === 0 && modified.length === 0 && remoteOnly.length === 0) {
          console.log(chalk.green('KB files are in sync with remote namespace.'));
          return;
        }

        if (added.length > 0) {
          console.log(chalk.green(`\nNew locally (${added.length}):`));
          for (const s of added) console.log(`  + ${s}`);
        }
        if (modified.length > 0) {
          console.log(chalk.yellow(`\nModified (${modified.length}):`));
          for (const s of modified) console.log(`  ~ ${s}`);
        }
        if (remoteOnly.length > 0) {
          console.log(chalk.red(`\nRemote only (${remoteOnly.length}):`));
          for (const s of remoteOnly) console.log(`  - ${s}`);
        }

        console.log(`\nSummary: ${added.length} new, ${modified.length} modified, ${remoteOnly.length} remote-only, ${unchanged.length} unchanged`);
      } catch (err) {
        spinner.fail(`KB diff failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // kb list
  // -----------------------------------------------------------------------
  kb
    .command('list')
    .description('List nodes in a namespace')
    .requiredOption('--namespace <id>', 'Namespace ID or slug')
    .action(async (opts: { namespace: string }) => {
      const spinner = ora('Fetching namespace info...').start();

      try {
        // Resolve slug to UUID using the pull namespaces list
        const pullResult = await api.pull({ only: ['knowledge'] });
        spinner.stop();

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.namespace);
        let namespaceId = opts.namespace;
        let namespaceName = opts.namespace;
        if (!isUuid) {
          const match = pullResult.namespaces.find(ns => ns.slug === opts.namespace);
          if (!match) {
            console.log(chalk.red(`Namespace "${opts.namespace}" not found.`));
            console.log(chalk.dim('Run: starmynd kb list-namespaces to see available namespaces'));
            return;
          }
          namespaceId = match.id;
          namespaceName = match.name;
        }

        // Fetch all pages of nodes from the dedicated nodes endpoint
        spinner.start('Fetching nodes...');
        let page = 1;
        const allNodes: api.KbNodeListItem[] = [];
        let hasMore = true;

        while (hasMore) {
          const res = await api.kbListNodes(namespaceId, { page, limit: 100 });
          allNodes.push(...res.data);
          hasMore = res.hasMore;
          page++;
        }

        spinner.stop();

        if (allNodes.length === 0) {
          console.log(chalk.yellow(`Namespace "${namespaceName}" has 0 nodes.`));
          return;
        }

        console.log(chalk.bold(`Knowledge nodes in "${namespaceName}" (${allNodes.length}):\n`));
        for (const node of allNodes) {
          console.log(`  ${chalk.white(node.id.slice(0, 8))} ${chalk.cyan(node.node_type.padEnd(12))} ${node.title}`);
        }
      } catch (err) {
        spinner.fail(`List failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Preview HTML wrappers
// ---------------------------------------------------------------------------

function wrapSimplePreview(html: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StarMynd Preview: ${title}</title>
  <style>
    body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
    .preview-header { background: #1a1a2e; color: white; padding: 12px 20px; margin: -20px -20px 20px; display: flex; align-items: center; gap: 12px; }
    .preview-header h3 { margin: 0; font-size: 14px; }
    .preview-badge { background: #6c63ff; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
    .content { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div class="preview-header">
    <span class="preview-badge">PREVIEW</span>
    <h3>${title}</h3>
  </div>
  <div class="content">${html}</div>
</body>
</html>`;
}

function wrapResponsivePreview(html: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>StarMynd Responsive Preview: ${title}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; }
    .toolbar { background: #16213e; color: white; padding: 12px 20px; display: flex; align-items: center; gap: 16px; }
    .toolbar h3 { margin: 0; font-size: 14px; flex: 1; }
    .preview-badge { background: #6c63ff; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
    .frames { display: flex; gap: 20px; padding: 20px; justify-content: center; flex-wrap: wrap; }
    .frame-wrapper { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    .frame-label { background: #e8e8e8; padding: 6px 12px; font-size: 12px; color: #666; text-align: center; }
    .frame-600 { width: 600px; }
    .frame-375 { width: 375px; }
    .frame-content { padding: 16px; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="preview-badge">RESPONSIVE</span>
    <h3>${title}</h3>
  </div>
  <div class="frames">
    <div class="frame-wrapper frame-600">
      <div class="frame-label">Desktop (600px)</div>
      <div class="frame-content">${html}</div>
    </div>
    <div class="frame-wrapper frame-375">
      <div class="frame-label">Mobile (375px)</div>
      <div class="frame-content">${html}</div>
    </div>
  </div>
</body>
</html>`;
}
