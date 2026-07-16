/**
 * Email Channel Adapter — 基于 himalaya CLI 的国内邮件渠道适配器
 *
 * 通过调用 himalaya 子进程实现邮件收发，支持 QQ邮箱、网易邮箱、阿里云企业邮箱、
 * 腾讯企业邮箱等国内邮件服务。邮件账户配置位于 ~/.config/himalaya/config.toml。
 *
 * 配置格式（AppConfig.emailAccounts）：
 *   {
 *     "qq": {
 *       himalayaAccount: "qq",       // himalaya 配置中的账户名
 *       emailAddress: "xx@qq.com",   // 邮箱地址（用于展示）
 *       pollIntervalMs: 60000,       // 轮询间隔（毫秒）
 *       pollFolder: "INBOX"          // 监听文件夹
 *     }
 *   }
 */

import { spawn } from "node:child_process";
import type { ChannelId, AccountId, ChannelMeta, ChannelCapabilities, AppConfig } from "../types.js";
import type { ChannelMessage, ChannelMessageSendResult } from "../message/types.js";
import { ChannelAdapter, ChannelAdapterFactory } from "./channel-adapter.js";

// ==================== 类型定义 ====================

interface EmailAccountConfig {
  himalayaAccount?: string;
  emailAddress?: string;
  pollIntervalMs?: number;
  pollFolder?: string;
}

interface HimalayaEnvelope {
  id: number;
  subject?: string;
  from?: { name?: string; addr?: string } | string;
  to?: Array<{ name?: string; addr?: string }> | string;
  date?: string;
}

interface HimalayaMessage {
  id: number;
  subject?: string;
  from?: { name?: string; addr?: string } | string;
  to?: Array<{ name?: string; addr?: string }> | string;
  date?: string;
  body?: { type?: string; content?: string } | string;
  parts?: Array<{ type?: string; content?: string }>;
}

// ==================== himalaya CLI 辅助 ====================

const HIMALAYA_BIN = "himalaya";
const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_POLL_FOLDER = "INBOX";

function runHimalaya(args: string[], options?: { timeoutMs?: number; stdin?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(HIMALAYA_BIN, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`himalaya 命令超时（${timeoutMs}ms）`));
    }, timeoutMs);

    if (options?.stdin !== undefined) {
      child.stdin?.write(options.stdin);
    }
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

function parseAddressField(field: unknown): string {
  if (!field) return "unknown";
  if (typeof field === "string") return field;
  if (typeof field === "object") {
    const obj = field as { name?: string; addr?: string };
    return obj.addr || obj.name || "unknown";
  }
  return "unknown";
}

function extractTextBody(message: HimalayaMessage): string {
  if (typeof message.body === "string") return message.body;
  if (message.body && typeof message.body === "object" && message.body.content) {
    return String(message.body.content);
  }
  if (Array.isArray(message.parts)) {
    const textPart = message.parts.find((p) => p.type === "text/plain" || p.type === "text");
    if (textPart?.content) return String(textPart.content);
  }
  return "";
}

// ==================== EmailChannelAdapter ====================

