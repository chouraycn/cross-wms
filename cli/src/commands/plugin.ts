import { Command } from 'commander';
import { UnifiedPluginRegistry } from '@cross-wms/plugin-sdk';

export const pluginCommand = new Command('plugin')
  .description('Manage plugins')
  .version('1.0.0');

pluginCommand
  .command('list')
  .description('List all plugins')
  .action(async () => {
    const registry = UnifiedPluginRegistry.getInstance();
    const plugins = registry.listPlugins();
    
    console.log('Plugins:');
    for (const plugin of plugins) {
      console.log(`  ${plugin.id} - ${plugin.name} (${plugin.status})`);
    }
  });

pluginCommand
  .command('enable <pluginId>')
  .description('Enable a plugin')
  .action(async (pluginId) => {
    const registry = UnifiedPluginRegistry.getInstance();
    const result = await registry.activate(pluginId);
    
    if (result) {
      console.log(`Plugin ${pluginId} enabled`);
    } else {
      console.log(`Failed to enable plugin ${pluginId}`);
    }
  });

pluginCommand
  .command('disable <pluginId>')
  .description('Disable a plugin')
  .action(async (pluginId) => {
    const registry = UnifiedPluginRegistry.getInstance();
    const result = await registry.deactivate(pluginId);
    
    if (result) {
      console.log(`Plugin ${pluginId} disabled`);
    } else {
      console.log(`Failed to disable plugin ${pluginId}`);
    }
  });

pluginCommand
  .command('info <pluginId>')
  .description('Get plugin info')
  .action(async (pluginId) => {
    const registry = UnifiedPluginRegistry.getInstance();
    const plugin = registry.getPlugin(pluginId);
    
    if (plugin) {
      console.log(JSON.stringify(plugin, null, 2));
    } else {
      console.log(`Plugin ${pluginId} not found`);
    }
  });

pluginCommand
  .command('stats')
  .description('Get plugin stats')
  .action(async () => {
    const registry = UnifiedPluginRegistry.getInstance();
    const stats = registry.getStats();
    
    console.log(JSON.stringify(stats, null, 2));
  });