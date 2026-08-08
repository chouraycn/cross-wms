/**
 * browser 命令
 * 浏览器自动化 (open/screenshot/navigate)
 *
 * 参考 openclaw browser-cli，提供浏览器自动化操作。
 * 使用模拟实现，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type BrowserOptions = {
  json?: boolean;
};

interface BrowserSession {
  id: string;
  url: string;
  title?: string;
  status: "active" | "closed";
  createdAt: string;
}

const BROWSER_SESSIONS: Map<string, BrowserSession> = new Map();

function openUrl(url: string): BrowserSession {
  const id = `br_${Date.now().toString(36)}`;
  const session: BrowserSession = {
    id,
    url,
    title: `Page: ${url}`,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  BROWSER_SESSIONS.set(id, session);
  return session;
}

function takeScreenshot(url: string): { success: boolean; path: string; message: string } {
  return {
    success: true,
    path: `/tmp/cdfknow-screenshot-${Date.now()}.png`,
    message: `已捕获 ${url} 的截图`,
  };
}

function navigateTo(id: string, url: string): BrowserSession | undefined {
  const session = BROWSER_SESSIONS.get(id);
  if (!session) {
    return undefined;
  }
  session.url = url;
  session.title = `Page: ${url}`;
  return session;
}

function closeSession(id: string): boolean {
  const session = BROWSER_SESSIONS.get(id);
  if (!session) {
    return false;
  }
  session.status = "closed";
  return true;
}

function listSessions(): BrowserSession[] {
  return Array.from(BROWSER_SESSIONS.values()).filter((s) => s.status === "active");
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

export function registerBrowserCommand(program: Command): void {
  const browserCmd = program
    .command("browser")
    .description("浏览器自动化 (open/screenshot/navigate/list)");

  browserCmd
    .command("open <url>")
    .description("打开 URL")
    .option("--json", "JSON 输出格式")
    .action((url: string, options: BrowserOptions) => {
      const session = openUrl(url);
      logger.info(`已打开浏览器会话: ${session.id} -> ${url}`);
      if (options.json) {
        logger.info(formatJsonOutput(session));
      }
    });

  browserCmd
    .command("screenshot <url>")
    .description("捕获 URL 截图")
    .option("--json", "JSON 输出格式")
    .action((url: string, options: BrowserOptions) => {
      const result = takeScreenshot(url);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(result.success ? `✓ ${result.message} -> ${result.path}` : `✗ ${result.message}`);
      }
    });

  browserCmd
    .command("navigate <id> <url>")
    .description("导航到新 URL")
    .option("--json", "JSON 输出格式")
    .action((id: string, url: string, options: BrowserOptions) => {
      const session = navigateTo(id, url);
      if (!session) {
        logger.error(`未找到浏览器会话: ${id}`);
        return;
      }
      logger.info(`已导航到: ${url}`);
      if (options.json) {
        logger.info(formatJsonOutput(session));
      }
    });

  browserCmd
    .command("close <id>")
    .description("关闭浏览器会话")
    .action((id: string) => {
      const closed = closeSession(id);
      if (closed) {
        logger.info(`已关闭浏览器会话: ${id}`);
      } else {
        logger.error(`未找到浏览器会话: ${id}`);
      }
    });

  browserCmd
    .command("list")
    .description("列出活跃的浏览器会话")
    .option("--json", "JSON 输出格式")
    .action((options: BrowserOptions) => {
      const sessions = listSessions();
      if (options.json) {
        logger.info(formatJsonOutput(sessions));
      } else {
        logger.info(`活跃会话: ${sessions.length}`);
        for (const s of sessions) {
          logger.info(`  ${s.id} -> ${s.url}`);
        }
      }
    });

  // 默认 list
  browserCmd
    .option("--json", "JSON 输出格式")
    .action((options: BrowserOptions) => {
      const sessions = listSessions();
      if (options.json) {
        logger.info(formatJsonOutput(sessions));
      } else {
        logger.info(`活跃会话: ${sessions.length}`);
      }
    });
}
