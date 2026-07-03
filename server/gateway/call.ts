/**
 * Gateway RPC 调用编排
 *
 * 参考 openclaw/src/gateway/call.ts 的安全设计原则：
 * - resolveGatewayCallContext：解析配置/环境/认证上下文，处理 URL 覆盖
 * - ensureExplicitGatewayAuth：URL 覆盖强制显式认证，防止隐式设备令牌
 *   回退到攻击者控制的 WSS 端点
 * - 最小权限操作者作用域：基于方法分类自动解析
 * - 三种入口：callGateway（自动路由）、callGatewayCli（CLI 默认权限）、
 *   callGatewayLeastPrivilege（严格最小权限）
 * - 错误分类体系：GatewayTransportError、GatewayCredentialsRequiredError、
 *   GatewayExplicitAuthRequiredError
 * - 支持 AbortSignal、超时、pre-hello 清洁关闭抑制
 */

import { logger } from "../logger.js";
import { isLoopbackAddress, isSecureWebSocketUrl } from "./net.js";

// ==================== 常量 ====================

/** 默认调用超时（毫秒） */
const DEFAULT_CALL_TIMEOUT_MS = 10_000;
/** 最大安全定时器延迟（毫秒），防止 32 位整数溢出 */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;
/** pre-hello 清洁关闭抑制的最大次数 */
const MAX_PRE_HELLO_SUPPRESSIONS = 1;
/** 客户端协议版本 */
const CLIENT_PROTOCOL_VERSION = 1;

// ==================== 类型定义 ====================

/** 显式认证凭据 */
export type ExplicitGatewayAuth = {
  token?: string;
  password?: string;
};

/** 操作者作用域 */
export type OperatorScope = "operator.read" | "operator.write" | "operator.admin";

/** Gateway 连接详情 */
export type GatewayConnectionDetails = {
  url: string;
  urlSource: "cli" | "env" | "config" | "default";
  message: string;
  bindDetail?: string;
  remoteFallbackNote?: string;
};

/** 传输错误类型 */
export type GatewayTransportErrorKind = "closed" | "timeout";

/** RPC 方法分类 */
export type GatewayMethodClass = "read" | "write" | "admin" | "unclassified";

/** 调用基础选项 */
export type CallGatewayBaseOptions = {
  url?: string;
  token?: string;
  password?: string;
  config?: Record<string, unknown>;
  method: string;
  params?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  clientName?: string;
  clientVersion?: string;
  instanceId?: string;
  configPath?: string;
  /** 显式指定本地网关端口（如 gateway health --port） */
  localPortOverride?: number;
};

/** CLI 调用选项（可显式指定 scopes） */
export type CallGatewayCliOptions = CallGatewayBaseOptions & {
  scopes?: OperatorScope[];
};

/** 通用调用选项（可显式指定 scopes） */
export type CallGatewayOptions = CallGatewayBaseOptions & {
  scopes?: OperatorScope[];
};

/** 解析后的调用上下文 */
type ResolvedGatewayCallContext = {
  config: Record<string, unknown>;
  configPath: string;
  isRemoteMode: boolean;
  urlOverride?: string;
  urlOverrideSource?: "cli" | "env";
  explicitAuth: ExplicitGatewayAuth;
};

// ==================== 错误类 ====================

/** Gateway 传输错误（连接关闭或超时） */
export class GatewayTransportError extends Error {
  readonly kind: GatewayTransportErrorKind;
  readonly connectionDetails: GatewayConnectionDetails;
  readonly code?: number;
  readonly reason?: string;
  readonly timeoutMs?: number;

  constructor(params: {
    kind: GatewayTransportErrorKind;
    message: string;
    connectionDetails: GatewayConnectionDetails;
    code?: number;
    reason?: string;
    timeoutMs?: number;
  }) {
    super(params.message);
    this.name = "GatewayTransportError";
    this.kind = params.kind;
    this.connectionDetails = params.connectionDetails;
    if (params.code !== undefined) {
      this.code = params.code;
    }
    if (params.reason !== undefined) {
      this.reason = params.reason;
    }
    if (params.timeoutMs !== undefined) {
      this.timeoutMs = params.timeoutMs;
    }
  }
}

