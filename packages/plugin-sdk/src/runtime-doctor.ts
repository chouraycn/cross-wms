// 运行时 SDK 子路径：插件 doctor 迁移、兼容性检查与卸载辅助。
// openclaw 原始实现从 ../config/**、../infra/**、../plugin-state/**、../plugins/** 重导出，
// 依赖未移植。此处提供最小可用类型与桩函数。

/** 兼容性变更结果。 */
export type CompatMutationResult = {
  /** 是否发生变更。 */
  changed: boolean;
  /** 变更说明列表。 */
  notes: string[];
};

/** 旧版流式别名选项。 */
export type LegacyStreamingAliasOptions = {
  /** 旧版别名列表。 */
  aliases: string[];
  /** 目标规范名称。 */
  canonical: string;
};

/** 规范化旧版渠道账号参数。 */
export type NormalizeLegacyChannelAccountParams = {
  channelId: string;
  accountId?: string;
};

/** Keyed 存储打开选项。 */
export type OpenKeyedStoreOptions = {
  /** 命名空间。 */
  namespace?: string;
  /** 是否持久化。 */
  persistent?: boolean;
};

/** 插件状态 Keyed 存储。 */
export type PluginStateKeyedStore = {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
};

/** 插件 doctor 状态迁移上下文。 */
export type PluginDoctorStateMigrationContext = {
  /** 插件 ID。 */
  pluginId: string;
  /** 状态目录路径。 */
  stateDir: string;
  /** 日志记录器。 */
  log(message: string): void;
};

/** 插件 doctor 状态迁移描述。 */
export type PluginDoctorStateMigration = {
  /** 迁移唯一标识。 */
  id: string;
  /** 迁移说明。 */
  description: string;
  /** 执行迁移。 */
  run(context: PluginDoctorStateMigrationContext): Promise<CompatMutationResult>;
};

/** Doctor 会话路由状态归属者。 */
export type DoctorSessionRouteStateOwner = {
  pluginId: string;
  migrateState?(context: PluginDoctorStateMigrationContext): Promise<CompatMutationResult>;
};

// TODO: 依赖模块未移植，暂用本地桩
export function collectProviderDangerousNameMatchingScopes(
  _providerId: string,
): string[] {
  return [];
}

// TODO: 依赖模块未移植，暂用本地桩
export function asObjectRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

// TODO: 依赖模块未移植，暂用本地桩
export function hasLegacyAccountStreamingAliases(_input: unknown): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function hasLegacyStreamingAliases(_input: unknown): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function normalizeLegacyChannelAliases(
  _input: unknown,
): CompatMutationResult {
  return { changed: false, notes: [] };
}

// TODO: 依赖模块未移植，暂用本地桩
export function normalizeLegacyDmAliases(
  _input: unknown,
): CompatMutationResult {
  return { changed: false, notes: [] };
}

// TODO: 依赖模块未移植，暂用本地桩
export function normalizeLegacyStreamingAliases(
  _input: unknown,
  _options?: LegacyStreamingAliasOptions,
): CompatMutationResult {
  return { changed: false, notes: [] };
}

/** 插件安装路径问题。 */
export type PluginInstallPathIssue = {
  /** 问题类型。 */
  kind: "missing" | "symlink" | "permission" | "unknown";
  /** 路径。 */
  path: string;
  /** 说明。 */
  message: string;
};

// TODO: 依赖模块未移植，暂用本地桩
export function detectPluginInstallPathIssue(_pluginId: string): PluginInstallPathIssue | undefined {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export function formatPluginInstallPathIssue(issue: PluginInstallPathIssue): string {
  return `[${issue.kind}] ${issue.path}: ${issue.message}`;
}

// TODO: 依赖模块未移植，暂用本地桩
export function createPluginStateSyncKeyedStore(
  _options?: OpenKeyedStoreOptions,
): PluginStateKeyedStore {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.get(key);
    },
    async set(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async keys() {
      return Array.from(map.keys());
    },
  };
}

// TODO: 依赖模块未移植，暂用本地桩
export async function removePluginFromConfig(_pluginId: string): Promise<CompatMutationResult> {
  return { changed: false, notes: [] };
}
