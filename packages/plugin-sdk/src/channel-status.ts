// 通道状态摘要：凭据快照、探测问题与状态汇总。
// openclaw 原始实现从 ../channels/plugins/pairing-message.js、../channels/account-snapshot-fields.js、
// ./status-helpers.js 重导出。status-helpers 已有实际实现（移植自 openclaw），
// 此处提供最小可用类型与桩函数。

export const PAIRING_APPROVED_MESSAGE = "Pairing approved";

/** 渠道账号快照。 */
export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string;
  enabled?: boolean;
  configured?: boolean;
  running?: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: unknown;
  lastProbeAt?: number | null;
  connected?: boolean;
  restartPending?: boolean;
  reconnectAttempts?: number;
  lastConnectedAt?: number | null;
  lastDisconnect?: string | { at: number; status?: number; error?: string; loggedOut?: boolean } | null;
  lastEventAt?: number | null;
  lastTransportActivityAt?: number | null;
  healthState?: string | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
};

/** 渠道状态问题。 */
export type ChannelStatusIssue = {
  channel: string;
  accountId?: string;
  kind: "config" | "runtime" | "auth" | "network";
  message: string;
};

/** 反应级别。 */
export type ReactionLevel = "none" | "ack" | "info" | "warn" | "error";

/** 解析后的反应级别。 */
export type ResolvedReactionLevel = ReactionLevel;

/** 渠道状态适配器。 */
export type ChannelStatusAdapter<ResolvedAccount = unknown, Probe = unknown, Audit = unknown> = {
  defaultRuntime?: unknown;
  buildChannelSummary?(snapshot: unknown): unknown;
  probeAccount?(account: ResolvedAccount): Promise<Probe>;
  formatCapabilitiesProbe?(probe: Probe): unknown;
  auditAccount?(account: ResolvedAccount): Promise<Audit>;
  buildCapabilitiesDiagnostics?(audit: Audit): unknown;
  logSelfId?(account: ResolvedAccount, selfId: unknown): void;
  resolveAccountState?(account: ResolvedAccount): unknown;
  collectStatusIssues?(accounts: ResolvedAccount[]): ChannelStatusIssue[];
  buildAccountSnapshot?(params: {
    account: ResolvedAccount;
    cfg?: unknown;
    runtime?: ChannelAccountSnapshot;
    probe?: Probe;
    audit?: Audit;
  }): Promise<ChannelAccountSnapshot> | ChannelAccountSnapshot;
};

// ---- 凭据快照字段投影 ----

/** 投影凭据快照字段。 */
// TODO: 依赖模块未移植，暂用本地桩
export function projectCredentialSnapshotFields(_input?: unknown): Record<string, unknown> {
  return {};
}

/** 从凭据状态解析 configuredFrom。 */
// TODO: 依赖模块未移植，暂用本地桩
export function resolveConfiguredFromCredentialStatuses(_input?: unknown): string {
  return "none";
}

/** 从必需凭据状态解析 configuredFrom。 */
// TODO: 依赖模块未移植，暂用本地桩
export function resolveConfiguredFromRequiredCredentialStatuses(_input?: unknown): string {
  return "none";
}

// ---- 状态摘要构建 ----

/** 创建默认渠道运行时状态。 */
export function createDefaultChannelRuntimeState<T extends Record<string, unknown>>(
  accountId: string,
  extra?: T,
): {
  accountId: string;
  running: false;
  lastStartAt: null;
  lastStopAt: null;
  lastError: null;
} & T {
  return {
    accountId,
    running: false,
    lastStartAt: null,
    lastStopAt: null,
    lastError: null,
    ...(extra ?? ({} as T)),
  };
}

/** 构建基础渠道状态摘要。 */
export function buildBaseChannelStatusSummary<TExtra extends Record<string, unknown>>(
  snapshot: {
    configured?: boolean | null;
    running?: boolean | null;
    lastStartAt?: number | null;
    lastStopAt?: number | null;
    lastError?: string | null;
  },
  extra?: TExtra,
) {
  return {
    configured: snapshot.configured ?? false,
    ...(extra ?? ({} as TExtra)),
    running: snapshot.running ?? false,
    lastStartAt: snapshot.lastStartAt ?? null,
    lastStopAt: snapshot.lastStopAt ?? null,
    lastError: snapshot.lastError ?? null,
  };
}