/** Gateway 凭据缺失错误（需要认证但未提供凭据） */
export class GatewayCredentialsRequiredError extends Error {
  readonly method: string;
  readonly configPath: string;

  constructor(params: { method: string; configPath: string }) {
    super(
      [
        `gateway ${params.method} requires credentials before opening a websocket`,
        "Fix: configure gateway.auth token/password, pair this device, or pass --token/--password.",
        `Config: ${params.configPath}`,
      ].join("\n"),
    );
    this.name = "GatewayCredentialsRequiredError";
    this.method = params.method;
    this.configPath = params.configPath;
  }
}

/** Gateway 显式认证要求错误（URL 覆盖需要显式凭据） */
export class GatewayExplicitAuthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayExplicitAuthRequiredError";
  }
}

// ==================== 错误判断函数 ====================

/** 判断是否为 GatewayTransportError */
export function isGatewayTransportError(value: unknown): value is GatewayTransportError {
  if (value instanceof GatewayTransportError) {
    return true;
  }
  if (!(value instanceof Error) || value.name !== "GatewayTransportError") {
    return false;
  }
  const candidate = value as Partial<GatewayTransportError>;
  return (
    (candidate.kind === "closed" || candidate.kind === "timeout") &&
    typeof candidate.connectionDetails === "object" &&
    candidate.connectionDetails !== null
  );
}

/** 判断是否为 GatewayCredentialsRequiredError */
export function isGatewayCredentialsRequiredError(
  value: unknown,
): value is GatewayCredentialsRequiredError {
  if (value instanceof GatewayCredentialsRequiredError) {
    return true;
  }
  if (!(value instanceof Error) || value.name !== "GatewayCredentialsRequiredError") {
    return false;
  }
  const candidate = value as Partial<GatewayCredentialsRequiredError>;
  return typeof candidate.method === "string" && typeof candidate.configPath === "string";
}

/** 判断是否为 GatewayExplicitAuthRequiredError */
export function isGatewayExplicitAuthRequiredError(
  value: unknown,
): value is GatewayExplicitAuthRequiredError {
  return value instanceof Error && value.name === "GatewayExplicitAuthRequiredError";
}

// ==================== 方法作用域分类 ====================

/** 读取类方法前缀/名称 */
const READ_METHODS = new Set([
  "health",
  "status",
  "models",
  "models.list",
  "system-presence",
  "config.get",
  "session.list",
  "session.get",
  "agent.list",
  "agent.get",
  "tool.list",
  "stats",
]);

/** 写入类方法前缀/名称 */
const WRITE_METHOD_PREFIXES = [
  "chat.",
  "session.create",
  "session.delete",
  "session.update",
  "agent.create",
  "agent.update",
  "agent.delete",
];

/** 管理类方法前缀 */
const ADMIN_METHOD_PREFIXES = ["admin.", "config.set", "config.reset"];

/** CLI 默认操作者作用域（未分类方法回退） */
export const CLI_DEFAULT_OPERATOR_SCOPES: OperatorScope[] = [
  "operator.read",
  "operator.write",
];

/** 判断方法是否已分类 */
export function isGatewayMethodClassified(method: string): boolean {
  return resolveGatewayMethodClass(method) !== "unclassified";
}

/** 解析方法分类 */
export function resolveGatewayMethodClass(method: string): GatewayMethodClass {
  const normalized = method.trim().toLowerCase();
  if (READ_METHODS.has(normalized)) {
    return "read";
  }
  if (ADMIN_METHOD_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return "admin";
  }
  if (WRITE_METHOD_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return "write";
  }
  return "unclassified";
}

/**
 * 基于方法分类解析最小权限操作者作用域
 *
 * - read 类方法 → [operator.read]
 * - write 类方法 → [operator.read, operator.write]
 * - admin 类方法 → [operator.read, operator.write, operator.admin]
 * - unclassified → CLI_DEFAULT_OPERATOR_SCOPES
 */
