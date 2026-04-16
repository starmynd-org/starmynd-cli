import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import ora from 'ora';
import yaml from 'js-yaml';
import * as api from '../lib/api.js';
import { parseEntityFile } from '../lib/files.js';
import { validateEntity } from '../lib/validation.js';
import type { CliEntityType, CliPushEntity } from '../types/cli.js';

const VALID_ENTITY_TYPES = ['agent', 'workflow', 'knowledge', 'skill', 'rule'] as const;
const VALID_LIST_TYPES = ['agents', 'workflows', 'knowledge', 'skills', 'rules', 'catalogs'] as const;

export function registerCrudCommands(program: Command): void {
  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  program
    .command('create')
    .description('Create a new entity from a YAML file')
    .argument('<type>', `Entity type: ${VALID_ENTITY_TYPES.join(', ')}`)
    .requiredOption('--from <path>', 'YAML or markdown file to create from')
    .action(async (type: string, opts: { from: string }) => {
      if (!(VALID_ENTITY_TYPES as readonly string[]).includes(type)) {
        console.log(chalk.red(`Invalid entity type: ${type}. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`));
        process.exit(1);
      }

      if (!fs.existsSync(opts.from)) {
        console.log(chalk.red(`File not found: ${opts.from}`));
        process.exit(1);
      }

      const spinner = ora(`Creating ${type}...`).start();

      try {
        const entity = parseEntityFile(opts.from);
        entity.type = type as CliEntityType;

        // Validate locally first
        const errors = validateEntity(entity);
        if (errors.length > 0) {
          spinner.fail('Validation failed');
          for (const err of errors) {
            console.log(chalk.red(`  ${err.field}: ${err.message}`));
          }
          process.exit(1);
        }

        const result = await api.push({ entities: [entity] });

        if (result.errors.length > 0) {
          spinner.fail('Create failed');
          for (const err of result.errors) {
            console.log(chalk.red(`  ${err.message}`));
          }
          process.exit(1);
        }

        spinner.succeed(`Created ${type}: ${entity.slug} (${entity.title})`);
      } catch (err) {
        spinner.fail(`Create failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------
  program
    .command('list')
    .description('List entities by type')
    .argument('<type>', `Entity type: ${VALID_LIST_TYPES.join(', ')}`)
    .option('--status <status>', 'Filter by status (active, draft, archived)')
    .action(async (type: string, opts: { status?: string }) => {
      if (!(VALID_LIST_TYPES as readonly string[]).includes(type)) {
        console.log(chalk.red(`Invalid type: ${type}. Must be one of: ${VALID_LIST_TYPES.join(', ')}`));
        process.exit(1);
      }

      const spinner = ora(`Listing ${type}...`).start();

      try {
        // Normalize plural to singular for API
        const entityType = type.endsWith('s') ? type.slice(0, -1) : type;
        const onlyFilter = entityType === 'catalog'
          ? undefined
          : [entityType as CliEntityType];

        const result = await api.pull({ only: onlyFilter });
        spinner.stop();

        // Special handling for knowledge: show namespaces
        if (entityType === 'knowledge' && result.namespaces && result.namespaces.length > 0) {
          console.log(chalk.bold(`\nKnowledge Namespaces (${result.namespaces.length}):\n`));
          for (const ns of result.namespaces) {
            console.log(`  ${chalk.cyan(ns.slug)} - ${ns.name} (${ns.node_count.toLocaleString()} nodes) [${ns.visibility}]`);
            if (ns.description) {
              console.log(`    ${chalk.dim(ns.description)}`);
            }
          }
          return;
        }

        let entities = result.entities;
        if (opts.status) {
          entities = entities.filter(e => e.status === opts.status);
        }

        if (entities.length === 0) {
          console.log(chalk.yellow(`No ${type} found.`));
          return;
        }

        console.log(chalk.bold(`\n${type} (${entities.length}):\n`));
        for (const entity of entities) {
          const status = entity.status === 'active'
            ? chalk.green('active')
            : entity.status === 'draft'
              ? chalk.yellow('draft')
              : chalk.dim(entity.status);

          console.log(`  ${chalk.cyan(entity.slug)} - ${entity.title} [${status}]`);
          if (entity.description) {
            console.log(`    ${chalk.dim(entity.description)}`);
          }
          if (entity.tags.length > 0) {
            console.log(`    tags: ${entity.tags.join(', ')}`);
          }
        }
      } catch (err) {
        spinner.fail(`List failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // get
  // -----------------------------------------------------------------------
  program
    .command('get')
    .description('Get a single entity by type and slug')
    .argument('<type>', `Entity type: ${VALID_ENTITY_TYPES.join(', ')}`)
    .argument('<name>', 'Entity slug')
    .option('--format <format>', 'Output format: yaml or json', 'yaml')
    .action(async (type: string, name: string, opts: { format: string }) => {
      if (!(VALID_ENTITY_TYPES as readonly string[]).includes(type)) {
        console.log(chalk.red(`Invalid entity type: ${type}. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`));
        process.exit(1);
      }

      const spinner = ora(`Fetching ${type}/${name}...`).start();

      try {
        const result = await api.pull({ only: [type as CliEntityType] });
        const entity = result.entities.find(e => e.slug === name && e.type === type);

        if (!entity) {
          spinner.fail(`Not found: ${type}/${name}`);
          process.exit(1);
        }

        spinner.stop();

        if (opts.format === 'json') {
          console.log(JSON.stringify(entity, null, 2));
        } else {
          console.log(yaml.dump(entity, { lineWidth: 120 }));
        }
      } catch (err) {
        spinner.fail(`Get failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
