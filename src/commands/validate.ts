import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import open from 'open';
import * as api from '../lib/api.js';
import { parseEntityFile, scanDirectory } from '../lib/files.js';
import { validateEntities } from '../lib/validation.js';
import { showWelcomeScreen } from '../lib/welcome.js';

export function registerValidateCommands(program: Command): void {
  // -----------------------------------------------------------------------
  // validate
  // -----------------------------------------------------------------------
  program
    .command('validate')
    .description('Validate local entity files against StarMynd schemas')
    .argument('[path]', 'File or directory to validate', '.')
    .option('--remote', 'Also validate against remote API (not just local schemas)')
    .action(async (targetPath: string, opts: { remote?: boolean }) => {
      const spinner = ora('Scanning files...').start();

      try {
        const resolved = path.resolve(targetPath);
        if (!fs.existsSync(resolved)) {
          spinner.fail(`Path not found: ${targetPath}`);
          process.exit(1);
        }

        // Collect files
        const stat = fs.statSync(resolved);
        const files = stat.isFile()
          ? [resolved]
          : scanDirectory(resolved, ['.yaml', '.yml', '.md']);

        if (files.length === 0) {
          spinner.warn('No entity files found to validate.');
          return;
        }

        spinner.text = `Validating ${files.length} file(s)...`;

        // Parse and validate
        const parseErrors: Array<{ file: string; error: string }> = [];
        const entities = [];

        for (const file of files) {
          try {
            const entity = parseEntityFile(file);
            entities.push({ file, entity });
          } catch (err) {
            parseErrors.push({ file, error: (err as Error).message });
          }
        }

        // Run validation
        const validationErrors = validateEntities(entities.map(e => e.entity));

        // Optionally validate against remote API
        let remoteErrors: Array<{ slug: string; type: string; field: string; message: string }> = [];
        if (opts.remote && entities.length > 0) {
          spinner.text = 'Validating against remote API...';
          try {
            const result = await api.validate({ entities: entities.map(e => e.entity) });
            if (!result.valid) {
              remoteErrors = result.errors;
            }
          } catch (err) {
            console.log(chalk.yellow(`\n  Warning: remote validation failed: ${(err as Error).message}`));
          }
        }

        spinner.stop();

        // Report results
        const totalErrors = parseErrors.length + validationErrors.length + remoteErrors.length;

        if (totalErrors === 0) {
          console.log(chalk.green(`\nAll ${files.length} file(s) are valid.`));
          return;
        }

        console.log(chalk.red(`\nValidation failed: ${totalErrors} error(s)\n`));

        if (parseErrors.length > 0) {
          console.log(chalk.red('Parse errors:'));
          for (const err of parseErrors) {
            const relPath = path.relative(process.cwd(), err.file);
            console.log(`  ${chalk.dim(relPath)}: ${err.error}`);
          }
          console.log();
        }

        if (validationErrors.length > 0) {
          console.log(chalk.red('Schema errors:'));
          for (const err of validationErrors) {
            console.log(`  ${chalk.cyan(err.type)}/${chalk.white(err.slug)}: ${err.field} - ${err.message}`);
          }
          console.log();
        }

        if (remoteErrors.length > 0) {
          console.log(chalk.red('Remote validation errors:'));
          for (const err of remoteErrors) {
            console.log(`  ${chalk.cyan(err.type)}/${chalk.white(err.slug)}: ${err.field} - ${err.message}`);
          }
          console.log();
        }

        process.exit(1);
      } catch (err) {
        spinner.fail(`Validation failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // preview (HTML in browser)
  // -----------------------------------------------------------------------
  program
    .command('preview')
    .description('Preview an HTML component in the browser')
    .argument('<file>', 'HTML file to preview')
    .option('--responsive', 'Show responsive preview at multiple widths')
    .action(async (file: string, opts: { responsive?: boolean }) => {
      if (!fs.existsSync(file)) {
        console.log(chalk.red(`File not found: ${file}`));
        process.exit(1);
      }

      const html = fs.readFileSync(file, 'utf-8');
      const title = path.basename(file);

      let previewHtml: string;
      if (opts.responsive) {
        previewHtml = buildResponsivePreview(html, title);
      } else {
        previewHtml = buildSimplePreview(html, title);
      }

      const tmpDir = path.join(process.env.TMPDIR || '/tmp', 'starmynd-preview');
      fs.mkdirSync(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, `preview-${Date.now()}.html`);
      fs.writeFileSync(tmpFile, previewHtml, 'utf-8');

      console.log(`Opening preview: ${title}`);
      await open(tmpFile);
    });
}

// ---------------------------------------------------------------------------
// Init command (registered separately since it's top-level)
// ---------------------------------------------------------------------------

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize a StarMynd workspace connection')
    .option('--slug <slug>', 'Workspace slug')
    .option('--api-key <key>', 'API key')
    .option('--endpoint <url>', 'API endpoint', 'https://app.starmynd.com')
    .action(async (opts: { slug?: string; endpoint: string; apiKey?: string }) => {
      console.log(chalk.bold('\nStarMynd Workspace Setup\n'));

      let slug = opts.slug;
      let apiKey = opts.apiKey;

      // If not provided via flags, prompt interactively
      if (!slug) {
        const readline = await import('node:readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const ask = (question: string): Promise<string> =>
          new Promise(resolve => rl.question(question, resolve));

        slug = await ask('Workspace slug: ');
        if (!apiKey) {
          const { getAuthToken: checkToken } = await import('../lib/config.js');
          if (!checkToken()) {
            apiKey = await ask('API key (or press Enter for OAuth): ');
          }
        }
        rl.close();
      }

      if (!slug?.trim()) {
        console.log(chalk.red('Workspace slug is required.'));
        process.exit(1);
      }

      const spinner = ora('Connecting to workspace...').start();

      try {
        // If API key provided, verify it
        if (apiKey?.trim()) {
          const { saveCredentials } = await import('../lib/config.js');
          const res = await fetch(`${opts.endpoint}/api/cli/auth/status`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(15_000),
          });

          if (!res.ok) {
            spinner.fail('Invalid API key.');
            process.exit(1);
          }

          const data = (await res.json()) as {
            workspace_id: string;
            workspace_slug: string;
            email?: string;
          };

          saveCredentials({
            api_key: apiKey,
            workspace_id: data.workspace_id,
            workspace_slug: data.workspace_slug,
            email: data.email,
          });

          spinner.text = 'Running initial pull...';
        } else {
          const { getAuthToken: existingToken } = await import('../lib/config.js');
          if (!existingToken()) {
            spinner.info('No API key provided. Run: starmynd auth login');
          }
          spinner.text = 'Connecting...';
        }

        // Create .starmynd/ config
        const { saveLocalConfig, ensureLocalDir } = await import('../lib/config.js');
        ensureLocalDir();

        // If we have auth, try to pull
        const { getAuthToken } = await import('../lib/config.js');
        const token = getAuthToken();

        if (token) {
          try {
            const result = await api.pull({});
            saveLocalConfig({
              workspace_id: result.workspace_id,
              workspace_slug: result.workspace_slug,
              api_endpoint: opts.endpoint,
              last_pull: result.pulled_at,
            });

            spinner.succeed('Workspace initialized');
            await showWelcomeScreen(result);
          } catch {
            // Pull failed, just save config
            saveLocalConfig({
              workspace_id: '',
              workspace_slug: slug,
              api_endpoint: opts.endpoint,
            });
            spinner.warn('Config created but pull failed. Check auth and try: starmynd pull');
          }
        } else {
          saveLocalConfig({
            workspace_id: '',
            workspace_slug: slug,
            api_endpoint: opts.endpoint,
          });
          spinner.succeed('Config created');
          console.log(`  Config: .starmynd/config.yaml`);
          console.log(`  Next:   starmynd auth login`);
        }
      } catch (err) {
        spinner.fail(`Init failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// Preview HTML builders
// ---------------------------------------------------------------------------

function buildSimplePreview(html: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview: ${title}</title>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; background: #f5f5f5; }
    .bar { background: #1a1a2e; color: #fff; padding: 10px 20px; margin: -20px -20px 20px; font-size: 13px; }
    .bar span { background: #6c63ff; padding: 2px 8px; border-radius: 4px; margin-right: 10px; font-size: 11px; }
    .wrap { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div class="bar"><span>PREVIEW</span>${title}</div>
  <div class="wrap">${html}</div>
</body>
</html>`;
}

function buildResponsivePreview(html: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Responsive: ${title}</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #1a1a2e; }
    .bar { background: #16213e; color: #fff; padding: 10px 20px; font-size: 13px; }
    .bar span { background: #6c63ff; padding: 2px 8px; border-radius: 4px; margin-right: 10px; font-size: 11px; }
    .grid { display: flex; gap: 20px; padding: 20px; justify-content: center; flex-wrap: wrap; }
    .card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    .card-label { background: #eee; padding: 6px 12px; font-size: 12px; color: #666; text-align: center; }
    .w600 { width: 600px; }
    .w375 { width: 375px; }
    .card-body { padding: 16px; }
  </style>
</head>
<body>
  <div class="bar"><span>RESPONSIVE</span>${title}</div>
  <div class="grid">
    <div class="card w600">
      <div class="card-label">Desktop (600px)</div>
      <div class="card-body">${html}</div>
    </div>
    <div class="card w375">
      <div class="card-label">Mobile (375px)</div>
      <div class="card-body">${html}</div>
    </div>
  </div>
</body>
</html>`;
}