export function resolveLeastPrivilegeOperatorScopesForMethod(
  method: string,
  _params?: unknown,
): OperatorScope[] {
  const methodClass = resolveGatewayMethodClass(method);
  switch (methodClass) {
    case "read":
      return ["operator.read"];
    case "write":
      return ["operator.read", "operator.write"];
    case "admin":
      return ["operator.read", "operator.write", "operator.admin"];
    case "unclassified":
    default:
      return [...CLI_DEFAULT_OPERATOR_SCOPES];
  }
}

// ==================== 认证解析 ====================

/** 解析显式认证凭据（去除空白，空字符串 → undefined） */
export function resolveExplicitGatewayAuth(opts?: ExplicitGatewayAuth): ExplicitGatewayAuth {
  const token =
    typeof opts?.token === "string" && opts.token.trim().length > 0 ? opts.token.trim() : undefined;
  const password =
    typeof opts?.password === "string" && opts.password.trim().length > 0
      ? opts.password.trim()
      : undefined;
  return { token, password };
}

/**
 * 确保 URL 覆盖使用显式认证
 *
 * 安全策略（参考 openclaw ensureExplicitGatewayAuth）：
 * URL 覆盖是不可信的重定向，可能将 WebSocket 流量移至攻击者控制的主机。
 * 绝不允许覆盖静默复用隐式凭据或设备令牌回退。
 *
 * - CLI 覆盖：需显式 token 或 password
 * - ENV 覆盖：需显式或解析的认证凭据（支持部署便利，但阻断隐式回退）
 * - 无覆盖：直接通过
 */
