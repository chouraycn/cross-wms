import { Command } from 'commander';

export const versionCommand = new Command('version')
  .description('Show version information')
  .version('1.0.0')
  .action(() => {
    console.log('cross-wms CLI v1.0.0');
    console.log('');
    console.log('Packages:');
    console.log('  @cross-wms/plugin-sdk: 1.0.0');
    console.log('  @cross-wms/agent-core: 1.0.0');
    console.log('  @cross-wms/llm-core: 1.0.0');
    console.log('  @cross-wms/memory-host-sdk: 1.0.0');
    console.log('  @cross-wms/skill-core: 1.0.0');
    console.log('');
    console.log('Node.js:', process.version);
    console.log('Platform:', process.platform);
    console.log('Architecture:', process.arch);
  });