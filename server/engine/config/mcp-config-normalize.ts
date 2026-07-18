// 移植自 openclaw/src/config/mcp-config-normalize.ts
// 将 MCP 配置记录规范化为规范运行时形态。
//
// 降级说明：源文件依赖 ../utils.js 的 isRecord。此处内联等价实现。

/** 内联降级实现：判断值是否为普通记录对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

type ConfigMcpServers = Record<string, Record<string, unknown>>;
type OpenClawMcpHttpTransport = 'sse' | 'streamable-http';

const CLI_MCP_TYPE_TO_OPENCLAW_TRANSPORT: Record<string, OpenClawMcpHttpTransport | 'stdio'> = {
  http: 'streamable-http',
  'streamable-http': 'streamable-http',
  sse: 'sse',
  stdio: 'stdio',
};

function normalizeMcpString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** 将 CLI 原生 MCP type 别名映射为 OpenClaw HTTP transport 名称。 */
export function resolveOpenClawMcpTransportAlias(
  value: unknown,
): OpenClawMcpHttpTransport | undefined {
  const mapped = CLI_MCP_TYPE_TO_OPENCLAW_TRANSPORT[normalizeMcpString(value)];
  return mapped === 'sse' || mapped === 'streamable-http' ? mapped : undefined;
}

/** 检查原始 MCP `type` 值是否是 OpenClaw 可重写的遗留 CLI 别名。 */
export function isKnownCliMcpTypeAlias(value: unknown): boolean {
  return Object.hasOwn(CLI_MCP_TYPE_TO_OPENCLAW_TRANSPORT, normalizeMcpString(value));
}

/**
 * 将操作友好的 MCP server 别名转换为规范配置键。
 *
 * 已有的规范字段优先于遗留 snake_case 或 `type` 别名，因此重复的 configure 命令不能覆盖已规范化的选择。
 */
export function canonicalizeConfiguredMcpServer(
  server: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...server };
  const transportAlias = resolveOpenClawMcpTransportAlias(next.type);
  // `transport` 是 OpenClaw 的规范字段；遗留 `type` 仅在缺失时填补。
  if (typeof next.transport !== 'string' && transportAlias) {
    next.transport = transportAlias;
  }
  if (isKnownCliMcpTypeAlias(next.type)) {
    delete next.type;
  }
  if (typeof next.connect_timeout === 'number' && typeof next.connectTimeout !== 'number') {
    next.connectTimeout = next.connect_timeout;
    delete next.connect_timeout;
  }
  if (
    typeof next.supports_parallel_tool_calls === 'boolean' &&
    typeof next.supportsParallelToolCalls !== 'boolean'
  ) {
    next.supportsParallelToolCalls = next.supports_parallel_tool_calls;
    delete next.supports_parallel_tool_calls;
  }
  if (typeof next.ssl_verify === 'boolean' && typeof next.sslVerify !== 'boolean') {
    next.sslVerify = next.ssl_verify;
    delete next.ssl_verify;
  }
  if (typeof next.client_cert === 'string' && typeof next.clientCert !== 'string') {
    next.clientCert = next.client_cert;
    delete next.client_cert;
  }
  if (typeof next.client_key === 'string' && typeof next.clientKey !== 'string') {
    next.clientKey = next.client_key;
    delete next.client_key;
  }
  return next;
}

/** 返回对象形态 MCP server 配置的克隆映射，丢弃无效条目。 */
export function normalizeConfiguredMcpServers(value: unknown): ConfigMcpServers {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, server]) => isRecord(server))
      .map(([name, server]) => [name, { ...(server as Record<string, unknown>) }]),
  );
}