export function ensureExplicitGatewayAuth(params: {
  urlOverride?: string;
  urlOverrideSource?: "cli" | "env";
  explicitAuth?: ExplicitGatewayAuth;
  resolvedAuth?: ExplicitGatewayAuth;
  errorHint: string;
  configPath?: string;
}): void {
  if (!params.urlOverride) {
    return;
  }

  const explicitToken = params.explicitAuth?.token;
  const explicitPassword = params.explicitAuth?.password;

  // CLI 覆盖 + 显式凭据 → 通过
  if (params.urlOverrideSource === "cli" && (explicitToken || explicitPassword)) {
    return;
  }

  const hasResolvedAuth =
    params.resolvedAuth?.token ||
    params.resolvedAuth?.password ||
    explicitToken ||
    explicitPassword;

  // ENV 覆盖 + 已解析认证 → 通过（支持部署便利，但阻断隐式设备令牌回退）
  if (params.urlOverrideSource === "env" && hasResolvedAuth) {
    return;
  }

  // 不满足上述条件 → fail-closed
  const message = [
    "gateway url override requires explicit credentials",
    params.errorHint,
    params.configPath ? `Config: ${params.configPath}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
  throw new GatewayExplicitAuthRequiredError(message);
}

// ==================== 配置/环境解析 ====================

/** 去除首尾空白，空字符串返回 undefined */
function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** 解析 Gateway 配置路径 */
function resolveGatewayConfigPath(env: NodeJS.ProcessEnv): string {
  const stateDir = env.CROSS_WMS_STATE_DIR || env.OPENCLAW_STATE_DIR || "";
  return trimToUndefined(env.CROSS_WMS_CONFIG_PATH) || `${stateDir}/config.json` || "config.json";
}

/** 解析 Gateway 默认端口 */
function resolveGatewayPort(config?: Record<string, unknown>, env?: NodeJS.ProcessEnv): number {
  const configPort = config?.gateway as { port?: unknown } | undefined;
  const port =
    trimToUndefined(env?.CROSS_WMS_GATEWAY_PORT || env?.OPENCLAW_GATEWAY_PORT) ||
    configPort?.port;
  if (typeof port === "number" && port > 0 && port < 65536) {
    return port;
  }
  if (typeof port === "string") {
    const parsed = parseInt(port, 10);
    if (parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  return 3001;
}

/** 判断是否可跳过配置加载（URL 覆盖 + 显式认证） */
function canSkipGatewayConfigLoad(params: {
  config?: Record<string, unknown>;
  urlOverride?: string;
  explicitAuth: ExplicitGatewayAuth;
}): boolean {
  if (params.config) {
    return true;
  }
  if (params.urlOverride && (params.explicitAuth.token || params.explicitAuth.password)) {
    return true;
  }
  return false;
}

/**
 * 解析 Gateway 调用上下文
 *
 * 处理 URL 覆盖优先级：
 * 1. CLI 显式 URL（--url）最高优先级
 * 2. 环境变量 URL（CROSS_WMS_GATEWAY_URL / OPENCLAW_GATEWAY_URL）
 * 3. 配置文件中的 remote URL（remote 模式）
 * 4. 默认本地地址
 */
export async function resolveGatewayCallContext(
  opts: CallGatewayBaseOptions,
): Promise<ResolvedGatewayCallContext> {
  const cliUrlOverride = trimToUndefined(opts.url);
  const explicitAuth = resolveExplicitGatewayAuth({ token: opts.token, password: opts.password });

  // 环境变量 URL 覆盖（CLI URL 或端口覆盖存在时不生效）
  const envUrlOverride =
    cliUrlOverride || opts.localPortOverride !== undefined
      ? undefined
      : trimToUndefined(
          process.env.CROSS_WMS_GATEWAY_URL || process.env.OPENCLAW_GATEWAY_URL,
        );

  const urlOverride = cliUrlOverride ?? envUrlOverride;
  const urlOverrideSource = cliUrlOverride ? "cli" : envUrlOverride ? "env" : undefined;

  const canSkip = canSkipGatewayConfigLoad({ config: opts.config, urlOverride, explicitAuth });
  const config =
    opts.config ?? (canSkip ? ({} as Record<string, unknown>) : loadGatewayConfig());
  const configPath = opts.configPath ?? resolveGatewayConfigPath(process.env);

  const gatewayConfig = config.gateway as { mode?: string } | undefined;
  const isRemoteMode = gatewayConfig?.mode === "remote";

  return {
    config,
    configPath,
    isRemoteMode,
    urlOverride,
    urlOverrideSource,
    explicitAuth,
  };
}

/** 加载 Gateway 运行时配置（简化实现） */
function loadGatewayConfig(): Record<string, unknown> {
  // 简化实现：返回空配置，实际应从配置文件加载
  // 保持与 openclaw 相同的延迟加载模式，仅在需要时读取
  return {};
}

// ==================== 连接详情构建 ====================

/**
 * 构建 Gateway 连接详情
 *
 * URL 解析优先级：
 * 1. CLI/ENV URL 覆盖
 * 2. 配置的 remote URL（remote 模式）
 * 3. 本地默认地址（127.0.0.1:port）
 */
export function buildGatewayConnectionDetails(options: {
  config?: Record<string, unknown>;
  url?: string;
  configPath?: string;
  urlSource?: "cli" | "env";
  ignoreEnvUrlOverride?: boolean;
  localPortOverride?: number;
} = {}): GatewayConnectionDetails {
  const config = options.config ?? {};
  const gatewayConfig = config.gateway as
    | { remote?: { url?: string }; port?: unknown; host?: string }
    | undefined;

  // URL 覆盖优先
  if (options.url) {
    const urlSource = options.urlSource ?? "cli";
    return {
      url: options.url,
      urlSource,
      message: `gateway url: ${options.url} (source: ${urlSource})`,
    };
  }

  // remote 模式 URL
  const remoteUrl = trimToUndefined(gatewayConfig?.remote?.url);
  if (remoteUrl) {
    return {
      url: remoteUrl,
      urlSource: "config",
      message: `gateway url: ${remoteUrl} (source: config.remote.url)`,
      remoteFallbackNote: "remote mode",
    };
  }

  // 本地默认地址
  const port = options.localPortOverride ?? resolveGatewayPort(config, process.env);
  const host = trimToUndefined(gatewayConfig?.host) || "127.0.0.1";
  const url = `http://${host}:${port}`;
  const bindDetail = `bind: ${host}:${port}`;

  return {
    url,
    urlSource: "default",
    message: `gateway url: ${url} (source: default, port: ${port})`,
    bindDetail,
  };
}

// ==================== 超时解析 ====================

/** 解析调用超时，返回实际超时和安全定时器超时 */
function resolveGatewayCallTimeout(timeoutValue: unknown): {
  timeoutMs: number;
  safeTimerTimeoutMs: number;
} {
  const timeoutMs =
    typeof timeoutValue === "number" && Number.isFinite(timeoutValue) && timeoutValue > 0
      ? timeoutValue
      : DEFAULT_CALL_TIMEOUT_MS;
  const safeTimerTimeoutMs = Math.min(timeoutMs, MAX_TIMER_DELAY_MS);
  return { timeoutMs, safeTimerTimeoutMs };
}

// ==================== 凭据解析 ====================

/** 解析 Gateway 调用凭据 */
async function resolveGatewayCredentials(context: ResolvedGatewayCallContext): Promise<{
  token?: string;
  password?: string;
}> {
  // 显式凭据优先
  if (context.explicitAuth.token || context.explicitAuth.password) {
    return {
      token: context.explicitAuth.token,
      password: context.explicitAuth.password,
    };
  }

  // 环境变量凭据
  const envToken = trimToUndefined(
    process.env.CROSS_WMS_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN,
  );
  const envPassword = trimToUndefined(
    process.env.CROSS_WMS_GATEWAY_PASSWORD || process.env.OPENCLAW_GATEWAY_PASSWORD,
  );

  // 配置文件凭据
  const gatewayConfig = context.config.gateway as
    | { auth?: { token?: string; password?: string } }
    | undefined;
  const configToken = trimToUndefined(gatewayConfig?.auth?.token);
  const configPassword = trimToUndefined(gatewayConfig?.auth?.password);

  return {
    token: envToken ?? configToken,
    password: envPassword ?? configPassword,
  };
}

// ==================== 认证检查 ====================

/** 解析 Gateway 认证模式 */
function resolveGatewayAuthMode(config: Record<string, unknown>): string {
  const gatewayConfig = config.gateway as { auth?: { token?: string; password?: string } } | undefined;
  if (gatewayConfig?.auth?.token || gatewayConfig?.auth?.password) {
    return "token";
  }
  const envToken = process.env.CROSS_WMS_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN;
  const envPassword =
    process.env.CROSS_WMS_GATEWAY_PASSWORD || process.env.OPENCLAW_GATEWAY_PASSWORD;
  if (envToken || envPassword) {
    return "token";
  }
  return "none";
}

/**
 * 确保 Gateway 调用可认证
 *
 * fail-closed：认证模式下无凭据 → 抛出 GatewayCredentialsRequiredError
 */
function ensureGatewayCallCanAuthenticate(params: {
  opts: CallGatewayBaseOptions;
  context: ResolvedGatewayCallContext;
  token?: string;
  password?: string;
}): void {
  const authMode = resolveGatewayAuthMode(params.context.config);
  if (authMode !== "token") {
    return;
  }
  if (params.token || params.password) {
    return;
  }
  throw new GatewayCredentialsRequiredError({
    method: params.opts.method,
    configPath: params.context.configPath,
  });
}

// ==================== URL 安全校验 ====================

/** 判断 URL 是否为回环地址 */
function isLoopbackGatewayUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    const unbracketed =
      hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
    return unbracketed === "localhost" || isLoopbackAddress(unbracketed);
  } catch {
    return false;
  }
}

