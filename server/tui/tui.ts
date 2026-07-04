import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import type { TuiOptions, TuiResult, TuiBackend, TuiCommandContext } from './types.js';
import { colorize, bold, dim } from './theme.js';
import { themeManager } from './themeManager.js';
import { executeCommand } from './commands.js';
import { logger } from '../logger.js';

export async function runTui(
  backend: TuiBackend,
  options: TuiOptions = {},
): Promise<TuiResult> {
  // 使用主题管理器
  const theme = themeManager.getTheme();
  let sessionId: string | null = options.sessionId ?? null;
  const exitCode = 0;
  let isRunning = true;

  // 创建 readline 接口
  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    prompt: colorize('❯ ', theme.colors.primary),
    terminal: true,
    historySize: options.historySize ?? 100,
  });

  // 当前对话的 AbortController
  let currentAbort: AbortController | null = null;

  // 打印欢迎信息
  printWelcome(theme);

  // 如果有指定会话，加载历史
  if (sessionId) {
    try {
      const history = await backend.loadHistory(sessionId);
      for (const msg of history) {
        if (msg.role === 'user') {
          printUserMessage(msg.content, theme);
        } else {
          printAssistantMessage(msg.content, theme);
        }
      }
    } catch (err) {
      logger.warn(`[TUI] 加载会话历史失败: ${err}`);
    }
  }

  // 命令上下文
  const ctx: TuiCommandContext = {
    backend,
    get sessionId() { return sessionId; },
    setSessionId: (id) => { sessionId = id; },
    print: (text) => console.log(text),
    printError: (text) => console.error(colorize(text, theme.colors.error)),
    exit: () => {
      isRunning = false;
      rl.close();
    },
  };

  // 行输入处理
  rl.on('line', async (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    // 命令处理
    if (trimmed.startsWith('/')) {
      await executeCommand(trimmed, ctx);
      if (isRunning) rl.prompt();
      return;
    }

    // 普通消息
    if (!sessionId) {
      try {
        const session = await backend.createSession(trimmed.slice(0, 30));
        sessionId = session.id;
      } catch (err) {
        console.error(colorize(`创建会话失败: ${err}`, theme.colors.error));
        rl.prompt();
        return;
      }
    }

    // 打印用户消息
    printUserMessage(trimmed, theme);

    // 发送消息
    currentAbort = new AbortController();
    let assistantText = '';
    let thinkingText = '';
    let isFirstChunk = true;

    try {
      const messages = [
        ...(await backend.loadHistory(sessionId!).catch(() => [])),
        { role: 'user', content: trimmed },
      ];

      for await (const event of backend.sendChat(messages, currentAbort.signal)) {
        switch (event.type) {
          case 'thinking':
            if (event.content) {
              if (isFirstChunk) {
                process.stdout.write(dim('💭 '));
                isFirstChunk = false;
              }
              thinkingText += event.content;
              process.stdout.write(dim(event.content));
            }
            break;
          case 'assistant_start':
            if (thinkingText) {
              process.stdout.write('\n');
              thinkingText = '';
            }
            process.stdout.write(colorize('🤖 ', theme.colors.assistant));
            break;
          case 'assistant_chunk':
            if (event.content) {
              assistantText += event.content;
              process.stdout.write(event.content);
            }
            break;
          case 'tool_call':
            if (event.toolName) {
              process.stdout.write('\n');
              process.stdout.write(colorize(`  🔧 ${event.toolName}`, theme.colors.tool));
              if (event.toolArgs && Object.keys(event.toolArgs).length > 0) {
                process.stdout.write(dim(` ${JSON.stringify(event.toolArgs)}`));
              }
              process.stdout.write('\n');
            }
            break;
          case 'tool_result':
            if (event.toolResult) {
              const result = event.toolResult.length > 200
                ? event.toolResult.slice(0, 200) + dim('...')
                : event.toolResult;
              process.stdout.write(colorize(`  ↳ ${result}`, theme.colors.muted));
              process.stdout.write('\n');
            }
            break;
          case 'assistant_end':
            process.stdout.write('\n\n');
            break;
          case 'error':
            process.stdout.write('\n');
            console.error(colorize(`❌ ${event.error || '未知错误'}`, theme.colors.error));
            process.stdout.write('\n');
            break;
        }
      }
    } catch (err) {
      if (currentAbort.signal.aborted) {
        process.stdout.write(colorize('\n[已中断]\n\n', theme.colors.warning));
      } else {
        console.error(colorize(`\n❌ 错误: ${err instanceof Error ? err.message : String(err)}\n`, theme.colors.error));
      }
    } finally {
      currentAbort = null;
    }

    rl.prompt();
  });

  // Ctrl+C 处理
  let ctrlCCount = 0;
  rl.on('SIGINT', () => {
    if (currentAbort) {
      currentAbort.abort();
      ctrlCCount = 0;
      return;
    }

    ctrlCCount++;
    if (ctrlCCount >= 2) {
      isRunning = false;
      rl.close();
    } else {
      process.stdout.write(colorize('\n再按一次 Ctrl+C 退出，或输入 /exit\n', theme.colors.warning));
      rl.prompt();
    }
  });

  // 等待退出
  await new Promise<void>((resolve) => {
    rl.on('close', () => {
      resolve();
    });
  });

  return { exitCode, lastSessionId: sessionId ?? undefined };
}

function printWelcome(theme: ReturnType<typeof themeManager.getTheme>): void {
  const banner = `
  ${colorize('╔══════════════════════════════════════╗', theme.colors.primary)}
  ${colorize('║', theme.colors.primary)}     ${bold('Cross-WMS Terminal')}     ${colorize('║', theme.colors.primary)}
  ${colorize('╚══════════════════════════════════════╝', theme.colors.primary)}
  ${dim('输入消息开始对话，或输入 /help 查看命令')}
`;
  console.log(banner);
}

function printUserMessage(text: string, theme: ReturnType<typeof themeManager.getTheme>): void {
  console.log(colorize(`❯ ${text}`, theme.colors.user));
}

function printAssistantMessage(text: string, theme: ReturnType<typeof themeManager.getTheme>): void {
  console.log(colorize(`🤖 ${text}`, theme.colors.assistant));
}
