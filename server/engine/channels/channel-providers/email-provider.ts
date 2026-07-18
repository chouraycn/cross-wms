import { spawn } from "node:child_process";
import { logger } from "../../../logger.js";
import type { ChannelId, AccountId, ChannelMeta, ChannelCapabilities, AppConfig } from "../../../channels/types.js";
import type { ChannelMessage, ChannelMessageSendResult } from "../../../channels/message/types.js";

interface EmailAccountConfig {
  himalayaAccount?: string;
  emailAddress?: string;
  pollIntervalMs?: number;
  pollFolder?: string;
}

const HIMALAYA_BIN = "himalaya";

function runHimalaya(args: string[], options?: { timeoutMs?: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(HIMALAYA_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeoutMs = options?.timeoutMs ?? 30000;

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`himalaya 命令超时（${timeoutMs}ms）`));
    }, timeoutMs);

    child.stdin?.end();
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("未找到 himalaya 可执行文件，请先安装：brew install himalaya"));
      } else {
        reject(err);
      }
    });

    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      if (code !== 0) {
        reject(new Error(`himalaya 退出码 ${code}: ${stderr || stdout}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

export class EmailChannelProvider {
  private channelId: ChannelId;
  private accountId: AccountId;
  private config: AppConfig;
  private accountConfig: EmailAccountConfig;

  constructor(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }) {
    this.channelId = options.channelId;
    this.accountId = options.accountId;
    this.config = options.config;
    this.accountConfig = this.resolveAccountConfig();
  }

  private resolveAccountConfig(): EmailAccountConfig {
    const emailAccounts = (this.config.emailAccounts as Record<string, EmailAccountConfig>) || {};
    return emailAccounts[this.accountId] || {};
  }

  getMeta(): ChannelMeta {
    return {
      id: this.channelId,
      label: "邮件",
      selectionLabel: "国内邮件服务（QQ/网易/阿里云/腾讯企业邮箱）",
      blurb: "基于 himalaya CLI 收发国内邮件",
      aliases: ["email", "mail", "smtp", "imap"],
      markdownCapable: true,
    };
  }

  getCapabilities(): ChannelCapabilities {
    return {
      chatTypes: ["direct"],
      media: false,
      reactions: false,
      threads: true,
      polls: false,
      mentions: false,
      voice: false,
      video: false,
      typing: false,
    };
  }

  async sendMessage(message: ChannelMessage): Promise<ChannelMessageSendResult> {
    const to = String(message.metadata?.to ?? "");
    const subject = String(message.metadata?.subject ?? "(无主题)");
    const body = message.content || "";

    if (!to) {
      return { success: false, error: "未指定收件人 (message.metadata.to)" };
    }

    try {
      const acc = this.accountConfig.himalayaAccount || this.accountId;
      const args = ["-a", acc, "message", "send", "--to", to, "--subject", subject, "--body", body];
      await runHimalaya(args, { timeoutMs: 30000 });

      logger.info(`[ChannelProvider:Email] 邮件已发送至 ${to}`);
      return { success: true, messageId: message.id };
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`[ChannelProvider:Email] 发送失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  async healthCheck(): Promise<boolean> {
    return !!(this.accountConfig.himalayaAccount || this.accountId);
  }
}