// ==================== HTTP 端点映射 ====================

/** 方法到 HTTP 端点的映射 */
function resolveHttpEndpoint(method: string, baseUrl: string): {
  url: string;
  httpMethod: "GET" | "POST";
} {
  const normalized = method.trim().toLowerCase();
  switch (normalized) {
    case "health":
    case "status":
      return { url: `${baseUrl}/health`, httpMethod: "GET" };
    case "models":
    case "models.list":
      return { url: `${baseUrl}/v1/models`, httpMethod: "GET" };
    case "chat":
    case "chat.completions":
      return { url: `${baseUrl}/v1/chat/completions`, httpMethod: "POST" };
    default:
      // 通用 RPC 端点（POST /gateway/rpc）
      return { url: `${baseUrl}/gateway/rpc`, httpMethod: "POST" };
  }
}

// ==================== 错误格式化 ====================

/** 格式化关闭错误消息 */
function formatGatewayCloseError(
  code: number,
  reason: string,
  connectionDetails: GatewayConnectionDetails,
): string {
  const reasonText = reason || "no close reason";
  const hint =
    code === 1006 ? "abnormal closure (no close frame)" : code === 1000 ? "normal closure" : "";
  const suffix = hint ? ` ${hint}` : "";
  let message = `gateway closed (${code}${suffix}): ${reasonText}\n${connectionDetails.message}`;
  if (code === 1006) {
    message +=
      "\n\nPossible causes:" +
      "\n- Gateway not yet ready to accept connections (retry after a moment)" +
      "\n- TLS mismatch (connecting with ws:// to a wss:// gateway, or vice versa)" +
      "\n- Gateway crashed or was terminated unexpectedly";
  }
  return message;
}

