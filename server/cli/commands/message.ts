/**
 * message 命令
 * 消息操作 (send/broadcast/edit)
 *
 * 参考 openclaw message-cli，提供消息发送、广播与编辑能力。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type MessageOptions = {
  json?: boolean;
};

interface MessageRecord {
  id: string;
  channel: string;
  recipient?: string;
  sender: string;
  content: string;
  edited: boolean;
  createdAt: string;
}

const MESSAGE_STORE: Map<string, MessageRecord> = new Map();

function generateMessageId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function sendMessage(channel: string, content: string, recipient?: string): MessageRecord {
  const id = generateMessageId();
  const record: MessageRecord = {
    id,
    channel,
    recipient,
    sender: "cli-user",
    content,
    edited: false,
    createdAt: new Date().toISOString(),
  };
  MESSAGE_STORE.set(id, record);
  return record;
}

function broadcastMessage(channels: string[], content: string): MessageRecord[] {
  return channels.map((ch) => sendMessage(ch, content));
}

function editMessage(id: string, content: string): MessageRecord | undefined {
  const record = MESSAGE_STORE.get(id);
  if (!record) {
    return undefined;
  }
  record.content = content;
  record.edited = true;
  return record;
}

function listMessages(channel?: string): MessageRecord[] {
  const all = Array.from(MESSAGE_STORE.values());
  if (channel) {
    return all.filter((m) => m.channel === channel);
  }
  return all;
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

function formatMessageList(messages: MessageRecord[]): string {
  if (messages.length === 0) {
    return "  无消息记录";
  }
  const lines: string[] = ["", "  消息列表:"];
  for (const m of messages) {
    const editFlag = m.edited ? " (已编辑)" : "";
    lines.push(`    ${m.id} [${m.channel}] ${m.sender}: ${m.content}${editFlag}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerMessageCommand(program: Command): void {
  const messageCmd = program
    .command("message")
    .description("消息操作 (send/broadcast/edit/list)")
    .alias("msg");

  messageCmd
    .command("send <channel> <content>")
    .description("发送消息到指定通道")
    .option("--recipient <id>", "接收者 ID")
    .option("--json", "JSON 输出格式")
    .action((channel: string, content: string, options: MessageOptions & { recipient?: string }) => {
      const msg = sendMessage(channel, content, options.recipient);
      logger.info(`已发送消息: ${msg.id}`);
      if (options.json) {
        logger.info(formatJsonOutput(msg));
      }
    });

  messageCmd
    .command("broadcast <channels> <content>")
    .description("广播消息到多个通道（通道用逗号分隔）")
    .option("--json", "JSON 输出格式")
    .action((channels: string, content: string, options: MessageOptions) => {
      const list = channels.split(",").map((c) => c.trim());
      const msgs = broadcastMessage(list, content);
      logger.info(`已广播到 ${msgs.length} 个通道`);
      if (options.json) {
        logger.info(formatJsonOutput(msgs));
      }
    });

  messageCmd
    .command("edit <id> <content>")
    .description("编辑已发送的消息")
    .option("--json", "JSON 输出格式")
    .action((id: string, content: string, options: MessageOptions) => {
      const msg = editMessage(id, content);
      if (!msg) {
        logger.error(`未找到消息: ${id}`);
        return;
      }
      logger.info(`已编辑消息: ${id}`);
      if (options.json) {
        logger.info(formatJsonOutput(msg));
      }
    });

  messageCmd
    .command("list")
    .description("列出消息")
    .option("--channel <channel>", "按通道过滤")
    .option("--json", "JSON 输出格式")
    .action((options: MessageOptions & { channel?: string }) => {
      const messages = listMessages(options.channel);
      if (options.json) {
        logger.info(formatJsonOutput(messages));
      } else {
        logger.info(formatMessageList(messages));
      }
    });

  // 默认 list
  messageCmd
    .action((options: MessageOptions & { channel?: string }) => {
      const messages = listMessages(options.channel);
      if (options.json) {
        logger.info(formatJsonOutput(messages));
      } else {
        logger.info(formatMessageList(messages));
      }
    });
}
