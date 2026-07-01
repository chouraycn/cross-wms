/**
 * chat 命令
 * 启动交互式聊天会话
 */

import type { Command } from "commander";
import * as readline from "readline";
import { logger } from "../../logger.js";

export type ChatOptions = {
  model?: string;
  session?: string;
  json?: boolean;
};

/** 模拟会话存储 */
const SESSION_STORE: Map<string, ChatSession> = new Map();

interface ChatSession {
  id: string;
  model: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

/** 创建新会话 */
function createSession(model: string): ChatSession {
  const id = `session-${Date.now()}`;
  const now = new Date().toISOString();
  const session: ChatSession = {
    id,
    model,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  SESSION_STORE.set(id, session);
  return session;
}

/** 获取会话 */
function getSession(id: string): ChatSession | undefined {
  return SESSION_STORE.get(id);
}

/** 模拟 AI 响应 */
function generateAIResponse(message: string, model: string): string {
  // 实际实现应调用 AI 模型
  const responses = [
    `收到您的消息: "${message}"。这是使用 ${model} 模型的模拟响应。`,
    `您好！我正在使用 ${model} 模型。您的问题是: ${message}`,
    `[${model}] 感谢您的提问，这是模拟的 AI 响应。`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 启动交互式聊天 */
async function startInteractiveChat(session: ChatSession, options: ChatOptions): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${session.model}> `,
  });

  logger.info("");
  logger.info(`  CDFKnow 交互式聊天`);
  logger.info(`  会话ID: ${session.id}`);
  logger.info(`  模型: ${session.model}`);
  logger.info(`  输入 'exit' 或 'quit' 退出，'clear' 清空会话`);
  logger.info("");

  rl.prompt();

  return new Promise((resolve) => {
    rl.on("line", async (line) => {
      const input = line.trim();

      if (!input) {
        rl.prompt();
        return;
      }

      if (input === "exit" || input === "quit") {
        logger.info("\n  会话已结束。");
        rl.close();
        resolve();
        return;
      }

      if (input === "clear") {
        session.messages = [];
        session.updatedAt = new Date().toISOString();
        logger.info("  会话已清空。\n");
        rl.prompt();
        return;
      }

      if (input === "history") {
        if (session.messages.length === 0) {
          logger.info("  暂无历史消息。\n");
        } else {
          logger.info("\n  历史消息:");
          for (const msg of session.messages) {
            const role = msg.role === "user" ? "您" : msg.role === "assistant" ? "AI" : "系统";
            logger.info(`    [${role}] ${msg.content}`);
          }
          logger.info("");
        }
        rl.prompt();
        return;
      }

      if (input === "help") {
        logger.info("");
        logger.info("  可用命令:");
        logger.info("    exit/quit  - 退出聊天");
        logger.info("    clear      - 清空会话");
        logger.info("    history    - 查看历史消息");
        logger.info("    help       - 显示帮助");
        logger.info("");
        rl.prompt();
        return;
      }

      // 添加用户消息
      const userMessage: ChatMessage = {
        role: "user",
        content: input,
        timestamp: new Date().toISOString(),
      };
      session.messages.push(userMessage);

      // 生成 AI 响应
      const aiResponse = generateAIResponse(input, session.model);
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: aiResponse,
        timestamp: new Date().toISOString(),
      };
      session.messages.push(assistantMessage);

      // 输出响应
      if (options.json) {
        logger.info(formatJsonOutput({
          type: "message",
          role: "assistant",
          content: aiResponse,
          session: session.id,
        }));
      } else {
        logger.info(`\n  AI: ${aiResponse}\n`);
      }

      session.updatedAt = new Date().toISOString();
      rl.prompt();
    });

    rl.on("close", () => {
      resolve();
    });
  });
}

/**
 * 注册 chat 命令
 */
export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("启动交互式聊天会话")
    .option("-m, --model <model>", "指定模型", "qwen-plus")
    .option("-s, --session <id>", "恢复已有会话")
    .option("--json", "JSON 输出格式")
    .action(async (options: ChatOptions) => {
      let session: ChatSession;

      if (options.session) {
        // 恢复已有会话
        const existing = getSession(options.session);
        if (!existing) {
          if (options.json) {
            logger.info(formatJsonOutput({
              error: "session_not_found",
              sessionId: options.session,
            }));
          } else {
            logger.error(`会话 ${options.session} 不存在`);
          }
          process.exit(1);
          return;
        }
        session = existing;
        if (!options.json) {
          logger.info(`已恢复会话: ${session.id}`);
        }
      } else {
        // 创建新会话
        session = createSession(options.model || "qwen-plus");
        if (!options.json) {
          logger.info(`已创建新会话: ${session.id}`);
        }
      }

      await startInteractiveChat(session, options);
    });
}