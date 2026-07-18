// 移植自 openclaw/src/config/future-version-guard.ts
// 拒绝由不支持的更高版本写入的配置文件。
//
// 降级说明：源文件依赖 ../version.js 的 VERSION 常量。cross-wms 的
// version.ts 未导出该常量（仅导出版本解析助手），此处使用静态占位版本，
// 与 io.meta.ts 的降级策略保持一致。
import type { ConfigFileSnapshot, OpenClawConfig } from './types/openclaw.js';
import { shouldWarnOnTouchedVersion } from './version.js';

/** 降级说明：未知运行时版本时使用占位版本号。 */
const VERSION = '0.0.0-unknown';

/** 显式允许旧版二进制执行破坏性配置操作的环境变量。 */
export const ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS_ENV =
  'OPENCLAW_ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS';

/** 当旧版二进制试图修改新版写入的配置时展示的拦截载荷。 */
export type FutureConfigActionBlock = {
  action: string;
  currentVersion: string;
  touchedVersion: string;
  message: string;
  hints: string[];
};

type FutureConfigGuardParams = {
  action: string;
  snapshot?: Pick<ConfigFileSnapshot, 'config' | 'sourceConfig'> | null;
  config?: Pick<OpenClawConfig, 'meta'> | null;
  currentVersion?: string;
  env?: Record<string, string | undefined>;
};

function allowOlderBinaryDestructiveActions(env: Record<string, string | undefined>): boolean {
  const raw = env[ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS_ENV]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function resolveTouchedVersion(params: FutureConfigGuardParams): string | null {
  // 优先使用原始源配置元数据，避免迁移/默认值掩盖更高版本的写入者。
  return (
    params.snapshot?.sourceConfig?.meta?.lastTouchedVersion?.trim() ||
    params.snapshot?.config?.meta?.lastTouchedVersion?.trim() ||
    params.config?.meta?.lastTouchedVersion?.trim() ||
    null
  );
}

/** 解析破坏性操作是否应被未来配置元数据拦截。 */
export function resolveFutureConfigActionBlock(
  params: FutureConfigGuardParams,
): FutureConfigActionBlock | null {
  const env = params.env ?? process.env;
  if (allowOlderBinaryDestructiveActions(env)) {
    return null;
  }

  const currentVersion = params.currentVersion ?? VERSION;
  const touchedVersion = resolveTouchedVersion(params);
  if (!touchedVersion || !shouldWarnOnTouchedVersion(currentVersion, touchedVersion)) {
    return null;
  }

  return {
    action: params.action,
    currentVersion,
    touchedVersion,
    message: `Refusing to ${params.action} because this OpenClaw binary (${currentVersion}) is older than the config last written by OpenClaw ${touchedVersion}.`,
    hints: [
      'Run the newer openclaw binary on PATH, or reinstall the intended gateway service from the newer install.',
      `Set ${ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS_ENV}=1 only for an intentional downgrade or recovery action.`,
    ],
  };
}

/** 将未来配置操作拦截信息格式化为 CLI/服务错误输出。 */
export function formatFutureConfigActionBlock(block: FutureConfigActionBlock): string {
  return [block.message, ...block.hints].join('\n');
}
