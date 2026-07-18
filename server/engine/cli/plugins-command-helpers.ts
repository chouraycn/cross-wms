// 插件 CLI 共享辅助：安装日志、文件 spec、hook、slot selection。
// 移植自 openclaw/src/cli/plugins-command-helpers.ts。
//
// 降级策略：
//  - 原模块依赖 `@openclaw/normalization-core/string-coerce` 的
//    `normalizeLowercaseStringOrEmpty`。改用 cross-wms 的
//    `../infra/string-coerce.js`，已提供同名导出，行为一致。
//  - 原模块依赖 `../../packages/terminal-core/src/theme.js` 的 `theme`。
//    cross-wms 未移植 terminal-core 包；这里内联一个 theme stub。
//  - 原模块依赖 `../config/types.openclaw.js` 的 `OpenClawConfig`。
//    使用 cross-wms 已有的 `../gateway/_openclaw-stubs.js` 中的占位类型。
//  - 原模块依赖 `../plugins/plugin-kind.types.js` 的 `PluginKind`。
//    cross-wms 已移植（`../plugins/plugin-kind.types.js`）。
//  - 原模块依赖 `../plugins/plugin-metadata-snapshot.js` 的
//    `loadPluginMetadataSnapshot`、`../plugins/slots.js` 的
//    `applyExclusiveSlotSelection`、`../plugins/status.js` 的
//    `buildPluginDiagnosticsReport`、`../runtime.js` 的 `defaultRuntime`/`RuntimeEnv`。
//    这些模块在 cross-wms 中尚未移植；这里对涉及这些依赖的函数提供
//    降级实现（slot selection 直接返回原 config，runtime 日志输出到 console），
//    保留函数签名以便未来替换为正式实现。

import { normalizeLowercaseStringOrEmpty } from "../infra/string-coerce.js";
import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";

export { quietPluginJsonLogger } from "./plugins-json-logger.js";

// ===== 内联 theme stub（替代未移植的 terminal-core/theme.js）=====
const theme = {
  warn(value: string): string {
    return value;
  },
  muted(value: string): string {
    return value;
  },
};
// ===== theme stub 结束 =====

// ===== 内联 RuntimeEnv 类型与 defaultRuntime stub =====
/**
 * CLI 运行时环境（降级占位）。
 *
 * 降级原因：openclaw 的 `runtime.js` 未移植。这里定义结构兼容的类型，
 * 使用 console.log/error 作为默认实现。
 */
export type RuntimeEnv = {
  log: (message: string) => void;
  error: (message: string) => void;
};

const defaultRuntime: RuntimeEnv = {
  log: (message) => {
    // eslint-disable-next-line no-console -- CLI 运行时降级实现，需要向用户输出消息。
    console.log(message);
  },
  error: (message) => {
    // eslint-disable-next-line no-console -- CLI 运行时降级实现，需要向用户输出错误。
    console.error(message);
  },
};
// ===== RuntimeEnv 结束 =====

type HookInternalEntryLike = Record<string, unknown> & { enabled?: boolean };

// ============================================================================
// 内联降级：file: / npm: / npm-pack: spec 解析
// ============================================================================

/**
 * 将 `file:` spec 解析为本地路径，失败返回错误描述。
 *
 * 支持 `file:<path>`、`file:///abs/path`、`file://localhost/abs/path`。
 * 其他 `file://host/...` 形式被视为不支持。
 */
export function resolveFileNpmSpecToLocalPath(
  raw: string,
): { ok: true; path: string } | { ok: false; error: string } | null {
  const trimmed = raw.trim();
  if (!normalizeLowercaseStringOrEmpty(trimmed).startsWith("file:")) {
    return null;
  }
  const rest = trimmed.slice("file:".length);
  if (!rest) {
    return { ok: false, error: "unsupported file: spec: missing path" };
  }
  if (rest.startsWith("///")) {
    return { ok: true, path: rest.slice(2) };
  }
  if (rest.startsWith("//localhost/")) {
    return { ok: true, path: rest.slice("//localhost".length) };
  }
  if (rest.startsWith("//")) {
    return {
      ok: false,
      error: 'unsupported file: URL host (expected "file:<path>" or "file:///abs/path")',
    };
  }
  return { ok: true, path: rest };
}

/**
 * 应用插件 slot selection。
 *
 * 降级实现：openclaw 的 `plugins/slots.js` 与 `plugins/plugin-metadata-snapshot.js`
 * 未移植。这里直接返回原 config 与空 warnings，保留函数签名以便未来替换。
 */
export function applySlotSelectionForPlugin(
  config: OpenClawConfig,
  _pluginId: string,
): { config: OpenClawConfig; warnings: string[] } {
  return { config, warnings: [] };
}

