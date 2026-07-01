/**
 * tool 命令
 * 工具管理 (list/exec/info)
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type ToolOptions = {
  json?: boolean;
};

/** 工具定义 */
interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  parameters: ToolParameter[];
  enabled: boolean;
}

interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
  default?: unknown;
}

/** 模拟工具存储 */
const TOOL_STORE: Map<string, ToolDefinition> = new Map([
  [
    "weather_query",
    {
      name: "weather_query",
      description: "查询指定城市的天气信息",
      category: "utility",
      parameters: [
        { name: "city", type: "string", description: "城市名称", required: true },
        { name: "unit", type: "string", description: "温度单位 (celsius/fahrenheit)", required: false, default: "celsius" },
      ],
      enabled: true,
    },
  ],
  [
    "code_search",
    {
      name: "code_search",
      description: "在代码库中搜索代码片段",
      category: "development",
      parameters: [
        { name: "query", type: "string", description: "搜索关键词", required: true },
        { name: "language", type: "string", description: "编程语言", required: false },
        { name: "limit", type: "number", description: "返回结果数量限制", required: false, default: 10 },
      ],
      enabled: true,
    },
  ],
  [
    "file_read",
    {
      name: "file_read",
      description: "读取文件内容",
      category: "filesystem",
      parameters: [
        { name: "path", type: "string", description: "文件路径", required: true },
        { name: "encoding", type: "string", description: "文件编码", required: false, default: "utf-8" },
      ],
      enabled: true,
    },
  ],
  [
    "database_query",
    {
      name: "database_query",
      description: "执行数据库查询",
      category: "database",
      parameters: [
        { name: "sql", type: "string", description: "SQL 查询语句", required: true },
        { name: "database", type: "string", description: "数据库连接名称", required: false, default: "default" },
      ],
      enabled: true,
    },
  ],
  [
    "web_fetch",
    {
      name: "web_fetch",
      description: "获取网页内容",
      category: "web",
      parameters: [
        { name: "url", type: "string", description: "网页 URL", required: true },
        { name: "selector", type: "string", description: "CSS 选择器", required: false },
      ],
      enabled: true,
    },
  ],
  [
    "json_parse",
    {
      name: "json_parse",
      description: "解析 JSON 数据",
      category: "utility",
      parameters: [
        { name: "data", type: "string", description: "JSON 字符串", required: true },
        { name: "path", type: "string", description: "JSONPath 表达式", required: false },
      ],
      enabled: true,
    },
  ],
  [
    "wms_query",
    {
      name: "wms_query",
      description: "查询 WMS 仓库管理系统数据",
      category: "wms",
      parameters: [
        { name: "type", type: "string", description: "查询类型 (inventory/order/location)", required: true },
        { name: "id", type: "string", description: "资源 ID", required: false },
      ],
      enabled: true,
    },
  ],
]);

