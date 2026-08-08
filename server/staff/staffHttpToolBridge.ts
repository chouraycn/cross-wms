/**
 * StaffDeck HTTP 工具桥接 — 将 sd_tools 表中 tool_type='http' 的工具
 * 转换为 LLM 可识别的 ToolDefinition 并提供执行入口。
 *
 * 设计：
 * - getStaffHttpToolDefinitions(tenantId) 读取 sd_tools 并缓存到模块级 registry
 * - executeStaffHttpTool(name, args) 从 registry 查找配置后经统一原语发起请求
 * - 工具名前缀 http_tool_ 用于分发路由
 *
 * 【为什么不直接删掉本文件、让 LLM 用核心 web_api_call】（2026-08-04 P1.1 结论）
 * 本桥接层与 web_api_call 的重复只在**执行层**，已收敛到 infra/net/httpToolRequest.ts。
 * 剩余部分是不可替代的功能，删掉会造成三重倒退：
 *   1. 鉴权预置：token/apiKey 存服务端注入，删掉后需由 LLM 自行拼 Authorization → 密钥泄露给模型
 *   2. 语义化工具名 + inputSchema：LLM 直接看到「查询库存」而非自己猜 URL，显著降低幻觉
 *   3. 内网可达：核心 web_api_call 走域名白名单且禁内网，企业内部 API 场景直接不通
 * 复用软件既有能力：executeGuardedHttpRequest（SSRF 防护 + DNS 钉扎 + 响应体限制 + 统一错误包装）
 */
import type { ToolDefinition, ToolCall } from '../aiClient.js';
import type { ToolRow } from '../types/staff.js';
import * as toolDao from '../dao/staff/staffToolDao.js';
import { executeGuardedHttpRequest } from '../infra/net/httpToolRequest.js';
import { logger } from '../logger.js';

// ===================== 常量 =====================

export const HTTP_TOOL_PREFIX = 'http_tool_';

// ===================== 内部注册表 =====================

interface HttpToolEntry {
  /** 工具在 sd_tools 表中的 id */
  toolId: string;
  /** 原始工具名（sd_tools.name） */
  rawName: string;
  /** LLM 可见的工具名（http_tool_ + sanitized） */
  llmName: string;
  /** 显示名 */
  displayName: string;
  /** 描述 */
  description: string;
  /** HTTP 方法 */
  method: string;
  /** 请求 URL */
  url: string;
  /** 静态 headers（来自 headers_json） */
  headers: Record<string, string>;
  /** 鉴权配置（来自 auth_json） */
  auth: { type?: string; token?: string; apiKey?: string; header?: string };
  /** 输入 schema（OpenAI function parameters 格式） */
  inputSchema: Record<string, any>;
}

/** 模块级注册表：llmName → HttpToolEntry */
const registry = new Map<string, HttpToolEntry>();

// ===================== 工具名转换 =====================

/**
 * 将 sd_tools.name 转换为 LLM 安全的函数名。
 * 规则：非 [a-zA-Z0-9_-] 字符替换为下划线，确保符合 OpenAI function name 规范。
 */
