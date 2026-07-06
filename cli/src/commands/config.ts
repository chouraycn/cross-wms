import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';

export const configCommand = new Command('config')
  .description('Manage configuration')
  .version('1.0.0');

const getConfigPath = () => {
  return path.join(process.cwd(), 'config.json');
};

configCommand
  .command('show')
  .description('Show current configuration')
  .action(async () => {
    try {
      const configPath = getConfigPath();
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      console.log('Error reading config:', (error as Error).message);
    }
  });

configCommand
  .command('set <key> <value>')
  .description('Set a config value')
  .action(async (key, value) => {
    try {
      const configPath = getConfigPath();
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      
      const keys = key.split('.');
      let current = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`Set ${key} = ${value}`);
    } catch (error) {
      console.log('Error setting config:', (error as Error).message);
    }
  });

configCommand
  .command('get <key>')
  .description('Get a config value')
  .action(async (key) => {
    try {
      const configPath = getConfigPath();
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      
      const keys = key.split('.');
      let current = config;
      for (const k of keys) {
        if (!current) {
          console.log('Key not found');
          return;
        }
        current = current[k];
      }
      
      console.log(current);
    } catch (error) {
      console.log('Error getting config:', (error as Error).message);
    }
  });

configCommand
  .command('reset')
  .description('Reset config to defaults')
  .action(async () => {
    try {
      const configPath = getConfigPath();
      const defaultConfig = {
        app: {
          name: 'cross-wms',
          port: 3000,
        },
        models: {
          default: 'gpt-4',
        },
      };
      
      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      console.log('Config reset to defaults');
    } catch (error) {
      console.log('Error resetting config:', (error as Error).message);
    }
  });

configCommand
  .command('init')
  .description('Initialize config file')
  .action(async () => {
    try {
      const configPath = getConfigPath();
      
      if (await fs.access(configPath).then(() => true).catch(() => false)) {
        console.log('Config file already exists');
        return;
      }
      
      const defaultConfig = {
        app: {
          name: 'cross-wms',
          port: 3000,
        },
        models: {
          default: 'gpt-4',
        },
        agents: {
          defaults: {
            maxConcurrent: 10,
            model: 'gpt-4',
          },
        },
        logging: {
          level: 'info',
          redactSensitive: true,
        },
      };
      
      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      console.log('Config file created:', configPath);
    } catch (error) {
      console.log('Error initializing config:', (error as Error).message);
    }
  });