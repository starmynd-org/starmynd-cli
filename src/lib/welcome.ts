import chalk from 'chalk';
import * as api from './api.js';
import { getCredentials, getApiEndpoint, getLocalConfig } from './config.js';
import type { CliPullResponse } from '../types/cli.js';

interface WelcomeStats {
  agents: number;
  workflows: number;
  skills: number;
  namespaceCount: number;
  nodeCount: number;
}

function countEntities(pull: CliPullResponse): WelcomeStats {
  const entities = pull.entities;
  return {
    agents: entities.filter(e => e.type === 'agent').length,
    workflows: entities.filter(e => e.type === 'workflow').length,
    skills: entities.filter(e => e.type === 'skill').length,
    namespaceCount: pull.namespaces.length,
    nodeCount: pull.namespaces.reduce((sum, ns) => sum + ns.node_count, 0),
  };
}

function pad(s: string, n: number): string {
  return s + ' '.repeat(Math.max(0, n - s.length));
}

// Two-tone blue gradient: bright cyan + deep blue
function renderLogo(): string {
  const a = chalk.cyan;
  const b = chalk.blueBright;
  const lines = [
    a(' ███████╗') + b('████████╗') + a(' █████╗ ') + b('██████╗ ') + a('███╗   ███╗') + b('██╗   ██╗') + a('███╗   ██╗') + b('██████╗ '),
    a(' ██╔════╝') + b('╚══██╔══╝') + a('██╔══██╗') + b('██╔══██╗') + a('████╗ ████║') + b('╚██╗ ██╔╝') + a('████╗  ██║') + b('██╔══██╗'),
    a(' ███████╗') + b('   ██║   ') + a('███████║') + b('██████╔╝') + a('██╔████╔██║') + b(' ╚████╔╝ ') + a('██╔██╗ ██║') + b('██║  ██║'),
    a(' ╚════██║') + b('   ██║   ') + a('██╔══██║') + b('██╔══██╗') + a('██║╚██╔╝██║') + b('  ╚██╔╝  ') + a('██║╚██╗██║') + b('██║  ██║'),
    a(' ███████║') + b('   ██║   ') + a('██║  ██║') + b('██║  ██║') + a('██║ ╚═╝ ██║') + b('   ██║   ') + a('██║ ╚████║') + b('██████╔╝'),
    a(' ╚══════╝') + b('   ╚═╝   ') + a('╚═╝  ╚═╝') + b('╚═╝  ╚═╝') + a('╚═╝     ╚═╝') + b('   ╚═╝   ') + a('╚═╝  ╚═══╝') + b('╚═════╝ '),
  ];
  return lines.join('\n');
}

function renderStarfield(): string {
  const lines = [
    chalk.dim('  ·') + '     ' + chalk.cyan('✦') + '       ' + chalk.dim('·') + '    ' + chalk.blueBright('⋆') + '        ' + chalk.dim('·') + '     ' + chalk.cyan('✧') + '      ' + chalk.dim('·') + '    ' + chalk.blueBright('✦') + '     ' + chalk.dim('·'),
    chalk.blueBright('✧') + '        ' + chalk.dim('·') + '   ' + chalk.cyan('⋆') + '      ' + chalk.blueBright('✦') + '    ' + chalk.dim('·') + '       ' + chalk.cyan('✦') + '   ' + chalk.dim('·') + '      ' + chalk.blueBright('⋆') + '       ' + chalk.dim('·'),
  ];
  return lines.join('\n');
}

function renderConstellationLine(): string {
  const a = chalk.cyan;
  const b = chalk.blueBright;
  const d = chalk.dim;
  return d('·') + a('·') + d('·') + b('✦') + d('·') + a('·') + b('✧') + d('·') + a('·') + d('·') + b('✦') + d('·') + a('·') + d('·') + b('⋆') + d('·') + a('·') + d('·') + b('✦') + d('·') + a('·') + b('✧') + d('·') + a('·') + d('·') + b('✦') + d('·') + a('·') + d('·') + b('⋆') + d('·') + a('·') + d('·') + b('✦') + d('·') + a('·') + b('✧') + d('·');
}

