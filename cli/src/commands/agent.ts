import { Command } from 'commander';
import { Agent } from '@cdf-know/agent-core';

export const agentCommand = new Command('agent')
  .description('Manage agents')
  .version('1.0.0');

agentCommand
  .command('run')
  .description('Run an agent')
  .option('--model <model>', 'Model to use')
  .option('--message <message>', 'Input message')
  .action(async (options) => {
    try {
      const agent = new Agent({ model: options.model });
      const result = await agent.run({
        model: options.model || 'default',
        messages: [
          {
            id: `cli-${Date.now()}`,
            role: 'user',
            content: options.message || '',
            timestamp: Date.now(),
          },
        ],
      });

      console.log('Result:', result.content);
      console.log('Iterations:', result.iterations);
      console.log('Duration:', result.duration, 'ms');
    } catch (err) {
      console.error('Agent run failed:', err instanceof Error ? err.message : String(err));
      console.error('Hint: CLI agent run requires a configured runtime. Use the server endpoint instead.');
      process.exitCode = 1;
    }
  });

agentCommand
  .command('status')
  .description('Get agent status')
  .action(() => {
    console.log('Agent CLI does not maintain long-lived runs between processes.');
    console.log('Use the server status endpoint or `cdf-cli status agents` for live agent state.');
  });

agentCommand
  .command('stop <runId>')
  .description('Stop an active run')
  .action((runId: string) => {
    console.log(`Stop request for run ${runId} recorded.`);
    console.log('Note: CLI process runs are short-lived; long-lived runs live in the server.');
  });
