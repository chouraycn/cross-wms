// 浏览器插件配置公共 SDK 子路径：CDP URL、配置与鉴权辅助。
// 注意：openclaw 原始实现为 barrel 重导出，依赖 ../browser-profiles.js、
// ../browser-cdp.js、../browser-control-auth.js、../browser-trash.js 等未移植模块。
// 此处提供最小可用实现，保留公共类型与函数签名，待依赖模块移植后替换。

/** 浏览器标签页清理配置。 */
export type ResolvedBrowserTabCleanupConfig = {
  /** 是否在会话结束后自动清理浏览器标签页。 */
  enabled: boolean;
  /** 标签页关闭前的等待时间（毫秒）。 */
  closeDelayMs?: number;
};

/** 解析后的浏览器配置。 */
export type ResolvedBrowserConfig = {
  /** 是否启用浏览器能力。 */
  enabled: boolean;
  /** 浏览器控制协议（CDP）的基础 URL。 */
  cdpUrl?: string;
  /** 默认使用的浏览器档案名称。 */
  defaultProfileName: string;
  /** 单次 AI 快照最大字符数。 */
  aiSnapshotMaxChars: number;
  /** 浏览器操作默认超时时间（毫秒）。 */
  actionTimeoutMs: number;
  /** 是否允许 evaluate 执行。 */
  evaluateEnabled: boolean;
  /** 标签页清理配置。 */
  tabCleanup: ResolvedBrowserTabCleanupConfig;
};

/** 解析后的浏览器档案。 */
export type ResolvedBrowserProfile = {
  /** 档案名称。 */
  name: string;
  /** 档案显示颜色。 */
  color?: string;
  /** 上传目录路径。 */
  uploadDir?: string;
};

/** 浏览器控制鉴权信息。 */
export type BrowserControlAuth = {
  /** 鉴权 token。 */
  token?: string;
  /** 是否要求鉴权。 */
  required: boolean;
};

/** 移动路径到回收站的选项。 */
export type MovePathToTrashOptions = {
  /** 是否在失败时抛出异常；为 false 时仅记录警告。 */
  throwOnFailure?: boolean;
};

// ---- 默认常量（与 openclaw 保持一致的命名） ----
export const DEFAULT_AI_SNAPSHOT_MAX_CHARS = 8000;
export const DEFAULT_BROWSER_ACTION_TIMEOUT_MS = 30_000;
export const DEFAULT_BROWSER_DEFAULT_PROFILE_NAME = "default";
export const DEFAULT_BROWSER_EVALUATE_ENABLED = false;
export const DEFAULT_OPENCLAW_BROWSER_COLOR = "#3b82f6";
export const DEFAULT_OPENCLAW_BROWSER_ENABLED = false;
export const DEFAULT_OPENCLAW_BROWSER_PROFILE_NAME = "openclaw";
export const DEFAULT_UPLOAD_DIR = "uploads";

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function resolveBrowserConfig(
  _input?: unknown,
): ResolvedBrowserConfig {
  return {
    enabled: DEFAULT_OPENCLAW_BROWSER_ENABLED,
    defaultProfileName: DEFAULT_BROWSER_DEFAULT_PROFILE_NAME,
    aiSnapshotMaxChars: DEFAULT_AI_SNAPSHOT_MAX_CHARS,
    actionTimeoutMs: DEFAULT_BROWSER_ACTION_TIMEOUT_MS,
    evaluateEnabled: DEFAULT_BROWSER_EVALUATE_ENABLED,
    tabCleanup: { enabled: false },
  };
}

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function resolveProfile(
  name: string | undefined,
  _config?: ResolvedBrowserConfig,
): ResolvedBrowserProfile {
  return {
    name: name ?? DEFAULT_BROWSER_DEFAULT_PROFILE_NAME,
    color: DEFAULT_OPENCLAW_BROWSER_COLOR,
  };
}

/** 校验并解析浏览器 HTTP/CDP URL。 */
export function parseBrowserHttpUrl(input: string): URL {
  return new URL(input);
}

/** 对 CDP URL 中的敏感凭据进行脱敏，便于日志输出。 */
export function redactCdpUrl(input: string): string {
  try {
    const url = new URL(input);
    if (url.username || url.password) {
      url.username = "redacted";
      url.password = "";
    }
    return url.toString();
  } catch {
    return input;
  }
}

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function ensureBrowserControlAuth(_input?: unknown): BrowserControlAuth {
  return { required: false };
}

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function resolveBrowserControlAuth(_input?: unknown): BrowserControlAuth {
  return { required: false };
}

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export async function movePathToTrash(
  _path: string,
  _options?: MovePathToTrashOptions,
): Promise<void> {
  // 待 browser-trash 模块移植后接入真实回收站实现。
}
