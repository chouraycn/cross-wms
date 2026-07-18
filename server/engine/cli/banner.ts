// CLI banner formatter and one-shot emitter.
// 移植自 openclaw/src/cli/banner.ts。
//
// 降级策略：
//  - 原模块依赖 ../../packages/terminal-core/src/{ansi,decorative-emoji,theme}.js。
//    cross-wms 未移植 terminal-core 包；内联降级实现。
//  - 原模块依赖 ../infra/git-commit.js 的 resolveCommitHash。降级为返回 "unknown"。
//  - 原模块依赖 ./argv.js 的 hasRootVersionAlias（已移植）、
//    ./banner-config-lite.js（已移植）、./tagline.js（已移植）。
//  - import.meta.url 改用 __filename。

import { hasRootVersionAlias } from "./argv.js";
import { parseTaglineMode, readCliBannerTaglineMode } from "./banner-config-lite.js";
import { pickTagline, type TaglineMode, type TaglineOptions } from "./tagline.js";

// ===== 内联 theme stub（替代未移植的 terminal-core/theme.js）=====
const theme = {
  heading(value: string): string {
    return value;
  },
  info(value: string): string {
    return value;
  },
  muted(value: string): string {
    return value;
  },
  accentDim(value: string): string {
    return value;
  },
};
// ===== theme stub 结束 =====

// ===== 内联 visibleWidth / decorativeEmoji / decorativePrefix stubs =====
function visibleWidth(value: string): number {
  // 降级：仅按字符长度计算，不处理 ANSI/宽字符。
  // eslint-disable-next-line no-control-regex -- 移除 ANSI 转义序列以估算可见宽度。
  return value.replace(/\u001b\[[0-9;]*m/gu, "").length;
}

type DecorativeEmojiOptions = {
  env?: NodeJS.ProcessEnv;
  isTty?: boolean;
  platform?: NodeJS.Platform;
};

function stripDecorativeEmojiForTerminal(value: string, _options: DecorativeEmojiOptions): string {
  return value;
}

function decorativePrefix(_emoji: string, label: string, _options: DecorativeEmojiOptions): string {
  return label;
}

function decorativeEmoji(emoji: string, _options: DecorativeEmojiOptions): string {
  return emoji;
}

function isRich(): boolean {
  return false;
}

// ===== stubs 结束 =====

// ===== 内联 resolveCommitHash stub =====
function resolveCommitHash(_params: {
  env?: NodeJS.ProcessEnv;
  moduleUrl?: string;
}): string | null {
  // 降级：openclaw 的 infra/git-commit.js 未移植。
  return null;
}
// ===== stub 结束 =====

type BannerOptions = TaglineOptions & {
  argv?: string[];
  commit?: string | null;
  columns?: number;
  isTty?: boolean;
  platform?: NodeJS.Platform;
  richTty?: boolean;
};

let bannerEmitted = false;

const hasJsonFlag = (argv: string[]) =>
  argv.some((arg) => arg === "--json" || arg.startsWith("--json="));

const hasVersionFlag = (argv: string[]) =>
  argv.some((arg) => arg === "--version" || arg === "-V") || hasRootVersionAlias(argv);

function resolveTaglineMode(options: BannerOptions): TaglineMode | undefined {
  const explicit = parseTaglineMode(options.mode);
  if (explicit) {
    return explicit;
  }
  return readCliBannerTaglineMode(options.env);
}

function resolveEmojiOptions(options: BannerOptions): DecorativeEmojiOptions {
  return {
    ...(options.env ? { env: options.env } : {}),
    ...(options.isTty === undefined ? {} : { isTty: options.isTty }),
    ...(options.platform ? { platform: options.platform } : {}),
  };
}

/** Format the compact one-line CLI banner, wrapping tagline when terminal width requires it. */
export function formatCliBannerLine(version: string, options: BannerOptions = {}): string {
  const commit = options.commit ?? resolveCommitHash({ env: options.env, moduleUrl: __filename });
  const commitLabel = commit ?? "unknown";
  const emojiOptions = resolveEmojiOptions(options);
  const tagline = stripDecorativeEmojiForTerminal(
    pickTagline({ ...options, mode: resolveTaglineMode(options) }),
    emojiOptions,
  );
  const rich = options.richTty ?? isRich();
  const title = decorativePrefix("lobster", "OpenClaw", emojiOptions);
  const prefix = decorativeEmoji("lobster", emojiOptions);
  const indent = prefix ? `${prefix} ` : "";
  const columns = options.columns ?? process.stdout.columns ?? 120;
  const plainBaseLine = `${title} ${version} (${commitLabel})`;
  const plainFullLine = tagline ? `${plainBaseLine} — ${tagline}` : plainBaseLine;
  const fitsOnOneLine = visibleWidth(plainFullLine) <= columns;
  if (rich) {
    if (fitsOnOneLine) {
      if (!tagline) {
        return `${theme.heading(title)} ${theme.info(version)} ${theme.muted(`(${commitLabel})`)}`;
      }
      return `${theme.heading(title)} ${theme.info(version)} ${theme.muted(
        `(${commitLabel})`,
      )} ${theme.muted("—")} ${theme.accentDim(tagline)}`;
    }
    const line1 = `${theme.heading(title)} ${theme.info(version)} ${theme.muted(
      `(${commitLabel})`,
    )}`;
    if (!tagline) {
      return line1;
    }
    const line2 = `${" ".repeat(indent.length)}${theme.accentDim(tagline)}`;
    return `${line1}\n${line2}`;
  }
  if (fitsOnOneLine) {
    return plainFullLine;
  }
  const line1 = plainBaseLine;
  if (!tagline) {
    return line1;
  }
  const line2 = `${" ".repeat(indent.length)}${tagline}`;
  return `${line1}\n${line2}`;
}

/** Emit the CLI banner once for interactive, non-JSON, non-version invocations. */
export function emitCliBanner(version: string, options: BannerOptions = {}): void {
  if (bannerEmitted) {
    return;
  }
  const argv = options.argv ?? process.argv;
  const isTty = options.isTty ?? process.stdout.isTTY;
  if (!isTty) {
    return;
  }
  if (hasJsonFlag(argv)) {
    return;
  }
  if (hasVersionFlag(argv)) {
    return;
  }
  const line = formatCliBannerLine(version, options);
  process.stdout.write(`\n${line}\n\n`);
  bannerEmitted = true;
}

/** Return whether the current process already emitted the CLI banner. */
export function hasEmittedCliBanner(): boolean {
  return bannerEmitted;
}

export const testing = {
  resetBannerEmittedForTests(): void {
    bannerEmitted = false;
  },
};
export { testing as __testing };
