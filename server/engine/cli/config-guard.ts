// CLI config readiness guard: simplified for cross-wms.
// 移植自 openclaw/src/cli/program/config-guard.ts
//
// 降级策略：
//  - 原模块依赖大量 OpenClaw 内部模块（config, infra, runtime, terminal-core 等）。
//    cross-wms 不具备这些依赖；此处提供简化版 config guard，
//    在 cross-wms 中不做任何配置检查（总是认为配置可用）。

/** Simplified config readiness check for cross-wms. Always succeeds. */
export async function ensureConfigReady(_params: {
  runtime?: unknown;
  commandPath?: string[];
  suppressDoctorStdout?: boolean;
  allowInvalid?: boolean;
  beforeStateMigrations?: unknown;
}): Promise<void> {
  // cross-wms 没有 OpenClaw 的配置系统，不做任何检查
}

export const testApi = {
  resetConfigGuardStateForTests(): void {
    // no-op in cross-wms
  },
};
export { testApi as __test__ };
