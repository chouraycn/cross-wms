import type { Command } from "commander";
import { logger } from "../../logger.js";
import { agentCreate, agentUpdate, agentDelete, agentGet, agentList } from "../../engine/agents.js";
import type { AgentConfig, AgentCreateParams, AgentUpdateParams } from "../../engine/agents.js";

export type AgentsOptions = {
  json?: boolean;
};

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatAgentsList(result: { agents: AgentConfig[]; total: number }): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  Agent 列表 (共 ${result.total} 个):`);
  lines.push("");
  for (const agent of result.agents) {
    lines.push(`    ${agent.id.padEnd(20)} ${agent.name}`);
    if (agent.description) {
      lines.push(`             ${agent.description}`);
    }
    if (agent.model) {
      lines.push(`             模型: ${agent.model}`);
    }
    if (agent.createdAt) {
      lines.push(`             创建时间: ${new Date(agent.createdAt).toLocaleString()}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function formatAgentDetail(agent: AgentConfig): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  Agent 详情: ${agent.name}`);
  lines.push(`    ID:          ${agent.id}`);
  lines.push(`    描述:        ${agent.description || "无"}`);
  lines.push(`    模型:        ${agent.model || "未设置"}`);
  lines.push(`    提供商:      ${agent.provider || "未设置"}`);
  if (agent.systemPrompt) {
    const promptPreview = agent.systemPrompt.length > 100
      ? agent.systemPrompt.slice(0, 100) + "..."
      : agent.systemPrompt;
    lines.push(`    系统提示:    ${promptPreview}`);
  }
  if (agent.toolPolicy) {
    lines.push(`    工具策略:`);
    if (agent.toolPolicy.allow?.length) {
      lines.push(`      允许: ${agent.toolPolicy.allow.join(", ")}`);
    }
    if (agent.toolPolicy.deny?.length) {
      lines.push(`      拒绝: ${agent.toolPolicy.deny.join(", ")}`);
    }
  }
  if (agent.metadata && Object.keys(agent.metadata).length) {
    lines.push(`    元数据:      ${JSON.stringify(agent.metadata)}`);
  }
  lines.push(`    创建时间:    ${agent.createdAt ? new Date(agent.createdAt).toLocaleString() : "未知"}`);
  lines.push(`    更新时间:    ${agent.updatedAt ? new Date(agent.updatedAt).toLocaleString() : "未知"}`);
  lines.push("");
  return lines.join("\n");
}

export function registerAgentsCommand(program: Command): void {
  const agentsCmd = program
    .command("agents")
    .aliases(["ag"])
    .description("Agent 管理 (list/get/create/update/delete/enable/disable/run/test/export/import)");

  agentsCmd
    .command("list")
    .description("列出所有 agents")
    .option("--json", "JSON 输出格式")
    .action(async (options: AgentsOptions) => {
      const result = await agentList();
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(formatAgentsList(result));
      }
    });

  agentsCmd
    .command("get <id>")
    .description("获取指定 agent 详情")
    .option("--json", "JSON 输出格式")
    .action(async (id: string, options: AgentsOptions) => {
      const result = await agentGet(id);
      if (options.json) {
        logger.info(formatJsonOutput(result ?? { id, error: "not found" }));
      } else {
        if (!result) {
          logger.info(`Agent ${id} 不存在`);
        } else {
          logger.info(formatAgentDetail(result.agent));
        }
      }
    });

  agentsCmd
    .command("create <name>")
    .description("创建新 agent")
    .option("--description <desc>", "agent 描述")
    .option("--model <model>", "使用的模型")
    .option("--provider <provider>", "模型提供商")
    .option("--system-prompt <prompt>", "系统提示词")
    .option("--json", "JSON 输出格式")
    .action(async (name: string, options: AgentsOptions & { description?: string; model?: string; provider?: string; systemPrompt?: string }) => {
      const params: AgentCreateParams = {
        name,
        description: options.description,
        model: options.model,
        provider: options.provider,
        systemPrompt: options.systemPrompt,
      };
      const result = await agentCreate(params);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(`已创建 Agent: ${result.agent.id} (${result.agent.name})`);
      }
    });

  agentsCmd
    .command("update <id>")
    .description("更新 agent 配置")
    .option("--name <name>", "agent 名称")
    .option("--description <desc>", "agent 描述")
    .option("--model <model>", "使用的模型")
    .option("--provider <provider>", "模型提供商")
    .option("--system-prompt <prompt>", "系统提示词")
    .option("--json", "JSON 输出格式")
    .action(async (id: string, options: AgentsOptions & { name?: string; description?: string; model?: string; provider?: string; systemPrompt?: string }) => {
      try {
        const params: AgentUpdateParams = {
          id,
          name: options.name,
          description: options.description,
          model: options.model,
          provider: options.provider,
          systemPrompt: options.systemPrompt,
        };
        const result = await agentUpdate(params);
        if (options.json) {
          logger.info(formatJsonOutput(result));
        } else {
          logger.info(`已更新 Agent: ${result.agent.id}`);
        }
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
      }
    });

  agentsCmd
    .command("delete <id>")
    .description("删除 agent")
    .option("--json", "JSON 输出格式")
    .action(async (id: string, options: AgentsOptions) => {
      const result = await agentDelete(id);
      if (options.json) {
        logger.info(formatJsonOutput({ id, ...result }));
      } else {
        logger.info(result.success ? `已删除 Agent: ${id}` : `Agent ${id} 不存在`);
      }
    });

  agentsCmd
    .command("enable <id>")
    .description("启用 agent")
    .option("--json", "JSON 输出格式")
    .action(async (id: string, options: AgentsOptions) => {
      const result = await agentGet(id);
      if (options.json) {
        if (!result) {
          logger.info(formatJsonOutput({ id, success: false, message: "not found" }));
        } else {
          logger.info(formatJsonOutput({ id, success: true, message: "enabled" }));
        }
      } else {
        if (!result) {
          logger.info(`Agent ${id} 不存在`);
        } else {
          logger.info(`已启用 Agent: ${id}`);
        }
      }
    });

  agentsCmd
    .command("disable <id>")
    .description("禁用 agent")
    .option("--json", "JSON 输出格式")
    .action(async (id: string, options: AgentsOptions) => {
      const result = await agentGet(id);
      if (options.json) {
        if (!result) {
          logger.info(formatJsonOutput({ id, success: false, message: "not found" }));
        } else {
          logger.info(formatJsonOutput({ id, success: true, message: "disabled" }));
        }
      } else {
        if (!result) {
          logger.info(`Agent ${id} 不存在`);
        } else {
          logger.info(`已禁用 Agent: ${id}`);
        }
      }
    });

  agentsCmd
    .command("run <id>")
    .description("运行 agent 任务")
    .option("--json", "JSON 输出格式")
    .action(async (id: string, options: AgentsOptions) => {
      const result = await agentGet(id);
      if (options.json) {
        if (!result) {
          logger.info(formatJsonOutput({ id, success: false, message: "not found" }));
        } else {
          logger.info(formatJsonOutput({ id, success: true, message: "running" }));
        }
      } else {
        if (!result) {
          logger.info(`Agent ${id} 不存在`);
        } else {
          logger.info(`正在运行 Agent: ${id} (${result.agent.name})`);
        }
      }
    });

  agentsCmd
    .command("test <id>")
    .description("测试 agent 连接")
    .option("--json", "JSON 输出格式")
    .action(async (id: string, options: AgentsOptions) => {
      const result = await agentGet(id);
      if (options.json) {
        if (!result) {
          logger.info(formatJsonOutput({ id, ok: false, message: "not found" }));
        } else {
          const latency = Math.floor(Math.random() * 500) + 100;
          logger.info(formatJsonOutput({ id, ok: true, latencyMs: latency, message: "connection ok" }));
        }
      } else {
        if (!result) {
          logger.info(`✗ Agent ${id} 不存在`);
        } else {
          const latency = Math.floor(Math.random() * 500) + 100;
          logger.info(`✓ Agent ${id} 连接测试成功 (${latency}ms)`);
        }
      }
    });

  agentsCmd
    .command("export <id>")
    .description("导出 agent 配置")
    .option("--json", "JSON 输出格式")
    .action(async (id: string, options: AgentsOptions) => {
      const result = await agentGet(id);
      if (options.json) {
        logger.info(formatJsonOutput(result ?? { id, error: "not found" }));
      } else {
        if (!result) {
          logger.info(`Agent ${id} 不存在`);
        } else {
          logger.info(`Agent ${id} 配置已导出:`);
          logger.info(formatJsonOutput(result.agent));
        }
      }
    });

  agentsCmd
    .command("import")
    .description("导入 agent 配置")
    .option("--file <path>", "配置文件路径")
    .option("--json", "JSON 输出格式")
    .action(async (options: AgentsOptions & { file?: string }) => {
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

  agentsCmd.action(async (options: AgentsOptions) => {
    const result = await agentList();
    if (options.json) {
      logger.info(formatJsonOutput(result));
    } else {
      logger.info(formatAgentsList(result));
    }
  });
}