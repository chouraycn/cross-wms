import { Command } from 'commander';
import { UnifiedPluginRegistry } from '@cdf-know/plugin-sdk';

export const statusCommand = new Command('status')
  .description('Show system status')
  .version('1.0.0');

statusCommand
  .command('all')
  .description('Show all status')
  .action(async () => {
    const registry = UnifiedPluginRegistry.getInstance();
    const ids = registry.listPluginIds();
    const health = registry.getHealth();

    console.log('=== cdf-know Status ===');
    console.log('');

    console.log('Plugins:');
    console.log(`  Total: ${health.total}`);
    console.log(`  Active: ${health.activated}`);
    if (health.errors.length > 0) {
      console.log(`  Errors:`);
      for (const err of health.errors) {
        console.log(`    - ${err}`);
      }
    }
    console.log('');

    console.log('Capabilities:');
    const tools = registry.getActiveTools();
    const channels = registry.getChannels();
    const providers = registry.getProviders();
    console.log(`  Tools: ${tools.length}`);
    console.log(`  Channels: ${channels.length}`);
    console.log(`  Providers: ${providers.length}`);
    console.log('');

    console.log('System:');
    console.log(`  Node.js: ${process.version}`);
    console.log(`  Platform: ${process.platform}`);
    console.log(`  Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
    console.log(`  Registered plugin IDs: ${ids.join(', ') || '(none)'}`);
  });

statusCommand
  .command('plugins')
  .description('Show plugin status')
  .action(async () => {
    const registry = UnifiedPluginRegistry.getInstance();
    const ids = registry.listPluginIds();

    console.log('Plugin Status:');
    if (ids.length === 0) {
      console.log('  (no plugins registered - load via the server runtime)');
      return;
    }
    for (const id of ids) {
      const runtime = registry.getRuntime(id);
      const status = runtime?.status ?? 'unknown';
      console.log(`  ${id}: ${status}`);
    }
  });

statusCommand
  .command('extensions')
  .description('Show extension-provided capabilities')
  .action(async () => {
    const registry = UnifiedPluginRegistry.getInstance();
    const channels = registry.getChannels();
    const providers = registry.getProviders();
    const tools = registry.getActiveTools();

    console.log('Extension Capabilities:');
    console.log(`  Channels: ${channels.length}`);
    console.log(`  Providers: ${providers.length}`);
    console.log(`  Tools: ${tools.length}`);
  });

statusCommand
  .command('agents')
  .description('Show agent status')
  .action(async () => {
    console.log('Agent Status:');
    console.log('  Agent runs live in the server process. Use the server status endpoint for live data.');
  });