/** 格式化超时错误消息 */
function formatGatewayTimeoutError(
  timeoutMs: number,
  connectionDetails: GatewayConnectionDetails,
): string {
  return `gateway timeout after ${timeoutMs}ms\n${connectionDetails.message}`;
}

/** 创建关闭传输错误 */
function createGatewayCloseTransportError(params: {
  code: number;
  reason: string;
  connectionDetails: GatewayConnectionDetails;
}): GatewayTransportError {
  const reasonText = params.reason || "no close reason";
  return new GatewayTransportError({
    kind: "closed",
    code: params.code,
    reason: reasonText,
    connectionDetails: params.connectionDetails,
    message: formatGatewayCloseError(params.code, params.reason, params.connectionDetails),
  });
}

/** 创建超时传输错误 */
function createGatewayTimeoutTransportError(params: {
  timeoutMs: number;
  connectionDetails: GatewayConnectionDetails;
}): GatewayTransportError {
  return new GatewayTransportError({
    kind: "timeout",
    timeoutMs: params.timeoutMs,
    connectionDetails: params.connectionDetails,
    message: formatGatewayTimeoutError(params.timeoutMs, params.connectionDetails),
  });
}

/** 创建请求中断错误 */
function createGatewayRequestAbortError(method: string): Error {
  const err = new Error(`gateway request aborted for ${method}`);
  err.name = "AbortError";
  return err;
}

// ==================== RPC 请求执行 ====================

/**
 * 执行 Gateway RPC 请求
 *
 * 核心编排逻辑（参考 openclaw executeGatewayRequestWithScopes）：
 * - 支持 AbortSignal 中断
 * - 超时控制
 * - pre-hello 清洁关闭抑制：在主请求发出前，抑制首次瞬时连接错误
 * - 错误分类为 GatewayTransportError
 */
async function executeGatewayRequest<T>(params: {
  opts: CallGatewayBaseOptions;
  url: string;
  token?: string;
  password?: string;
  timeoutMs: number;
  safeTimerTimeoutMs: number;
  connectionDetails: GatewayConnectionDetails;
}): Promise<T> {
  const { opts, url, token, password, timeoutMs, safeTimerTimeoutMs, connectionDetails } = params;

  return await new Promise<T>((resolve, reject) => {
    // 检查是否已中断
    if (opts.signal?.aborted) {
      reject(createGatewayRequestAbortError(opts.method));
      return;
    }

    let settled = false;
    let primaryRequestStarted = false;
    let suppressedPreHelloCleanCloses = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startAbort = new AbortController();

    const cleanup = (): void => {
      startAbort.abort();
      if (opts.signal) {
        opts.signal.removeEventListener("abort", abortHandler);
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const stop = (err?: Error, value?: T): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (err) {
        reject(err);
      } else {
        resolve(value as T);
      }
    };

    const abortHandler = (): void => {
      if (settled) {
        return;
      }
      stop(createGatewayRequestAbortError(opts.method));
    };

    if (opts.signal) {
      opts.signal.addEventListener("abort", abortHandler, { once: true });
    }

    // 超时定时器
    timer = setTimeout(() => {
      stop(
        createGatewayTimeoutTransportError({
          timeoutMs,
          connectionDetails,
        }),
      );
    }, safeTimerTimeoutMs);

    // 执行 HTTP 请求
    void (async () => {
      try {
        const { url: endpointUrl, httpMethod } = resolveHttpEndpoint(opts.method, url);

        // 构建请求头
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        } else if (password) {
          headers.Authorization = `Bearer ${password}`;
        }

        primaryRequestStarted = true;

        const fetchOptions: RequestInit = {
          method: httpMethod,
          headers,
          signal: startAbort.signal,
        };
        if (httpMethod === "POST") {
          fetchOptions.body = JSON.stringify(
            opts.params ?? { method: opts.method, params: opts.params },
          );
        }

        const response = await fetch(endpointUrl, fetchOptions);

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          stop(
            createGatewayCloseTransportError({
              code: response.status,
              reason: errorText || response.statusText,
              connectionDetails,
            }),
          );
          return;
        }

        // 解析响应
        const result = (await response.json()) as T;
        stop(undefined, result);
      } catch (err) {
        const error = err as Error;

        // pre-hello 清洁关闭抑制：
        // 主请求发出前的瞬时连接错误（ECONNRESET 等）抑制首次，避免误报
        if (
          !primaryRequestStarted &&
          suppressedPreHelloCleanCloses < MAX_PRE_HELLO_SUPPRESSIONS &&
          isTransientConnectionError(error)
        ) {
          suppressedPreHelloCleanCloses += 1;
          logger.debug(`[GatewayCall] 抑制 pre-hello 瞬时错误: ${error.message}`);
          // 不 settle，等待超时或其他事件
          return;
        }

        // AbortError 由 abortHandler 处理
        if (error.name === "AbortError") {
          if (!settled) {
            stop(createGatewayRequestAbortError(opts.method));
          }
          return;
        }

        stop(
          createGatewayCloseTransportError({
            code: 1006,
            reason: error.message,
            connectionDetails,
          }),
        );
      }
    })();
  });
}

