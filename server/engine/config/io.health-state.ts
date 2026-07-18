// 移植自 openclaw/src/config/io.health-state.ts
// 在共享 SQLite 状态中存储配置健康指纹。
//
// 降级说明：源文件依赖以下不存在的模块：
//   - ../infra/kysely-sync.js（executeSqliteQuerySync、getNodeSqliteKysely）
//   - ../state/openclaw-state-db.generated.js（DB 类型）
//   - ../state/openclaw-state-db.js（openOpenClawStateDatabase、runOpenClawStateWriteTransaction）
// cross-wms 暂未移植对应 SQLite 状态库，此处实现为内存降级版本：
//   - 读返回空状态，写为 no-op。
// 这样依赖方 io.ts / io.observe-recovery.ts 可继续编译并工作（指纹追踪不可用）。

export type ConfigHealthFingerprint = {
  hash: string;
  bytes: number;
  mtimeMs: number | null;
  ctimeMs: number | null;
  dev: string | null;
  ino: string | null;
  mode: number | null;
  nlink: number | null;
  uid: number | null;
  gid: number | null;
  hasMeta: boolean;
  gatewayMode: string | null;
  observedAt: string;
};

export type ConfigHealthEntry = {
  lastKnownGood?: ConfigHealthFingerprint;
  lastPromotedGood?: ConfigHealthFingerprint;
  lastObservedSuspiciousSignature?: string | null;
};

export type ConfigHealthState = {
  entries?: Record<string, ConfigHealthEntry>;
};

export type ConfigHealthStateDeps = {
  env: NodeJS.ProcessEnv;
  homedir: () => string;
  logger: Pick<typeof console, 'warn'>;
};

/** 降级实现：从存储读取配置健康状态。SQLite 状态库未移植，返回空状态。 */
export function readConfigHealthStateFromStore(_deps: ConfigHealthStateDeps): ConfigHealthState {
  // 降级说明：源文件使用 SQLite 状态库持久化 health entries。cross-wms 暂未移植，
  // 返回空状态使观察者认为没有任何 last-known-good 基线。
  return {};
}

/** 降级实现：写入配置健康状态到存储。SQLite 状态库未移植，no-op。 */
export function writeConfigHealthStateToStore(
  _deps: ConfigHealthStateDeps,
  _state: ConfigHealthState,
): void {
  // 降级说明：源文件使用 SQLite 写事务持久化 health entries。cross-wms 暂未移植，
  // 静默丢弃写入以保持调用方 API 兼容。
}