/** 构建探测渠道状态摘要。 */
export function buildProbeChannelStatusSummary<TExtra extends Record<string, unknown>>(
  snapshot: {
    configured?: boolean | null;
    running?: boolean | null;
    lastStartAt?: number | null;
    lastStopAt?: number | null;
    lastError?: string | null;
    probe?: unknown;
    lastProbeAt?: number | null;
  },
  extra?: TExtra,
) {
  return {
    ...buildBaseChannelStatusSummary(snapshot, extra),
    probe: snapshot.probe,
    lastProbeAt: snapshot.lastProbeAt ?? null,
  };
}

/** 构建令牌渠道状态摘要。 */
export function buildTokenChannelStatusSummary(
  snapshot: {
    configured?: boolean | null;
    tokenSource?: string | null;
    running?: boolean | null;
    mode?: string | null;
    lastStartAt?: number | null;
    lastStopAt?: number | null;
    lastError?: string | null;
    probe?: unknown;
    lastProbeAt?: number | null;
  },
  opts?: { includeMode?: boolean },
) {
  const base = {
    ...buildBaseChannelStatusSummary(snapshot),
    tokenSource: snapshot.tokenSource ?? "none",
    probe: snapshot.probe,
    lastProbeAt: snapshot.lastProbeAt ?? null,
  };
  if (opts?.includeMode === false) {
    return base;
  }
  return { ...base, mode: snapshot.mode ?? null };
}

/** 构建计算账号状态快照。 */
export function buildComputedAccountStatusSnapshot<TExtra extends Record<string, unknown>>(
  params: {
    accountId: string;
    name?: string;
    enabled?: boolean;
    configured?: boolean;
    runtime?: Record<string, unknown> | null;
    probe?: unknown;
  },
  extra?: TExtra,
): ChannelAccountSnapshot {
  const { accountId, name, enabled, configured, runtime, probe } = params;
  return {
    accountId,
    name,
    enabled,
    configured,
    running: (runtime?.running as boolean | undefined) ?? false,
    lastStartAt: (runtime?.lastStartAt as number | null | undefined) ?? null,
    lastStopAt: (runtime?.lastStopAt as number | null | undefined) ?? null,
    lastError: (runtime?.lastError as string | null | undefined) ?? null,
    probe,
    lastInboundAt: (runtime?.lastInboundAt as number | null | undefined) ?? null,
    lastOutboundAt: (runtime?.lastOutboundAt as number | null | undefined) ?? null,
    ...(extra ?? ({} as TExtra)),
  };
}

/** 从最后错误收集状态问题。 */
export function collectStatusIssuesFromLastError(
  channel: string,
  accounts: Array<{ accountId: string; lastError?: unknown }>,
): ChannelStatusIssue[] {
  return accounts.flatMap((account) => {
    const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
    if (!lastError) return [];
    return [
      {
        channel,
        accountId: account.accountId,
        kind: "runtime" as const,
        message: `Channel error: ${lastError}`,
      },
    ];
  });
}

// ---- 反应级别 ----

/** 解析反应级别。 */
export function resolveReactionLevel(input: unknown): ReactionLevel {
  if (typeof input !== "string") return "none";
  const normalized = input.toLowerCase();
  if (normalized === "ack" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return "none";
}

// ---- 共享辅助 ----

/** 判断值是否为普通对象记录。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 追加匹配元数据。 */
// TODO: 依赖模块未移植，暂用本地桩
export function appendMatchMetadata(_input: unknown, _metadata: unknown): unknown {
  return _input;
}

/** 转为字符串。 */
// TODO: 依赖模块未移植，暂用本地桩
export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** 为已启用账号收集问题。 */
// TODO: 依赖模块未移植，暂用本地桩
export function collectIssuesForEnabledAccounts(
  _channel: string,
  _accounts: unknown[],
): ChannelStatusIssue[] {
  return [];
}

/** 格式化匹配元数据。 */
// TODO: 依赖模块未移植，暂用本地桩
export function formatMatchMetadata(_input: unknown): string {
  return "";
}

/** 解析已启用已配置账号 ID。 */
// TODO: 依赖模块未移植，暂用本地桩
export function resolveEnabledConfiguredAccountId(_input: unknown): string | undefined {
  return undefined;
}