/** 判断是否为瞬时连接错误（可抑制） */
function isTransientConnectionError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("socket hang up") ||
    message.includes("fetch failed")
  );
}

// ==================== 带作用域的调用入口 ====================

/**
 * 带作用域的 Gateway 调用（内部核心函数）
 *
 * 编排流程：
 * 1. 解析调用上下文（resolveGatewayCallContext）
 * 2. 解析超时
 * 3. URL 覆盖强制显式认证（ensureExplicitGatewayAuth）
 * 4. 解析凭据
 * 5. 认证检查（ensureGatewayCallCanAuthenticate）
 * 6. 构建连接详情
 * 7. 执行 RPC 请求
 */
async function callGatewayWithScopes<T = Record<string, unknown>>(
  opts: CallGatewayBaseOptions,
  scopes: OperatorScope[] | undefined,
): Promise<T> {
  const context = await resolveGatewayCallContext(opts);
  const { timeoutMs, safeTimerTimeoutMs } = resolveGatewayCallTimeout(opts.timeoutMs);

  // 解析凭据
  const resolvedCredentials = await resolveGatewayCredentials(context);

  // URL 覆盖强制显式认证（fail-closed 安全策略）
  ensureExplicitGatewayAuth({
    urlOverride: context.urlOverride,
    urlOverrideSource: context.urlOverrideSource,
    explicitAuth: context.explicitAuth,
    resolvedAuth: resolvedCredentials,
    errorHint: "Fix: pass --token or --password (or gatewayToken in tools).",
    configPath: context.configPath,
  });

  // 认证检查
  ensureGatewayCallCanAuthenticate({
    opts,
    context,
    token: resolvedCredentials.token,
    password: resolvedCredentials.password,
  });

  // 构建连接详情
  const connectionDetails = buildGatewayConnectionDetails({
    config: context.config,
    url: context.urlOverride,
    urlSource: context.urlOverrideSource,
    ignoreEnvUrlOverride: opts.localPortOverride !== undefined,
    localPortOverride: opts.localPortOverride,
    ...(opts.configPath ? { configPath: opts.configPath } : {}),
  });

  const url = connectionDetails.url;

  // 验证 WebSocket URL 安全性（如 URL 为 ws:// 协议）
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    if (!isSecureWebSocketUrl(url)) {
      throw new GatewayExplicitAuthRequiredError(
        `insecure WebSocket URL rejected: ${url}. Use wss:// or a local/private endpoint.`,
      );
    }
  }

  logger.debug(
    `[GatewayCall] method=${opts.method} url=${url} scopes=${scopes?.join(",") ?? "none"}`,
  );

  return await executeGatewayRequest<T>({
    opts,
    url,
    token: resolvedCredentials.token,
    password: resolvedCredentials.password,
    timeoutMs,
    safeTimerTimeoutMs,
    connectionDetails,
  });
}