/** 获取所有工具 */
function getAllTools(): ToolDefinition[] {
  return Array.from(TOOL_STORE.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** 获取工具详情 */
function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_STORE.get(name);
}

/** 执行工具 */
function executeTool(name: string, params: Record<string, unknown>): { success: boolean; result?: unknown; error?: string } {
  const tool = TOOL_STORE.get(name);
  if (!tool) {
    return { success: false, error: `工具 ${name} 不存在` };
  }
  if (!tool.enabled) {
    return { success: false, error: `工具 ${name} 已禁用` };
  }

  // 验证必需参数
  for (const param of tool.parameters) {
    if (param.required && params[param.name] === undefined) {
      return { success: false, error: `缺少必需参数: ${param.name}` };
    }
  }

  // 模拟工具执行
  const mockResults: Record<string, unknown> = {
    weather_query: {
      city: params.city,
      temperature: 22,
      unit: params.unit || "celsius",
      condition: "晴天",
      humidity: 65,
    },
    code_search: {
      query: params.query,
      results: [
        { file: "src/utils.ts", line: 42, snippet: "export function formatDate(date: Date) {...}" },
        { file: "src/helper.ts", line: 15, snippet: "const format = (str) => str.trim()" },
      ],
      total: 2,
    },
    file_read: {
      path: params.path,
      content: `文件内容模拟 (来自 ${params.path})`,
      encoding: params.encoding || "utf-8",
    },
    database_query: {
      sql: params.sql,
      rows: [{ id: 1, name: "示例数据" }],
      rowCount: 1,
    },
    web_fetch: {
      url: params.url,
      title: "示例网页",
      content: "这是从网页获取的内容模拟",
    },
    json_parse: {
      data: params.data,
      parsed: typeof params.data === "string" ? JSON.parse(params.data) : params.data,
    },
    wms_query: {
      type: params.type,
      data: { id: params.id || "default", status: "active", quantity: 100 },
    },
  };

  return {
    success: true,
    result: mockResults[name] || { message: `工具 ${name} 执行成功`, params },
  };
}

/** 解析 JSON 参数 */
function parseParams(paramsStr: string): Record<string, unknown> {
  try {
    return JSON.parse(paramsStr);
  } catch {
    // 尝试简单参数格式: key=value,key2=value2
    const params: Record<string, unknown> = {};
    const pairs = paramsStr.split(",");
    for (const pair of pairs) {
      const [key, value] = pair.split("=").map((s) => s.trim());
      if (key && value) {
        // 尝试解析数值
        const numValue = Number(value);
        params[key] = isNaN(numValue) ? value : numValue;
      }
    }
    return params;
  }
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化工具列表文本输出 */
function formatToolList(tools: ToolDefinition[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  可用工具 (共 ${tools.length} 个):`);
  lines.push("");
  for (const tool of tools) {
    const status = tool.enabled ? "✓" : "✗";
    lines.push(`  ${status} ${tool.name} (${tool.category})`);
    lines.push(`      ${tool.description}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** 格式化工具详情文本输出 */
function formatToolInfo(tool: ToolDefinition | undefined): string {
  if (!tool) {
    return "工具不存在";
  }
  const lines: string[] = [];
  lines.push("");
  lines.push(`  ${tool.name}`);
  lines.push("");
  lines.push(`  分类: ${tool.category}`);
  lines.push(`  状态: ${tool.enabled ? "已启用" : "已禁用"}`);
  lines.push(`  描述: ${tool.description}`);
  lines.push("");
  lines.push("  参数:");
  lines.push("");
  for (const param of tool.parameters) {
    const required = param.required ? " (必需)" : "";
    const defaultVal = param.default !== undefined ? ` [默认: ${JSON.stringify(param.default)}]` : "";
    lines.push(`    ${param.name}: ${param.type}${required}${defaultVal}`);
    lines.push(`      ${param.description}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** 格式化工具执行结果文本输出 */
function formatToolExec(result: { success: boolean; result?: unknown; error?: string }): string {
  if (!result.success) {
    return `执行失败: ${result.error}`;
  }
  const lines: string[] = [];
  lines.push("");
  lines.push("  执行成功:");
  lines.push("");
  lines.push(formatJsonOutput(result.result));
  lines.push("");
  return lines.join("\n");
}

/**
 * 注册 tool 命令
 */
export function registerToolCommand(program: Command): void {
  const toolCmd = program
    .command("tool")
    .description("工具管理 (list/exec/info)");

  // list 子命令
  toolCmd
    .command("list")
    .description("列出所有可用工具")
    .option("--json", "JSON 输出格式")
    .action((options: ToolOptions) => {
      const tools = getAllTools();
      if (options.json) {
        logger.info(formatJsonOutput(tools));
      } else {
        logger.info(formatToolList(tools));
      }
    });

  // exec 子命令
  toolCmd
    .command("exec <name> [params]")
    .description("执行指定工具")
    .option("--json", "JSON 输出格式")
    .action((name: string, paramsStr: string | undefined, options: ToolOptions) => {
      const params = paramsStr ? parseParams(paramsStr) : {};
      const result = executeTool(name, params);
      if (options.json) {
        logger.info(formatJsonOutput({ tool: name, params, ...result }));
      } else {
        logger.info(formatToolExec(result));
      }
    });

  // info 子命令
  toolCmd
    .command("info <name>")
    .description("显示工具详情")
    .option("--json", "JSON 输出格式")
    .action((name: string, options: ToolOptions) => {
      const tool = getToolByName(name);
      if (options.json) {
        logger.info(formatJsonOutput(tool ?? { name, error: "not_found" }));
      } else {
        logger.info(formatToolInfo(tool));
      }
    });

  // 默认 list 子命令
  toolCmd.action((options: ToolOptions) => {
    const tools = getAllTools();
    if (options.json) {
      logger.info(formatJsonOutput(tools));
    } else {
      logger.info(formatToolList(tools));
    }
  });
}