export class EmailChannelAdapter extends ChannelAdapter {
  private connected: boolean = false;
  private accountConfig: EmailAccountConfig;
  private seenMessageIds: Set<string> = new Set();
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }) {
    super({ channelId: options.channelId, accountId: options.accountId, config: options.config });

    const emailAccounts = (options.config.emailAccounts as Record<string, EmailAccountConfig>) || {};
    this.accountConfig = emailAccounts[options.accountId] || {};
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

  async connect(): Promise<void> {
    try {
      // 验证 himalaya 可用及账户配置存在
      await runHimalaya(["account", "list", "-o", "json"], { timeoutMs: 10_000 });
      this.connected = true;
      this.emitEvent("channel_connected");
    } catch (error) {
      this.emitEvent("channel_error", { error: (error as Error).message });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.emitEvent("channel_disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  private get accountFlag(): string[] {
    const acc = this.accountConfig.himalayaAccount || this.accountId;
    return ["-a", acc];
  }

  async sendMessage(message: ChannelMessage): Promise<ChannelMessageSendResult> {
    const to = String(message.metadata?.to ?? "");
    const subject = String(message.metadata?.subject ?? "(无主题)");
    const body = message.content || "";

    if (!to) {
      return { success: false, error: "未指定收件人 (message.metadata.to)" };
    }

    try {
      const args = [
        ...this.accountFlag,
        "message",
        "send",
        "--to",
        to,
        "--subject",
        subject,
        "--body",
        body,
      ];
      await runHimalaya(args, { timeoutMs: 30_000 });

      this.emitEvent("message_sent", { messageId: message.id, to });
      return { success: true, messageId: message.id };
    } catch (error) {
      const errorMsg = (error as Error).message;
      this.emitEvent("channel_error", { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  private async fetchNewEnvelopes(): Promise<HimalayaEnvelope[]> {
    const folder = this.accountConfig.pollFolder || DEFAULT_POLL_FOLDER;
    const args = [...this.accountFlag, "envelope", "list", "--folder", folder, "-o", "json"];
    const stdout = await runHimalaya(args, { timeoutMs: 15_000 });

    let envelopes: HimalayaEnvelope[] = [];
    try {
      const parsed = JSON.parse(stdout);
      envelopes = Array.isArray(parsed) ? parsed : parsed?.envelopes ?? [];
    } catch {
      return [];
    }

    return envelopes.filter((env) => {
      const id = String(env.id);
      if (this.seenMessageIds.has(id)) return false;
      this.seenMessageIds.add(id);
      return true;
    });
  }

  private async fetchMessageContent(envelopeId: number): Promise<string> {
    const folder = this.accountConfig.pollFolder || DEFAULT_POLL_FOLDER;
    const args = [
      ...this.accountFlag,
      "message",
      "read",
      "--folder",
      folder,
      String(envelopeId),
      "-o",
      "json",
    ];
    try {
      const stdout = await runHimalaya(args, { timeoutMs: 15_000 });
      const message = JSON.parse(stdout) as HimalayaMessage;
      return extractTextBody(message);
    } catch {
      return "";
    }
  }

  private async pollOnce(): Promise<ChannelMessage[]> {
    const newEnvelopes = await this.fetchNewEnvelopes();
    const messages: ChannelMessage[] = [];

    for (const env of newEnvelopes) {
      const content = await this.fetchMessageContent(env.id);
      const fromAddr = parseAddressField(env.from);
      const message: ChannelMessage = {
        id: `email-${this.accountId}-${env.id}`,
        channelId: this.channelId,
        accountId: this.accountId,
        content,
        contentType: "text",
        conversationId: `email-${fromAddr}`,
        senderId: fromAddr,
        senderName: parseAddressField(env.from),
        timestamp: env.date ? Date.parse(env.date) : Date.now(),
        metadata: {
          envelopeId: env.id,
          subject: env.subject,
          from: fromAddr,
          to: env.to,
        },
      };
      messages.push(message);
      this.emitEvent("message_received", { messageId: message.id });
    }

    return messages;
  }

  async *receiveMessages(): AsyncIterable<ChannelMessage | null> {
    const intervalMs = this.accountConfig.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    while (this.isConnected()) {
      try {
        const messages = await this.pollOnce();
        for (const msg of messages) {
          yield msg;
        }
      } catch {
        // 轮询失败时不中断，等待下一轮
        yield null;
      }
      await new Promise((resolve) => {
        this.pollTimer = setTimeout(resolve, intervalMs) as unknown as NodeJS.Timeout;
      });
    }
  }
}

// ==================== Factory ====================

export class EmailChannelAdapterFactory implements ChannelAdapterFactory {
  create(options: { channelId: ChannelId; accountId: AccountId; config: AppConfig }): EmailChannelAdapter {
    return new EmailChannelAdapter(options);
  }

  getChannelId(): ChannelId {
    return "email";
  }

  getChannelMeta(): ChannelMeta {
    return {
      id: "email",
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
}
