import { Command } from 'commander';
import { AgentHarness } from '@cdf-know/agent-core';

export const agentCommand = new Command('agent')
  .description('Manage agents')
  .version('1.0.0');

const harness = new AgentHarness();

agentCommand
  .command('run')
  .description('Run an agent')
  .option('--model <model>', 'Model to use')
  .option('--message <message>', 'Input message')
  .action(async (options) => {
    const result = await harness.run({
      model: options.model || 'default',
      messages: [{ role: 'user', content: options.message || '' }],
    }, {
      sessionId: 'cli-session',
    });
    
    console.log('Result:', result.content);
    console.log('Iterations:', result.iterations);
    console.log('Duration:', result.duration, 'ms');
  });

agentCommand
  .command('tool <toolName>')
  .description('Execute a tool')
  .option('--arg <key=value>', 'Tool arguments')
  .action(async (toolName, options) => {
    const args: Record<string, unknown> = {};
    
    if (options.arg) {
      const [key, value] = options.arg.split('=');
      args[key] = value;
    }
    
    const result = await harness.executeTool(toolName, args, {
      sessionId: 'cli-session',
    });
    
    if (result.success) {
      console.log('Result:', result.result);
    } else {
      console.log('Error:', result.error);
    }
  });

agentCommand
  .command('status')
  .description('Get agent status')
  .action(() => {
    console.log('Active runs:', harness.getActiveRunCount());
    console.log('Active runs details:', harness.getActiveRuns());
  });

agentCommand
  .command('stop <runId>')
  .description('Stop an active run')
  .action((runId) => {
    const result = harness.stopRun(runId);
    
    if (result) {
      console.log(`Run ${runId} stopped`);
    } else {
      console.log(`Run ${runId} not found`);
    }
  });