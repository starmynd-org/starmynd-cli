#!/usr/bin/env node

import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth.js';
import { registerSyncCommands } from './commands/sync.js';
import { registerKbCommands } from './commands/kb.js';
import { registerCrudCommands } from './commands/crud.js';
import { registerValidateCommands, registerInitCommand } from './commands/validate.js';
import { registerStatusCommand } from './commands/status.js';

const program = new Command();

program
  .name('starmynd')
  .description('StarMynd CLI - Manage your workspace from the terminal')
  .version('0.1.3');

// Register all command groups
registerAuthCommands(program);
registerSyncCommands(program);
registerKbCommands(program);
registerCrudCommands(program);
registerValidateCommands(program);
registerInitCommand(program);
registerStatusCommand(program);

program.parse();
