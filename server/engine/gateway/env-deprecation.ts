// Gateway 遗留环境变量告警。
// 为被忽略的 pre-OpenClaw 环境前缀发射一次性通知。
// 移植自 openclaw/src/gateway/env-deprecation.ts。
// 依赖调整：../infra/env.js（cross-wms 已存在等价导出）。
import { isVitestRuntimeEnv } from "../infra/env.js";

// 遗留环境告警是进程级且刻意为一次性的，这样正常的 gateway 启动噪声足以被注意，
// 又不会因重复 import 而刷屏。
const LEGACY_ENV_PREFIXES = ["CLAWDBOT_", "MOLTBOT_"] as const;
type LegacyEnvPrefix = (typeof LEGACY_ENV_PREFIXES)[number];

let warned = false;

/** 当存在被忽略的遗留 CLAWDBOT_/MOLTBOT_ 环境变量时发射一次性告警。 */
export function warnLegacyOpenClawEnvVars(env: NodeJS.ProcessEnv = process.env): void {
  if (warned || isVitestRuntimeEnv(env)) {
    return;
  }

  const prefixCounts = new Map<LegacyEnvPrefix, number>();
  for (const key of Object.keys(env)) {
    // 仅按前缀计数；绝不打印环境变量名或值，因为某些遗留名称可能仍编码了账号/提供商密钥。
    const prefix = LEGACY_ENV_PREFIXES.find((candidate) => key.startsWith(candidate));
    if (prefix) {
      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }
  }

  const legacyVarCount = [...prefixCounts.values()].reduce((total, count) => total + count, 0);
  if (legacyVarCount === 0) {
    return;
  }

  const detectedPrefixes = LEGACY_ENV_PREFIXES.filter((prefix) => prefixCounts.has(prefix))
    .map((prefix) => `${prefix}*`)
    .join(", ");

  process.emitWarning(
    [
      `Legacy ${detectedPrefixes} environment variables were detected (${legacyVarCount} total), but OpenClaw only reads OPENCLAW_* names now.`,
      "Rename them by replacing the legacy prefix with OPENCLAW_; the old names are ignored.",
    ].join("\n"),
    { code: "OPENCLAW_LEGACY_ENV_VARS", type: "DeprecationWarning" },
  );
  warned = true;
}

/** 重置一次性遗留环境告警锁存（供测试使用）。 */
export function resetLegacyOpenClawEnvWarningForTest(): void {
  warned = false;
}
