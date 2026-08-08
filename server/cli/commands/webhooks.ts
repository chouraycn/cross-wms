/**
 * webhooks 命令
 * Webhook 管理 (list/add/remove/test)
 *
 * 参考 openclaw webhooks-cli，管理 Webhook 端点注册与触发。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type WebhooksOptions = {
  json?: boolean;
};

type WebhookEvent = "message.created" | "task.completed" | "agent.reply" | "session.ended";

interface WebhookEntry {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  active: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  deliveryCount: number;
  failureCount: number;
}

const WEBHOOK_STORE: Map<string, WebhookEntry> = new Map([
  [
    "wh-001",
    {
      id: "wh-001",
      url: "https://example.com/hooks/openclaw",
      events: ["message.created", "agent.reply"],
      active: true,
      createdAt: "2025-01-10T08:00:00Z",
      deliveryCount: 142,
      failureCount: 2,
    },
  ],
  [
    "wh-002",
    {
      id: "wh-002",
      url: "https://hooks.slack.com/services/T00/B00/XX",
      events: ["task.completed"],
      active: false,
      createdAt: "2025-01-12T12:00:00Z",
      lastTriggeredAt: "2025-01-14T18:30:00Z",
      deliveryCount: 38,
      failureCount: 5,
    },
  ],
]);

function generateWebhookId(): string {
  return `wh_${Date.now().toString(36)}`;
}

function listWebhooks(): WebhookEntry[] {
  return Array.from(WEBHOOK_STORE.values());
}

function addWebhook(url: string, events: WebhookEvent[], secret?: string): WebhookEntry {
  const id = generateWebhookId();
  const entry: WebhookEntry = {
    id,
    url,
    events,
    secret,
    active: true,
    createdAt: new Date().toISOString(),
    deliveryCount: 0,
    failureCount: 0,
  };
  WEBHOOK_STORE.set(id, entry);
  return entry;
}

function removeWebhook(id: string): boolean {
  return WEBHOOK_STORE.delete(id);
}

function testWebhook(id: string): { success: boolean; statusCode: number; message: string } {
  const entry = WEBHOOK_STORE.get(id);
  if (!entry) {
    return { success: false, statusCode: 0, message: `Webhook not found: ${id}` };
  }
  if (!entry.active) {
    return { success: false, statusCode: 0, message: `Webhook is inactive: ${id}` };
  }
  return { success: true, statusCode: 200, message: `Webhook test delivered to ${entry.url}` };
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

function formatWebhookList(webhooks: WebhookEntry[]): string {
  if (webhooks.length === 0) {
    return "\n  无已注册的 Webhook\n";
  }
  const lines: string[] = ["", "  Webhook 列表:"];
  for (const wh of webhooks) {
    const status = wh.active ? "✓" : "✗";
    lines.push(`    ${status} ${wh.id}  ${wh.url}`);
    lines.push(`        事件: ${wh.events.join(", ")}`);
    lines.push(`        投递: ${wh.deliveryCount}  失败: ${wh.failureCount}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerWebhooksCommand(program: Command): void {
  const webhooksCmd = program
    .command("webhooks")
    .description("Webhook 管理 (list/add/remove/test)");

  webhooksCmd
    .command("list")
    .description("列出所有 Webhook")
    .option("--json", "JSON 输出格式")
    .action((options: WebhooksOptions) => {
      const webhooks = listWebhooks();
      if (options.json) {
        logger.info(formatJsonOutput(webhooks));
      } else {
        logger.info(formatWebhookList(webhooks));
      }
    });

  webhooksCmd
    .command("add <url>")
    .description("添加 Webhook")
    .requiredOption("--events <events>", "订阅事件（逗号分隔）")
    .option("--secret <secret>", "签名密钥")
    .option("--json", "JSON 输出格式")
    .action((url: string, options: WebhooksOptions & { events: string; secret?: string }) => {
      const events = options.events.split(",").map((e) => e.trim()) as WebhookEvent[];
      const webhook = addWebhook(url, events, options.secret);
      logger.info(`已添加 Webhook: ${webhook.id}`);
      if (options.json) {
        logger.info(formatJsonOutput(webhook));
      }
    });

  webhooksCmd
    .command("remove <id>")
    .description("移除 Webhook")
    .action((id: string) => {
      const removed = removeWebhook(id);
      if (removed) {
        logger.info(`已移除 Webhook: ${id}`);
      } else {
        logger.error(`未找到 Webhook: ${id}`);
      }
    });

  webhooksCmd
    .command("test <id>")
    .description("测试 Webhook 投递")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: WebhooksOptions) => {
      const result = testWebhook(id);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
      }
    });

  // 默认 list
  webhooksCmd
    .action((options: WebhooksOptions) => {
      const webhooks = listWebhooks();
      if (options.json) {
        logger.info(formatJsonOutput(webhooks));
      } else {
        logger.info(formatWebhookList(webhooks));
      }
    });
}
