import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import http from 'node:http';
import { saveCredentials, getCredentials, clearCredentials, getApiEndpoint } from '../lib/config.js';
import { showWelcomeScreen } from '../lib/welcome.js';

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Manage authentication');

  // -----------------------------------------------------------------------
  // auth login
  // -----------------------------------------------------------------------
  auth
    .command('login')
    .description('Authenticate with StarMynd')
    .option('--api-key <key>', 'Use an API key instead of OAuth')
    .action(async (opts: { apiKey?: string }) => {
      if (opts.apiKey) {
        await loginWithApiKey(opts.apiKey);
      } else {
        await loginWithOAuth();
      }
    });

  // -----------------------------------------------------------------------
  // auth status
  // -----------------------------------------------------------------------
  auth
    .command('status')
    .description('Show current authentication status')
    .action(async () => {
      const creds = getCredentials();
      if (!creds) {
        console.log(chalk.yellow('Not authenticated. Run: starmynd auth login'));
        process.exit(1);
      }

      console.log(chalk.bold('Authentication Status'));
      console.log(`  Email:     ${creds.email || '(api key)'}`);
      console.log(`  Workspace: ${creds.workspace_slug} (${creds.workspace_id})`);
      console.log(`  Auth type: ${creds.api_key ? 'API Key' : 'OAuth'}`);
      if (creds.token_expires) {
        const expires = new Date(creds.token_expires);
        const isExpired = expires < new Date();
        console.log(`  Expires:   ${creds.token_expires} ${isExpired ? chalk.red('(EXPIRED)') : chalk.green('(valid)')}`);
      }
    });

  // -----------------------------------------------------------------------
  // auth switch-workspace
  // -----------------------------------------------------------------------
  auth
    .command('switch-workspace')
    .description('Switch to a different workspace')
    .argument('[slug]', 'Workspace slug to switch to')
    .option('--list', 'List available workspaces')
    .action(async (slug: string | undefined, opts: { list?: boolean }) => {
      const creds = getCredentials();
      if (!creds) {
        console.log(chalk.yellow('Not authenticated. Run: starmynd auth login'));
        process.exit(1);
      }

      const token = creds.api_key || creds.oauth_token;
      const endpoint = getApiEndpoint();

      // List mode: show all workspaces
      if (opts.list || !slug) {
        try {
          const res = await fetch(`${endpoint}/api/cli/auth/workspaces`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15_000),
          });

          if (!res.ok) {
            console.log(chalk.red('Failed to fetch workspaces.'));
            process.exit(1);
          }

          const data = (await res.json()) as { workspaces: Array<{ id: string; slug: string; name: string; role: string }> };
          const workspaces = data.workspaces ?? [];

          if (workspaces.length === 0) {
            console.log(chalk.yellow('No workspaces found.'));
            return;
          }

          console.log(chalk.bold('\nAvailable Workspaces:\n'));
          for (const ws of workspaces) {
            const current = ws.slug === creds.workspace_slug ? chalk.green(' (current)') : '';
            console.log(`  ${chalk.cyan(ws.slug)} - ${ws.name} [${ws.role}]${current}`);
          }
          console.log();
          return;
        } catch (err) {
          console.log(chalk.red(`Failed to list workspaces: ${(err as Error).message}`));
          process.exit(1);
        }
      }

      // Switch mode: verify and switch to the given slug
      try {
        const res = await fetch(`${endpoint}/api/cli/auth/workspaces`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          console.log(chalk.red(`Cannot fetch workspaces. Check your permissions.`));
          process.exit(1);
        }

        const data = (await res.json()) as { workspaces: Array<{ id: string; slug: string; name: string; role: string }> };
        const target = (data.workspaces ?? []).find(ws => ws.slug === slug);

        if (!target) {
          console.log(chalk.red(`Workspace "${slug}" not found or you don't have access.`));
          process.exit(1);
        }

        saveCredentials({
          ...creds,
          workspace_id: target.id,
          workspace_slug: target.slug,
        });

        console.log(chalk.green(`Switched to workspace: ${target.name} (${target.slug})`));
      } catch (err) {
        console.log(chalk.red(`Failed to switch workspace: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // auth logout
  // -----------------------------------------------------------------------
  auth
    .command('logout')
    .description('Remove stored credentials')
    .action(() => {
      clearCredentials();
      console.log(chalk.green('Logged out successfully.'));
    });
}

// ---------------------------------------------------------------------------
// Login helpers
// ---------------------------------------------------------------------------

async function loginWithApiKey(apiKey: string): Promise<void> {
  const endpoint = getApiEndpoint();

  try {
    const res = await fetch(`${endpoint}/api/cli/auth/status`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.log(chalk.red('Invalid API key.'));
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

    const ora = (await import('ora')).default;
    const spinner = ora({
      text: 'Syncing workspace...',
      spinner: { interval: 120, frames: ['✧ ', '✦ ', '⋆ ', '✦ ', '✧ ', '· '] },
    }).start();
    const { diff, pull } = await import('../lib/api.js');
    const [diffData, namespacePull] = await Promise.all([
      diff().catch(() => null),
      pull({}).catch(() => null),
    ]);
    spinner.stop();

    let pullData: import('../types/cli.js').CliPullResponse | undefined;
    if (diffData && namespacePull) {
      pullData = {
        workspace_id: namespacePull.workspace_id,
        workspace_slug: namespacePull.workspace_slug,
        pulled_at: namespacePull.pulled_at,
        entities: diffData.entries.map(e => ({
          id: e.id, type: e.type as import('../types/cli.js').CliEntityType, slug: e.slug,
          title: '', description: null, content: null, tags: [], metadata: {},
          status: 'active', components: [], updated_at: e.updated_at,
        })),
        namespaces: namespacePull.namespaces,
        governance: namespacePull.governance,
      };
    }

    await showWelcomeScreen(pullData);
  } catch (err) {
    console.log(chalk.red(`Authentication failed: ${(err as Error).message}`));
    process.exit(1);
  }
}

async function loginWithOAuth(): Promise<void> {
  const endpoint = getApiEndpoint();
  const port = 19275; // Local callback port
  const redirectUri = `http://localhost:${port}/callback`;

  console.log(chalk.bold('Starting OAuth login...'));

  // Start a temporary local server to receive the OAuth callback
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`);
      if (url.pathname === '/callback') {
        const authCode = url.searchParams.get('code');
        if (authCode) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(buildSuccessPage());
          server.close();
          resolve(authCode);
        } else {
          const error = url.searchParams.get('error') || 'No code received';
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(buildErrorPage(error));
          server.close();
          reject(new Error(error));
        }
      }
    });

    server.listen(port, () => {
      const authUrl = `${endpoint}/api/cli/auth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`;
      console.log(`Opening browser for authentication...`);
      console.log(chalk.dim(`If the browser doesn't open, visit: ${authUrl}`));
      open(authUrl).catch(() => {
        // Browser open failed, user can manually visit the URL
      });
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth login timed out after 2 minutes'));
    }, 120_000);
  });

  // Exchange the code for a token
  try {
    const res = await fetch(`${endpoint}/api/cli/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.log(chalk.red('Token exchange failed.'));
      process.exit(1);
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_at: string;
      workspace_id: string;
      workspace_slug: string;
      email: string;
    };

    saveCredentials({
      oauth_token: data.access_token,
      token_expires: data.expires_at,
      workspace_id: data.workspace_id,
      workspace_slug: data.workspace_slug,
      email: data.email,
    });

    // Fetch workspace stats for welcome screen using lightweight endpoints
    const ora = (await import('ora')).default;
    const spinner = ora({
      text: 'Syncing workspace...',
      spinner: { interval: 120, frames: ['✧ ', '✦ ', '⋆ ', '✦ ', '✧ ', '· '] },
    }).start();
    const { diff, pull } = await import('../lib/api.js');
    // Run diff (lightweight, no entity content) + minimal pull (namespaces only) in parallel
    const [diffData, namespacePull] = await Promise.all([
      diff().catch(() => null),
      pull({}).catch(() => null),
    ]);
    spinner.stop();

    // Build a synthetic pull response from the lightweight data for the welcome screen
    let pullData: import('../types/cli.js').CliPullResponse | undefined;
    if (diffData && namespacePull) {
      pullData = {
        workspace_id: namespacePull.workspace_id,
        workspace_slug: namespacePull.workspace_slug,
        pulled_at: namespacePull.pulled_at,
        entities: diffData.entries.map(e => ({
          id: e.id, type: e.type as import('../types/cli.js').CliEntityType, slug: e.slug,
          title: '', description: null, content: null, tags: [], metadata: {},
          status: 'active', components: [], updated_at: e.updated_at,
        })),
        namespaces: namespacePull.namespaces,
        governance: namespacePull.governance,
      };
    }

    await showWelcomeScreen(pullData);
    process.exit(0);
  } catch (err) {
    console.log(chalk.red(`Login failed: ${(err as Error).message}`));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// OAuth callback HTML pages
// ---------------------------------------------------------------------------

function buildSuccessPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>STARMYND — Authenticated</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #0a0e1a;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    overflow: hidden;
    position: relative;
  }

  .starfield {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .star {
    position: absolute;
    border-radius: 50%;
    background: #fff;
  }

  @keyframes twinkle {
    0%, 100% { opacity: 0.15; transform: scale(1); }
    50%       { opacity: 1;    transform: scale(1.4); }
  }

  .card {
    position: relative;
    z-index: 1;
    border: 1px solid rgb(72, 126, 255);
    border-radius: 10px;
    padding: 3em 3.5em;
    max-width: 480px;
    width: 90vw;
    background: rgba(10, 14, 26, 0.92);
    box-shadow:
      0 0 30px rgba(72, 126, 255, 0.18),
      0 0 80px rgba(176, 132, 255, 0.08);
    text-align: center;
    animation: cardIn 0.4s ease both;
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .brand {
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    background: linear-gradient(90deg, rgb(72, 190, 255), rgb(195, 132, 255));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 1.8em;
  }

  .check-wrap {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(61, 255, 168, 0.08);
    border: 2px solid rgba(61, 255, 168, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.4em;
    animation: checkPop 0.5s 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @keyframes checkPop {
    from { opacity: 0; transform: scale(0.4); }
    to   { opacity: 1; transform: scale(1); }
  }

  .check-wrap svg {
    width: 32px;
    height: 32px;
    stroke: #3dffa8;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
  }

  .check-path {
    stroke-dasharray: 40;
    stroke-dashoffset: 40;
    animation: drawCheck 0.4s 0.7s ease forwards;
  }

  @keyframes drawCheck {
    to { stroke-dashoffset: 0; }
  }

  .heading {
    color: #ffffff;
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 0.5em;
  }

  .subheading {
    color: rgb(98, 214, 255);
    font-size: 0.82rem;
    margin-bottom: 1.8em;
  }

  .rule {
    border: none;
    border-top: 1px solid rgba(72, 126, 255, 0.25);
    margin: 1.4em 0;
  }

  .muted {
    color: rgb(119, 146, 198);
    font-size: 0.75rem;
    line-height: 1.6;
  }
</style>
</head>
<body>
<div class="starfield" id="starfield"></div>
<div class="card">
  <div class="brand">STARMYND</div>

  <div class="check-wrap">
    <svg viewBox="0 0 24 24">
      <polyline class="check-path" points="4 13 9 18 20 7"></polyline>
    </svg>
  </div>

  <div class="heading">Authentication Successful</div>
  <div class="subheading">Connected to StarMynd</div>

  <hr class="rule">
  <div class="muted">You can close this tab.<br>Return to your terminal to continue.</div>
</div>

<script>
(() => {
  const field = document.getElementById('starfield');
  const colors = ['#ffffff', '#c8deff', '#a0c4ff', '#b084ff', '#62d6ff'];
  for (let i = 0; i < 80; i++) {
    const el = document.createElement('div');
    el.className = 'star';
    const size = Math.random() < 0.08 ? 3 : Math.random() < 0.3 ? 2 : 1;
    const dur  = 2 + Math.random() * 4;
    const del  = Math.random() * 5;
    const col  = colors[Math.floor(Math.random() * colors.length)];
    el.style.cssText =
      'width:' + size + 'px;height:' + size + 'px;' +
      'left:' + (Math.random() * 100) + '%;top:' + (Math.random() * 100) + '%;' +
      'background:' + col + ';' +
      'animation:twinkle ' + dur + 's ease-in-out ' + del + 's infinite;';
    field.appendChild(el);
  }
})();
</script>
</body>
</html>`;
}

function buildErrorPage(errorMessage: string): string {
  // Sanitize error message for safe HTML insertion
  const safeError = errorMessage
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>STARMYND — Authentication Error</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #0a0e1a;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    overflow: hidden;
    position: relative;
  }

  .starfield {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .star {
    position: absolute;
    border-radius: 50%;
    background: #fff;
  }

  @keyframes twinkle {
    0%, 100% { opacity: 0.15; transform: scale(1); }
    50%       { opacity: 1;    transform: scale(1.4); }
  }

  .card {
    position: relative;
    z-index: 1;
    border: 1px solid rgba(255, 80, 80, 0.5);
    border-radius: 10px;
    padding: 3em 3.5em;
    max-width: 480px;
    width: 90vw;
    background: rgba(10, 14, 26, 0.92);
    box-shadow:
      0 0 30px rgba(255, 80, 80, 0.1),
      0 0 80px rgba(176, 132, 255, 0.06);
    text-align: center;
    animation: cardIn 0.4s ease both;
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .brand {
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    background: linear-gradient(90deg, rgb(72, 190, 255), rgb(195, 132, 255));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 1.8em;
  }

  .icon-wrap {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(255, 80, 80, 0.08);
    border: 2px solid rgba(255, 80, 80, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.4em;
    animation: iconPop 0.5s 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @keyframes iconPop {
    from { opacity: 0; transform: scale(0.4); }
    to   { opacity: 1; transform: scale(1); }
  }

  .icon-wrap svg {
    width: 30px;
    height: 30px;
    stroke: #ff5050;
    stroke-width: 3;
    stroke-linecap: round;
    fill: none;
  }

  .heading {
    color: #ffffff;
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 0.5em;
  }

  .subheading {
    color: rgb(255, 120, 120);
    font-size: 0.82rem;
    margin-bottom: 1.8em;
  }

  .rule {
    border: none;
    border-top: 1px solid rgba(255, 80, 80, 0.2);
    margin: 1.4em 0;
  }

  .error-detail {
    color: rgb(119, 146, 198);
    font-size: 0.72rem;
    word-break: break-all;
    background: rgba(255, 80, 80, 0.06);
    border: 1px solid rgba(255, 80, 80, 0.15);
    border-radius: 4px;
    padding: 0.6em 0.9em;
    margin-bottom: 1.2em;
  }

  .muted {
    color: rgb(119, 146, 198);
    font-size: 0.75rem;
    line-height: 1.6;
  }
</style>
</head>
<body>
<div class="starfield" id="starfield"></div>
<div class="card">
  <div class="brand">STARMYND</div>

  <div class="icon-wrap">
    <svg viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  </div>

  <div class="heading">Authentication Failed</div>
  <div class="subheading">Could not complete login</div>

  <hr class="rule">
  <div class="error-detail">${safeError}</div>
  <div class="muted">Close this tab and try again.<br>Run <strong>starmynd auth login</strong> in your terminal.</div>
</div>

<script>
(() => {
  const field = document.getElementById('starfield');
  const colors = ['#ffffff', '#c8deff', '#a0c4ff', '#b084ff', '#62d6ff'];
  for (let i = 0; i < 80; i++) {
    const el = document.createElement('div');
    el.className = 'star';
    const size = Math.random() < 0.08 ? 3 : Math.random() < 0.3 ? 2 : 1;
    const dur  = 2 + Math.random() * 4;
    const del  = Math.random() * 5;
    const col  = colors[Math.floor(Math.random() * colors.length)];
    el.style.cssText =
      'width:' + size + 'px;height:' + size + 'px;' +
      'left:' + (Math.random() * 100) + '%;top:' + (Math.random() * 100) + '%;' +
      'background:' + col + ';' +
      'animation:twinkle ' + dur + 's ease-in-out ' + del + 's infinite;';
    field.appendChild(el);
  }
})();
</script>
</body>
</html>`;
}