/** Create a plugin install logger that writes to the provided runtime. */
export function createPluginInstallLogger(runtime: RuntimeEnv = defaultRuntime): {
  info: (msg: string) => void;
  warn: (msg: string) => void;
} {
  return {
    info: (msg) => runtime.log(msg),
    warn: (msg) => runtime.log(theme.warn(msg)),
  };
}

/** Create a hook-pack install logger that writes to the provided runtime. */
export function createHookPackInstallLogger(runtime: RuntimeEnv = defaultRuntime): {
  info: (msg: string) => void;
  warn: (msg: string) => void;
} {
  return {
    info: (msg) => runtime.log(msg),
    warn: (msg) => runtime.log(theme.warn(msg)),
  };
}

/**
 * 启用 config.hooks.internal.entries 中指定的 hook。
 *
 * 降级说明：直接操作 OpenClawConfig 的 hooks.internal.entries 字段，
 * 不依赖 openclaw 内部模块。对未定义的 hooks 字段进行初始化。
 */
export function enableInternalHookEntries(
  config: OpenClawConfig,
  hookNames: string[],
): OpenClawConfig {
  const hooksSection = (config.hooks ?? {}) as Record<string, unknown>;
  const internalSection = (hooksSection.internal ?? {}) as Record<string, unknown>;
  const entries = {
    ...(internalSection.entries as Record<string, HookInternalEntryLike> | undefined),
  } as Record<string, HookInternalEntryLike>;

  for (const hookName of hookNames) {
    entries[hookName] = {
      ...entries[hookName],
      enabled: true,
    };
  }

  return {
    ...config,
    hooks: {
      ...hooksSection,
      internal: {
        ...internalSection,
        enabled: true,
        entries,
      },
    },
  };
}

/**
 * Format a plugin install error followed by a hook fallback error.
 *
 * 合并插件与 hook-pack 安装错误信息，并在插件已存在或路径无效时给出修复提示。
 */
export function formatPluginInstallWithHookFallbackError(
  pluginError: string,
  hookError: string,
): string {
  const formattedPluginError = formatPluginInstallAttemptError(pluginError);
  const formattedHookError = formatPluginInstallAttemptError(hookError);
  if (/plugin already exists: .+ \(delete it first\)/.test(pluginError)) {
    return `${formattedPluginError}\nUse \`openclaw plugins update <id-or-npm-spec>\` to upgrade the tracked plugin, or rerun install with \`--force\` to replace it.`;
  }
  if (
    pluginError.startsWith("Invalid extensions directory:") ||
    pluginError === "Invalid path: must stay within extensions directory"
  ) {
    return formattedPluginError;
  }
  return `${formattedPluginError}\nAlso not a valid hook pack: ${formattedHookError}`;
}

const MISSING_GIT_FOR_NPM_DEPENDENCY_HINT =
  "Git is required because one of this plugin's npm dependencies is fetched from a git URL, but `git` was not found on PATH. Install Git and rerun the install. On Windows, use `winget install --id Git.Git -e` or add a portable Git `bin` directory to PATH.";

function formatPluginInstallAttemptError(error: string): string {
  if (!isMissingGitForNpmDependencyError(error)) {
    return error;
  }
  if (error.includes(MISSING_GIT_FOR_NPM_DEPENDENCY_HINT)) {
    return error;
  }
  return `${error}\n\n${MISSING_GIT_FOR_NPM_DEPENDENCY_HINT}`;
}

function isMissingGitForNpmDependencyError(error: string): boolean {
  const normalized = normalizeLowercaseStringOrEmpty(error);
  return /\bspawn\s+git\b/u.test(normalized) && /\benoent\b/u.test(normalized);
}

/** Log a restart hint after hook-pack install. */
export function logHookPackRestartHint(runtime: RuntimeEnv = defaultRuntime) {
  runtime.log("Restart the gateway to load hooks.");
}

/** Log slot selection warnings (if any) to the provided runtime. */
export function logSlotWarnings(warnings: string[], runtime: RuntimeEnv = defaultRuntime) {
  if (warnings.length === 0) {
    return;
  }
  for (const warning of warnings) {
    runtime.log(theme.warn(warning));
  }
}

/** Parse a `npm:` prefixed spec, returning the inner spec or null if not prefixed. */
export function parseNpmPrefixSpec(raw: string): string | null {
  const trimmed = raw.trim();
  if (!normalizeLowercaseStringOrEmpty(trimmed).startsWith("npm:")) {
    return null;
  }
  return trimmed.slice("npm:".length).trim();
}

/** Parse a `npm-pack:` prefixed spec, returning the inner path or null if not prefixed. */
export function parseNpmPackPrefixPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!normalizeLowercaseStringOrEmpty(trimmed).startsWith("npm-pack:")) {
    return null;
  }
  return trimmed.slice("npm-pack:".length).trim();
}
