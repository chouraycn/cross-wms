import { Command } from 'commander';
import { UnifiedPluginRegistry } from '@cdf-know/plugin-sdk';

export const extensionCommand = new Command('extension')
  .description('Manage extensions')
  .version('1.0.0');

extensionCommand
  .command('list')
  .description('List extension-provided capabilities registered with the plugin SDK')
  .action(async () => {
    const registry = UnifiedPluginRegistry.getInstance();
    const ids = registry.listPluginIds();

    console.log('Extensions (registered with plugin SDK):');
    if (ids.length === 0) {
      console.log('  (none - load extensions via the server runtime to populate the registry)');
      return;
    }
    for (const id of ids) {
      const runtime = registry.getRuntime(id);
      const name = runtime?.definition.name ?? id;
      const status = runtime?.status ?? 'unknown';
      console.log(`  ${id} - ${name} (${status})`);
    }
  });

extensionCommand
  .command('channels')
  .description('List extension-provided channels')
  .action(async () => {
    const registry = UnifiedPluginRegistry.getInstance();
    const channels = registry.getChannels();

    console.log('Channels:');
    if (channels.length === 0) {
      console.log('  (none)');
      return;
    }
    for (const ch of channels) {
      console.log(`  ${ch.pluginId}: ${ch.kind}`);
    }
  });

extensionCommand
  .command('providers')
  .description('List extension-provided LLM providers')
  .action(async () => {
    const registry = UnifiedPluginRegistry.getInstance();
    const providers = registry.getProviders();

    console.log('Providers:');
    if (providers.length === 0) {
      console.log('  (none)');
      return;
    }
    for (const p of providers) {
      console.log(`  ${p.pluginId}: ${p.kind}`);
    }
  });

extensionCommand
  .command('tools')
  .description('List extension-provided tools')
  .action(async () => {
    const registry = UnifiedPluginRegistry.getInstance();
    const tools = registry.getActiveTools();

    console.log('Tools:');
    if (tools.length === 0) {
      console.log('  (none)');
      return;
    }
    for (const t of tools) {
      console.log(`  ${t.pluginId}: ${t.name} - ${t.description}`);
    }
  });
