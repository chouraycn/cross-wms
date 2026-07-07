import { Command } from 'commander';

export const versionCommand = new Command('version')
  .description('Show version information')
  .version('1.0.0')
  .action(() => {
    console.log('cdf-know CLI v1.0.0');
    console.log('');
    console.log('Packages:');
    console.log('  @cdf-know/plugin-sdk: 1.0.0');
    console.log('  @cdf-know/agent-core: 1.0.0');
    console.log('  @cdf-know/llm-core: 1.0.0');
    console.log('  @cdf-know/memory-host-sdk: 1.0.0');
    console.log('  @cdf-know/skill-core: 1.0.0');
    console.log('');
    console.log('Node.js:', process.version);
    console.log('Platform:', process.platform);
    console.log('Architecture:', process.arch);
  });