function renderOnlineInitBlock(stats: WelcomeStats): string {
  const branch = chalk.blue;
  const ok = chalk.bold.greenBright;
  const sync = chalk.bold.cyan;
  const desc = chalk.rgb(180, 195, 230);
  const meta = chalk.dim;

  return [
    branch('┌') + ' ' + chalk.dim('SYSTEM INIT'),
    branch('│') + ' ' + ok('▸ OK  ') + '  ' + desc('Core intelligence engine'),
    branch('│') + ' ' + ok('▸ OK  ') + '  ' + desc('Decision framework loaded'),
    branch('│') + ' ' + sync('▸ SYNC') + '  ' + pad('Knowledge graphs', 28) + meta(`${stats.namespaceCount} namespaces  ${stats.nodeCount.toLocaleString()} nodes`),
    branch('│') + ' ' + ok('▸ OK  ') + '  ' + pad('Agent playbooks', 28) + meta(`${stats.agents} loaded`),
    branch('│') + ' ' + ok('▸ OK  ') + '  ' + pad('Workflow engine', 28) + meta(`${stats.workflows} workflows`),
    branch('│') + ' ' + ok('▸ OK  ') + '  ' + pad('Skills library', 28) + meta(`${stats.skills} skills`),
    branch('└') + ' ' + chalk.bold.greenBright('READY'),
  ].join('\n');
}

function renderOfflineInitBlock(): string {
  const branch = chalk.blue;
  const ok = chalk.bold.greenBright;
  const warn = chalk.bold.yellow;
  const desc = chalk.rgb(180, 195, 230);

  return [
    branch('┌') + ' ' + chalk.dim('SYSTEM INIT'),
    branch('│') + ' ' + ok('▸ OK  ') + '  ' + desc('Core intelligence engine'),
    branch('│') + ' ' + ok('▸ OK  ') + '  ' + desc('Decision framework loaded'),
    branch('│') + ' ' + warn('▸ WAIT') + '  ' + pad('Knowledge graphs', 28) + chalk.yellow('offline'),
    branch('│') + ' ' + warn('▸ WAIT') + '  ' + pad('Agent playbooks', 28) + chalk.yellow('offline'),
    branch('│') + ' ' + warn('▸ WAIT') + '  ' + pad('Workflow engine', 28) + chalk.yellow('offline'),
    branch('│') + ' ' + warn('▸ WAIT') + '  ' + pad('Skills library', 28) + chalk.yellow('offline'),
    branch('└') + ' ' + chalk.bold.yellow('READY') + chalk.dim('  (cached mode)'),
  ].join('\n');
}

export async function showWelcomeScreen(pullData?: CliPullResponse): Promise<void> {
  const creds = getCredentials();
  const config = getLocalConfig();
  const endpoint = getApiEndpoint();
  const slug = creds?.workspace_slug || config?.workspace_slug || 'unknown';
  const email = creds?.email;

  let online = false;
  let stats: WelcomeStats | null = null;

  // Use provided pull data, or try fetching
  const data = pullData ?? await api.pull({}).catch(() => null);
  if (data) {
    stats = countEntities(data);
    online = true;
  }

  const ws = online ? chalk.white(slug) : chalk.yellow(slug + ' (cached)');
  const apiVal = online ? chalk.dim(endpoint) : chalk.yellow(endpoint + ' (unreachable)');
  const footer = [
    `${chalk.dim('WORKSPACE:')} ${ws}`,
    ...(email ? [`${chalk.dim('USER:     ')} ${chalk.white(email)}`] : []),
    `${chalk.dim('API:      ')} ${apiVal}`,
  ];

  const v = chalk.cyan('v0.1.3');
  const dot = chalk.blueBright('●');
  const status = online ? chalk.greenBright('ready') : chalk.yellow('offline');

  console.log();
  console.log(renderStarfield());
  console.log(renderConstellationLine());
  console.log();
  console.log(renderLogo());
  console.log();
  console.log(chalk.bold.blueBright('  Decide Better.') + '  ' + chalk.bold.cyan('Decide Faster.') + '  ' + chalk.bold.rgb(98, 214, 255)("Catch What Humans Can't."));
  console.log();
  console.log(renderConstellationLine());
  console.log();
  console.log(online && stats ? renderOnlineInitBlock(stats) : renderOfflineInitBlock());
  console.log();
  console.log(renderConstellationLine());
  console.log();
  console.log(`${v} ${dot} ${status}`);
  console.log();
  console.log(footer.join('\n'));
  console.log();
  console.log(chalk.dim("  ✧ Type 'starmynd --help' to see all commands ✧"));
  console.log();
  console.log(renderStarfield());
  console.log();
}
