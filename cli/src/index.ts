#!/usr/bin/env node

import { Command } from 'commander';
import { pluginCommand } from './commands/plugin.js';
import { agentCommand } from './commands/agent.js';
import { configCommand } from './commands/config.js';
import { extensionCommand } from './commands/extension.js';
import { versionCommand } from './commands/version.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('crosswms')
  .description('CLI tools for cdf-know')
  .version('1.0.0');

program.addCommand(pluginCommand);
program.addCommand(agentCommand);
program.addCommand(configCommand);
program.addCommand(extensionCommand);
program.addCommand(versionCommand);
program.addCommand(statusCommand);

program.parse();