export function sanitizeToolName(rawName: string): string {
  return rawName.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * 生成 LLM 可见的工具名。
 */
export function makeHttpToolName(rawName: string): string {
  return `${HTTP_TOOL_PREFIX}${sanitizeToolName(rawName)}`;
}

/**
 * 判断工具名是否属于 HTTP 工具。
 */
export function isHttpToolName(name: string): boolean {
  return name.startsWith(HTTP_TOOL_PREFIX);
}

/**
 * 从 LLM 工具名还原原始工具名（去掉前缀和 sanitization 无法逆转，
 * 需通过 registry 查找）。
 */
export function getHttpToolEntry(llmName: string): HttpToolEntry | undefined {
  return registry.get(llmName);
}

// ===================== JSON 解析辅助 =====================

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ===================== Row → Entry 转换 =====================

function rowToEntry(row: ToolRow): HttpToolEntry {
  const headers = parseJsonSafe<Record<string, string>>(
    row.headers_json as string | null,
    {},
  );
  const auth = parseJsonSafe<{ type?: string; token?: string; apiKey?: string; header?: string }>(
    row.auth_json as string | null,
    {},
  );
  const inputSchema = parseJsonSafe<Record<string, any>>(
    row.input_schema as string | null,
    {},
  );

  return {
    toolId: row.id,
    rawName: row.name,
    llmName: makeHttpToolName(row.name),
    displayName: row.display_name || row.name,
    description: row.description || `HTTP ${row.method} ${row.url}`,
    method: (row.method || 'POST').toUpperCase(),
    url: row.url,
    headers,
    auth,
    inputSchema,
  };
}

// ===================== ToolDefinition 生成 =====================

/**
 * 读取 sd_tools 表中 tool_type='http' 且 enabled=1 的工具，
 * 转换为 ToolDefinition[] 并注册到模块级 registry。
 *
 * @param tenantId 租户 ID
 * @returns OpenAI function 格式的工具定义列表
 */
export function getStaffHttpToolDefinitions(tenantId: string): ToolDefinition[] {
  const rows = toolDao.listTools(tenantId);
  const httpRows = rows.filter(
    (r) => (r.tool_type === 'http' || (!r.tool_type && r.url)) && r.enabled === 1,
  );

  const definitions: ToolDefinition[] = [];

  for (const row of httpRows) {
    const entry = rowToEntry(row);

    // 注册到模块级 registry 供 executeStaffHttpTool 查找
    registry.set(entry.llmName, entry);

    const def: ToolDefinition = {
      type: 'function',
      function: {
        name: entry.llmName,
        description: entry.description,
        parameters: entry.inputSchema && Object.keys(entry.inputSchema).length > 0
          ? entry.inputSchema
          : {
              type: 'object',
              properties: {},
              additionalProperties: true,
            },
      },
    };

    definitions.push(def);
  }

  if (definitions.length > 0) {
    logger.info(
      `[StaffHttpToolBridge] 已加载 ${definitions.length} 个 HTTP 工具 (tenant=${tenantId}): ` +
      definitions.map((d) => d.function?.name).join(', '),
    );
  }

  return definitions;
}

// ===================== HTTP 工具执行 =====================

/**
 * 执行 HTTP 工具调用。
 *
 * 从 registry 查找工具配置，构建 HTTP 请求并使用 fetchWithSsrFGuard 执行。
 * 鉴权（bearer/apikey）从 auth_json 注入 headers。
 *
 * @param llmName LLM 工具名（http_tool_* 前缀）
 * @param args 模型传递的参数
 * @returns JSON 字符串格式的执行结果
 */
export async function executeStaffHttpTool(
  llmName: string,
  args: Record<string, any>,
): Promise<string> {
  const entry = registry.get(llmName);
  if (!entry) {
    return JSON.stringify({
      error: `HTTP 工具 '${llmName}' 未在注册表中找到（可能未加载或已禁用）`,
      notFound: true,
    });
  }

  const method = entry.method;
  const headers: Record<string, string> = { ...entry.headers };

  // 注入鉴权（服务端预置，密钥不暴露给 LLM —— 这是本桥接层保留存在的核心理由）
  if (entry.auth.type === 'bearer' && entry.auth.token) {
    headers['Authorization'] = `Bearer ${entry.auth.token}`;
  } else if (entry.auth.type === 'apikey' && entry.auth.apiKey) {
    headers[entry.auth.header || 'X-API-Key'] = entry.auth.apiKey;
  }

  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method);

  // 2026-08-04 P1.1 去重：执行层收敛到 executeGuardedHttpRequest，
  // 与核心 web_api_call 共用同一份「SSRF 守卫 + 超时 + 截断 + 错误包装」实现。
  // allowPrivateNetwork=true —— 数字员工的 HTTP 工具主要面向企业内网 API。
  const result = await executeGuardedHttpRequest({
    url: entry.url,
    method,
    headers,
    body: hasBody ? (typeof args === 'string' ? args : JSON.stringify(args)) : undefined,
    timeoutMs: 30_000,
    allowPrivateNetwork: true,
  });

  if (result.transportError) {
    return JSON.stringify({
      success: false,
      error: `HTTP 请求失败: ${result.transportError}`,
    });
  }

  return JSON.stringify({
    success: result.ok,
    status: result.status,
    contentType: result.contentType,
    body: result.text,
    ...(result.ok ? {} : { error: `HTTP ${result.status}: ${result.text.slice(0, 500)}` }),
  });
}

// ===================== 便捷方法：从 ToolCall 执行 =====================

/**
 * 便捷方法：从 ToolCall 对象执行 HTTP 工具。
 * 兼容 actionPhaseExecutor 的 toolExecutor 签名。
 */
export async function executeHttpToolFromCall(toolCall: ToolCall): Promise<string> {
  const toolName = toolCall.function.name;
  let args: Record<string, any> = {};
  try {
    args = JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    // 参数解析失败，使用空对象
  }
  return executeStaffHttpTool(toolName, args);
}
