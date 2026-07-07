import { Command } from 'commander';
import { UnifiedPluginRegistry } from '@cdf-know/plugin-sdk';
import { extensionLoader } from '../../../../extensions/index.js';
import { AgentHarness } from '@cdf-know/agent-core';

export const statusCommand = new Command('status')
  .description('Show system status')
  .version('1.0.0');

statusCommand
  .command('all')
  .description('Show all status')
  .action(async () => {
    const pluginRegistry = UnifiedPluginRegistry.getInstance();
    const plugins = pluginRegistry.listPlugins();
    const extensions = extensionLoader.list();
    const harness = new AgentHarness();
    
    console.log('=== cdf-know Status ===');
    console.log('');
    
    console.log('Plugins:');
    console.log(`  Total: ${plugins.length}`);
    console.log(`  Active: ${plugins.filter(p => p.status === 'activated').length}`);
    console.log(`  Registered: ${plugins.filter(p => p.status === 'registered').length}`);
    console.log('');
    
    console.log('Extensions:');
    console.log(`  Total: ${extensions.length}`);
    console.log(`  Enabled: ${extensions.filter(e => e.enabled).length}`);
    console.log('');
    
    console.log('Agents:');
    console.log(`  Active runs: ${harness.getActiveRunCount()}`);
    console.log('');
    
    console.log('System:');
    console.log(`  Node.js: ${process.version}`);
    console.log(`  Platform: ${process.platform}`);
    console.log(`  Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  });

statusCommand
  .command('plugins')
  .description('Show plugin status')
  .action(async () => {
    const pluginRegistry = UnifiedPluginRegistry.getInstance();
    const plugins = pluginRegistry.listPlugins();
    
    console.log('Plugin Status:');
    for (const plugin of plugins) {
      console.log(`  ${plugin.id}: ${plugin.status}`);
    }
  });

statusCommand
  .command('extensions')
  .description('Show extension status')
  .action(async () => {
    const extensions = extensionLoader.list();
    
    console.log('Extension Status:');
    for (const ext of extensions) {
      console.log(`  ${ext.id}: ${ext.enabled ? 'enabled' : 'disabled'}`);
    }
  });

statusCommand
  .command('agents')
  .description('Show agent status')
  .action(async () => {
    const harness = new AgentHarness();
    
    console.log('Agent Status:');
    console.log(`  Active runs: ${harness.getActiveRunCount()}`);
    
    const runs = harness.getActiveRuns();
    if (runs.length > 0) {
      console.log('  Active run details:');
      for (const run of runs) {
        console.log(`    - ${run.runId} (session: ${run.sessionId})`);
      }
    }
  });