// ==================== 公开入口函数 ====================

/**
 * CLI 入口：使用 CLI 默认权限或自动解析最小权限
 *
 * - 如显式指定 scopes，使用指定 scopes
 * - 如方法已分类，自动解析最小权限 scopes
 * - 未分类方法回退到 CLI_DEFAULT_OPERATOR_SCOPES
 */
export async function callGatewayCli<T = Record<string, unknown>>(
  opts: CallGatewayCliOptions,
): Promise<T> {
  const scopes = Array.isArray(opts.scopes)
    ? opts.scopes
    : isGatewayMethodClassified(opts.method)
      ? resolveLeastPrivilegeOperatorScopesForMethod(opts.method, opts.params)
      : CLI_DEFAULT_OPERATOR_SCOPES;
  return await callGatewayWithScopes<T>(opts, scopes);
}

/**
 * 最小权限入口：严格基于方法分类解析 scopes
 *
 * 无论方法是否已分类，都通过 resolveLeastPrivilegeOperatorScopesForMethod 解析。
 * 未分类方法回退到 CLI_DEFAULT_OPERATOR_SCOPES。
 */
export async function callGatewayLeastPrivilege<T = Record<string, unknown>>(
  opts: CallGatewayBaseOptions,
): Promise<T> {
  const scopes = resolveLeastPrivilegeOperatorScopesForMethod(opts.method, opts.params);
  return await callGatewayWithScopes<T>(opts, scopes);
}

/**
 * 通用入口：自动路由到 CLI 或最小权限路径
 *
 * - CLI 客户端（clientName=cli 或 mode=cli）→ callGatewayCli
 * - 显式指定 scopes → callGatewayWithScopes
 * - 其他 → callGatewayLeastPrivilege
 */
export async function callGateway<T = Record<string, unknown>>(
  opts: CallGatewayOptions,
): Promise<T> {
  const clientName = opts.clientName ?? "cli";
  const isCliClient = clientName === "cli";

  if (isCliClient) {
    return await callGatewayCli<T>(opts);
  }

  if (Array.isArray(opts.scopes)) {
    return await callGatewayWithScopes<T>(opts, opts.scopes);
  }

  return await callGatewayLeastPrivilege<T>(opts);
}

// ==================== 探测连接详情构建 ====================

/** 探测连接详情（含 TLS 指纹和握手超时） */
export type GatewayProbeConnectionDetails = GatewayConnectionDetails & {
  tlsFingerprint?: string;
  preauthHandshakeTimeoutMs?: number;
};

/**
 * 构建探测连接详情
 *
 * 用于 probeGateway 的连接配置，复用调用上下文解析逻辑。
 */
export async function buildGatewayProbeConnectionDetails(
  opts: Pick<
    CallGatewayBaseOptions,
    "config" | "configPath" | "localPortOverride" | "password" | "token" | "url"
  > = {},
): Promise<GatewayProbeConnectionDetails> {
  const callOpts = { ...opts, method: "status" } as CallGatewayBaseOptions;
  const context = await resolveGatewayCallContext(callOpts);

  const connectionDetails = buildGatewayConnectionDetails({
    config: context.config,
    url: context.urlOverride,
    urlSource: context.urlOverrideSource,
    ignoreEnvUrlOverride: opts.localPortOverride !== undefined,
    localPortOverride: opts.localPortOverride,
    ...(opts.configPath ? { configPath: opts.configPath } : {}),
  });

  const result: GatewayProbeConnectionDetails = { ...connectionDetails };

  // 如有 TLS 指纹配置，附加
  const gatewayConfig = context.config.gateway as { tls?: { fingerprintSha256?: string } } | undefined;
  if (gatewayConfig?.tls?.fingerprintSha256) {
    result.tlsFingerprint = gatewayConfig.tls.fingerprintSha256;
  }

  return result;
}
