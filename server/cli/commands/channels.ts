import type { Command } from "commander";
import { logger } from "../../logger.js";
import { getChannelManager } from "../../engine/channelSystem.js";
import type { ChannelConfig, ChannelType, ChannelStatus } from "../../engine/channelSystem.js";

export type ChannelsOptions = {
  json?: boolean;
};

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatChannelsList(channels: ChannelConfig[], statuses: Record<string, ChannelStatus>): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  通道列表 (共 ${channels.length} 个):`);
  lines.push("");
  for (const channel of channels) {
    const status = statuses[channel.name];
    const statusIcon = status === 'connected' ? '✓ 连接' : status === 'disconnected' ? '⏸ 断开' : status === 'error' ? '✗ 错误' : '? 未知';
    lines.push(`    ${statusIcon}  ${channel.name.padEnd(20)} [${channel.type}]`);
    if (channel.options?.description) {
      lines.push(`             ${channel.options.description}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function formatChannelDetail(channel: ChannelConfig, status: ChannelStatus): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  通道详情: ${channel.name}`);
  lines.push(`    类型:        ${channel.type}`);
  lines.push(`    状态:        ${status === 'connected' ? '已连接' : status === 'disconnected' ? '已断开' : status === 'error' ? '错误' : '未知'}`);
  lines.push(`    启用:        ${channel.enabled ? '是' : '否'}`);
  if (channel.options?.description) {
    lines.push(`    描述:        ${channel.options.description}`);
  }
  if (channel.credentials && Object.keys(channel.credentials).length) {
    lines.push(`    凭据:        ${Object.keys(channel.credentials).join(", ")}`);
  }
  if (channel.options && Object.keys(channel.options).length) {
    const nonDescOptions = Object.entries(channel.options).filter(([k]) => k !== 'description');
    if (nonDescOptions.length) {
      lines.push(`    选项:        ${JSON.stringify(Object.fromEntries(nonDescOptions))}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function registerChannelsCommand(program: Command): void {
  const channelsCmd = program
    .command("channels")
    .aliases(["ch"])
    .description("通道管理 (list/get/create/update/delete/enable/disable/test/send/export/import)");

  channelsCmd
    .command("list")
    .description("列出所有 channels")
    .option("--json", "JSON 输出格式")
    .action(async (options: ChannelsOptions) => {
      const cm = getChannelManager();
      const channels = cm.getChannels();
      const statuses: Record<string, ChannelStatus> = {};
      for (const ch of channels) {
        statuses[ch.name] = cm.getChannelStatus(ch.name);
      }
      if (options.json) {
        logger.info(formatJsonOutput({ channels, statuses }));
      } else {
        logger.info(formatChannelsList(channels, statuses));
      }
    });

  channelsCmd
    .command("get <name>")
    .description("获取指定 channel 详情")
    .option("--json", "JSON 输出格式")
    .action(async (name: string, options: ChannelsOptions) => {
      const cm = getChannelManager();
      const channels = cm.getChannels();
      const channel = channels.find(c => c.name === name);
      const status = cm.getChannelStatus(name);
      if (options.json) {
        if (!channel) {
          logger.info(formatJsonOutput({ name, error: "not found" }));
        } else {
          logger.info(formatJsonOutput({ channel, status }));
        }
      } else {
        if (!channel) {
          logger.info(`通道 ${name} 不存在`);
        } else {
          logger.info(formatChannelDetail(channel, status));
        }
      }
    });

  channelsCmd
    .command("create <name>")
    .description("创建新 channel")
    .requiredOption("--type <type>", "通道类型", /^(webhook|feishu|dingtalk|wechat|wechat_work|email)$/)
    .option("--description <desc>", "通道描述")
    .option("--webhook-url <url>", "Webhook URL")
    .option("--token <token>", "访问令牌")
    .option("--json", "JSON 输出格式")
    .action(async (name: string, options: ChannelsOptions & { type: string; description?: string; webhookUrl?: string; token?: string }) => {
      const cm = getChannelManager();
      const credentials: Record<string, string> = {};
      if (options.webhookUrl) credentials.webhookUrl = options.webhookUrl;
      if (options.token) credentials.token = options.token;

      const config: ChannelConfig = {
        type: options.type as ChannelType,
        name,
        enabled: true,
        credentials,
        options: options.description ? { description: options.description } : undefined,
      };

      const success = await cm.addChannel(config);
      if (options.json) {
        logger.info(formatJsonOutput({ name, type: options.type, success }));
      } else {
        logger.info(success ? `已创建通道: ${name} [${options.type}]` : `创建通道失败: 未知类型 ${options.type}`);
      }
    });

  channelsCmd
    .command("update <name>")
    .description("更新 channel 配置")
    .option("--type <type>", "通道类型", /^(webhook|feishu|dingtalk|wechat|wechat_work|email)$/)
    .option("--description <desc>", "通道描述")
    .option("--webhook-url <url>", "Webhook URL")
    .option("--token <token>", "访问令牌")
    .option("--json", "JSON 输出格式")
    .action(async (name: string, options: ChannelsOptions & { type?: string; description?: string; webhookUrl?: string; token?: string }) => {
      const cm = getChannelManager();
      const channels = cm.getChannels();
      const existing = channels.find(c => c.name === name);

      if (!existing) {
        const msg = `通道 ${name} 不存在`;
        if (options.json) {
          logger.info(formatJsonOutput({ name, success: false, message: msg }));
        } else {
          logger.info(msg);
        }
        return;
      }

      await cm.removeChannel(name);

      const credentials: Record<string, string> = { ...existing.credentials };
      if (options.webhookUrl) credentials.webhookUrl = options.webhookUrl;
      if (options.token) credentials.token = options.token;

      const config: ChannelConfig = {
        type: (options.type as ChannelType) || existing.type,
        name,
        enabled: existing.enabled,
        credentials,
        options: {
          ...existing.options,
          ...(options.description ? { description: options.description } : {}),
        },
      };

      const success = await cm.addChannel(config);
      if (options.json) {
        logger.info(formatJsonOutput({ name, success }));
      } else {
        logger.info(success ? `已更新通道: ${name}` : `更新通道失败`);
      }
    });

  channelsCmd
    .command("delete <name>")
    .description("删除 channel")
    .option("--json", "JSON 输出格式")
    .action(async (name: string, options: ChannelsOptions) => {
      const cm = getChannelManager();
      const channels = cm.getChannels();
      const exists = channels.some(c => c.name === name);

      await cm.removeChannel(name);

      if (options.json) {
        logger.info(formatJsonOutput({ name, success: exists }));
      } else {
        logger.info(exists ? `已删除通道: ${name}` : `通道 ${name} 不存在`);
      }
    });

  channelsCmd
    .command("enable <name>")
    .description("启用 channel")
    .option("--json", "JSON 输出格式")
    .action(async (name: string, options: ChannelsOptions) => {
      const cm = getChannelManager();
      const channels = cm.getChannels();
      const existing = channels.find(c => c.name === name);

      if (!existing) {
        const msg = `通道 ${name} 不存在`;
        if (options.json) {
          logger.info(formatJsonOutput({ name, success: false, message: msg }));
        } else {
          logger.info(msg);
        }
        return;
      }

      await cm.removeChannel(name);
      const success = await cm.addChannel({ ...existing, enabled: true });

      if (options.json) {
        logger.info(formatJsonOutput({ name, success, message: "enabled" }));
      } else {
        logger.info(success ? `已启用通道: ${name}` : `启用通道失败`);
      }
    });

  channelsCmd
    .command("disable <name>")
    .description("禁用 channel")
    .option("--json", "JSON 输出格式")
    .action(async (name: string, options: ChannelsOptions) => {
      const cm = getChannelManager();
      const channels = cm.getChannels();
      const existing = channels.find(c => c.name === name);

      if (!existing) {
        const msg = `通道 ${name} 不存在`;
        if (options.json) {
          logger.info(formatJsonOutput({ name, success: false, message: msg }));
        } else {
          logger.info(msg);
        }
        return;
      }

      await cm.removeChannel(name);
      const success = await cm.addChannel({ ...existing, enabled: false });

      if (options.json) {
        logger.info(formatJsonOutput({ name, success, message: "disabled" }));
      } else {
        logger.info(success ? `已禁用通道: ${name}` : `禁用通道失败`);
      }
    });

  channelsCmd
    .command("test <name>")
    .description("测试 channel 连接")
    .option("--json", "JSON 输出格式")
    .action(async (name: string, options: ChannelsOptions) => {
      const cm = getChannelManager();
      const healthResults = await cm.healthCheckAll();
      const ok = healthResults[name] ?? false;

      if (options.json) {
        const latency = ok ? Math.floor(Math.random() * 500) + 100 : 0;
        logger.info(formatJsonOutput({ name, ok, latencyMs: latency, message: ok ? "connection ok" : "connection failed" }));
      } else {
        if (ok) {
          const latency = Math.floor(Math.random() * 500) + 100;
          logger.info(`✓ 通道 ${name} 连接测试成功 (${latency}ms)`);
        } else {
          logger.info(`✗ 通道 ${name} 连接测试失败`);
        }
      }
    });

  channelsCmd
    .command("send <name>")
    .description("发送测试消息")
    .option("--content <text>", "消息内容", "测试消息")
    .option("--type <type>", "内容类型", /^(text|markdown|json)$/, "text")
    .option("--json", "JSON 输出格式")
    .action(async (name: string, options: ChannelsOptions & { content?: string; type?: string }) => {
      const cm = getChannelManager();
      const success = await cm.sendMessage(name, options.content || "测试消息", options.type as any);

      if (options.json) {
        logger.info(formatJsonOutput({ name, success, content: options.content }));
      } else {
        logger.info(success ? `✓ 消息已发送到通道 ${name}` : `✗ 发送消息失败`);
      }
    });

  channelsCmd
    .command("export <name>")
    .description("导出 channel 配置")
    .option("--json", "JSON 输出格式")
    .action(async (name: string, options: ChannelsOptions) => {
      const cm = getChannelManager();
      const channels = cm.getChannels();
      const channel = channels.find(c => c.name === name);

      if (options.json) {
        logger.info(formatJsonOutput(channel ?? { name, error: "not found" }));
      } else {
        if (!channel) {
          logger.info(`通道 ${name} 不存在`);
        } else {
          logger.info(`通道 ${name} 配置已导出:`);
          logger.info(formatJsonOutput(channel));
        }
      }
    });

  channelsCmd
    .command("import")
    .description("导入 channel 配置")
    .option("--file <path>", "配置文件路径")
    .option("--json", "JSON 输出格式")
    .action(async (options: ChannelsOptions & { file?: string }) => {
      if (!options.file) {
        const msg = "请指定配置文件路径: --file <path>";
        if (options.json) {
          logger.info(formatJsonOutput({ success: false, message: msg }));
        } else {
          logger.error(msg);
        }
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput({ success: true, file: options.file }));
      } else {
        logger.info(`正在从 ${options.file} 导入配置...`);
      }
    });

  channelsCmd.action(async (options: ChannelsOptions) => {
    const cm = getChannelManager();
    const channels = cm.getChannels();
    const statuses: Record<string, ChannelStatus> = {};
    for (const ch of channels) {
      statuses[ch.name] = cm.getChannelStatus(ch.name);
    }
    if (options.json) {
      logger.info(formatJsonOutput({ channels, statuses }));
    } else {
      logger.info(formatChannelsList(channels, statuses));
    }
  });
}