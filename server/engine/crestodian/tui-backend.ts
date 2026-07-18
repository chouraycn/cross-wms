import type { CrestodianOverview } from './types.js';
import { formatCrestodianOverview } from './overview.js';
import { processCrestodianDialogue } from './dialogue.js';
import { executeCrestodianOperation } from './operations.js';
import type { CrestodianOperationType } from './types.js';

export type CrestodianTuiOptions = {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  onReady?: () => void;
  loadOverview?: () => Promise<CrestodianOverview>;
  formatOverview?: (overview: CrestodianOverview) => string;
};

export type TuiCommand =
  | { type: 'help' }
  | { type: 'status' }
  | { type: 'probes' }
  | { type: 'operation'; operation: CrestodianOperationType }
  | { type: 'chat'; message: string }
  | { type: 'exit' }
  | { type: 'unknown'; input: string };

export function parseTuiCommand(input: string): TuiCommand {
  const trimmed = input.trim().toLowerCase();

  if (trimmed === '' || trimmed === 'help' || trimmed === '?') {
    return { type: 'help' };
  }

  if (trimmed === 'status' || trimmed === 'overview') {
    return { type: 'status' };
  }

  if (trimmed === 'probes' || trimmed === 'health') {
    return { type: 'probes' };
  }

  if (trimmed === 'exit' || trimmed === 'quit' || trimmed === 'q') {
    return { type: 'exit' };
  }

  const operations: CrestodianOperationType[] = [
    'inspect',
    'repair',
    'restart',
    'reset',
    'backup',
    'restore',
    'cleanup',
    'migrate',
    'validate',
    'diagnose',
  ];

  for (const op of operations) {
    if (trimmed === op || trimmed.startsWith(`${op} `)) {
      return { type: 'operation', operation: op };
    }
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('chat ')) {
    const message = trimmed.startsWith('/')
      ? trimmed.slice(1)
      : trimmed.slice('chat '.length);
    return { type: 'chat', message };
  }

  return { type: 'unknown', input: trimmed };
}

export function getTuiHelpText(): string {
  return `Crestodian TUI - Available Commands:

  status / overview   Show system status overview
  probes / health     Run health probes
  inspect             Detailed system inspection
  repair              Attempt automatic repair
  restart             Restart services
  backup              Create backup
  restore             Restore from backup
  cleanup             Clean up stale data
  validate            Validate configuration
  diagnose            Run diagnostic tests
  chat <message>      Chat with Crestodian assistant
  help / ?            Show this help message
  exit / quit         Exit Crestodian

  You can also just type your question and Crestodian will try to help.`;
}

export async function runCrestodianTui(
  opts: CrestodianTuiOptions = {},
  runtime?: { log: (msg: string) => void; error: (msg: string) => void; exit: (code: number) => void },
): Promise<void> {
  const output = opts.output ?? process.stdout;
  const input = opts.input ?? process.stdin;
  const log = runtime?.log ?? ((msg: string) => output.write(`${msg}\n`));
  const error = runtime?.error ?? ((msg: string) => output.write(`Error: ${msg}\n`));

  log('╔══════════════════════════════════════════════════════════════╗');
  log('║            CRESTODIAN - System Guardian                      ║');
  log('╚══════════════════════════════════════════════════════════════╝');
  log('');
  log('Type "help" for available commands, or describe what you need.');
  log('');

  opts.onReady?.();

  let sessionId: string | undefined;

  const isTty = 'isTTY' in input && input.isTTY;
  if (isTty) {
    const readline = await import('node:readline');
    const rl = readline.createInterface({
      input,
      output,
      prompt: 'crestodian> ',
    });

    rl.prompt();

    rl.on('line', async (line: string) => {
      const command = parseTuiCommand(line);

      switch (command.type) {
        case 'help':
          log(getTuiHelpText());
          break;

        case 'status':
        case 'probes':
          if (opts.loadOverview) {
            try {
              const overview = await opts.loadOverview();
              log((opts.formatOverview ?? formatCrestodianOverview)(overview));
            } catch (err) {
              error(`Failed to load overview: ${String(err)}`);
            }
          } else {
            log('Overview loading not available in this mode.');
          }
          break;

        case 'operation':
          log(`Executing ${command.operation}...`);
          try {
            const result = await executeCrestodianOperation(command.operation);
            log(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
          } catch (err) {
            error(`Operation failed: ${String(err)}`);
          }
          break;

        case 'chat':
          if (opts.loadOverview) {
            try {
              const overview = await opts.loadOverview();
              const result = await processCrestodianDialogue({
                input: command.message,
                overview,
                sessionId,
              });
              sessionId = result.sessionId;
              log(result.response);
            } catch (err) {
              error(`Chat failed: ${String(err)}`);
            }
          } else {
            log('Chat requires overview loading.');
          }
          break;

        case 'exit':
          log('Goodbye!');
          rl.close();
          return;

        case 'unknown':
          if (command.input && opts.loadOverview) {
            try {
              const overview = await opts.loadOverview();
              const result = await processCrestodianDialogue({
                input: command.input,
                overview,
                sessionId,
              });
              sessionId = result.sessionId;
              log(result.response);
            } catch (err) {
              error(`Processing failed: ${String(err)}`);
            }
          } else {
            log(`Unknown command: ${command.input}. Type "help" for available commands.`);
          }
          break;
      }

      rl.prompt();
    });

    rl.on('close', () => {
      runtime?.exit?.(0);
    });
  }
}

export { formatCrestodianOverview };
