import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as api from '../lib/api.js';
import { getCredentials, getApiEndpoint, getLocalConfig, getAuthToken } from '../lib/config.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show workspace connection and health status')
    .action(async () => {
      const creds = getCredentials();
      const config = getLocalConfig();
      const endpoint = getApiEndpoint();
      const token = getAuthToken();

      console.log();
      console.log(chalk.bold.white('StarMynd Workspace Status'));
      console.log(chalk.cyan('━'.repeat(30)));

      // Connection section
      console.log();
      console.log(chalk.bold('Connection'));

      const spinner = ora({ text: 'Checking API...', indent: 2 }).start();

      let apiOk = false;
      if (token) {
        try {
          await api.pull({ only: [] });
          apiOk = true;
          spinner.stop();
          console.log('  ' + padDots('API', endpoint) + ' .... ' + chalk.green('OK'));
        } catch {
          spinner.stop();
          console.log('  ' + padDots('API', endpoint) + ' .... ' + chalk.red('UNREACHABLE'));
        }
      } else {
        spinner.stop();
        console.log('  ' + padDots('API', endpoint) + ' .... ' + chalk.yellow('NO AUTH'));
      }

      // Auth line
      if (!creds) {
        console.log('  ' + padDots('Auth', 'Not authenticated') + ' .... ' + chalk.red('missing'));
      } else if (creds.oauth_token) {
        const expired = creds.token_expires && new Date(creds.token_expires) < new Date();
        const label = `OAuth (${creds.email || 'unknown'})`;
        const status = expired ? chalk.red('expired') : chalk.green('valid');
        console.log('  ' + padDots('Auth', label) + ' .... ' + status);
      } else if (creds.api_key) {
        console.log('  ' + padDots('Auth', 'API Key') + ' .... ' + chalk.green('valid'));
      }

      // Cache section
      console.log();
      console.log(chalk.bold('Cache'));
      if (config?.last_pull) {
        const pullDate = new Date(config.last_pull);
        const hoursAgo = Math.round((Date.now() - pullDate.getTime()) / (1000 * 60 * 60));
        const freshness = hoursAgo < 1
          ? 'just now'
          : hoursAgo < 24
            ? `${hoursAgo}h ago`
            : `${Math.round(hoursAgo / 24)}d ago`;
        const color = hoursAgo > 24 ? chalk.yellow : chalk.green;
        console.log('  Last pull: ' + chalk.white(config.last_pull) + ' (' + color(freshness) + ')');
      } else {
        console.log('  Last pull: ' + chalk.yellow('never'));
      }

      // Entity counts (remote only)
      if (apiOk && token) {
        console.log();
        console.log(chalk.bold('Entities'));
        const countSpinner = ora({ text: 'Fetching counts...', indent: 2 }).start();
        try {
          const pull = await api.pull({});
          countSpinner.stop();

          const agents = pull.entities.filter(e => e.type === 'agent').length;
          const workflows = pull.entities.filter(e => e.type === 'workflow').length;
          const skills = pull.entities.filter(e => e.type === 'skill').length;
          const rules = pull.entities.filter(e => e.type === 'rule').length;
          const knowledge = pull.namespaces.length;
          const nodes = pull.namespaces.reduce((sum, ns) => sum + ns.node_count, 0);

          console.log('  ' + padDots('Agents', String(agents)));
          console.log('  ' + padDots('Workflows', String(workflows)));
          console.log('  ' + padDots('Skills', String(skills)));
          console.log('  ' + padDots('Rules', String(rules)));
          console.log('  ' + padDots('Knowledge', `${knowledge} namespaces (${nodes.toLocaleString()} nodes)`));
        } catch {
          countSpinner.stop();
          console.log('  ' + chalk.yellow('Could not fetch entity counts.'));
        }
      }

      console.log();
      console.log(chalk.dim("Run 'starmynd diff' for local changes."));
      console.log();
    });
}

function padDots(label: string, value: string, width: number = 30): string {
  const combined = label.length + value.length;
  const dotsNeeded = width - combined;
  const dots = dotsNeeded > 2 ? ' ' + '.'.repeat(dotsNeeded - 2) + ' ' : '  ';
  return label + ':  ' + chalk.dim(dots) + chalk.white(value);
}
