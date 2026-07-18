// 解析 OpenClaw 更新渠道（stable/beta/dev），根据 config、tag、版本决定。
// 降级实现：openclaw 中从 @openclaw/normalization-core/string-coerce 导入
// normalizeOptionalLowercaseString；cross-wms 使用本地 string-coerce.js。
import { normalizeOptionalLowercaseString } from "./string-coerce.js";
import { parseComparableSemver } from "./semver-compare.js";

/** 用于选择 registry tag 与更新策略默认值的发布流。 */
export type UpdateChannel = "stable" | "beta" | "dev";
/** 决定有效更新渠道的来源证据。 */
export type UpdateChannelSource =
  | "config"
  | "git-tag"
  | "git-branch"
  | "installed-version"
  | "default";

/** 当没有 config 或版本信号覆盖时，npm/package 安装的默认渠道。 */
export const DEFAULT_PACKAGE_CHANNEL: UpdateChannel = "stable";
/** 当分支元数据不可用时，源码安装的默认渠道。 */
export const DEFAULT_GIT_CHANNEL: UpdateChannel = "dev";
/**
 * 将 *有效* 更新渠道传递给 `openclaw update finalize` 的环境变量
 * （例如源码更新实际运行的 git/dev 渠道），但不使其成为 *被请求的* 渠道。
 * 收敛时用作回退；它从不被持久化到 `update.channel`。
 * 与 CLI post-core resume 的 effective/requested 渠道分离对应
 * （`OPENCLAW_UPDATE_POST_CORE_CHANNEL` vs `…_REQUESTED_CHANNEL`）。
 */
export const UPDATE_EFFECTIVE_CHANNEL_ENV = "OPENCLAW_UPDATE_EFFECTIVE_CHANNEL";
/** 代表开发更新流的 git 分支。 */
export const DEV_BRANCH = "main";

/** 将 config 或 CLI 渠道输入规范化为支持的更新渠道。 */
export function normalizeUpdateChannel(value?: string | null): UpdateChannel | null {
  const normalized = normalizeOptionalLowercaseString(value);
  if (!normalized) {
    return null;
  }
  if (normalized === "stable" || normalized === "beta" || normalized === "dev") {
    return normalized;
  }
  return null;
}

/** 将 OpenClaw 更新渠道映射到用于包查询的 npm dist-tag。 */
export function channelToNpmTag(channel: UpdateChannel): string {
  if (channel === "beta") {
    return "beta";
  }
  if (channel === "dev") {
    return "dev";
  }
  return "latest";
}

/** 返回版本/tag 是否显式指向 beta 流。 */
export function isBetaTag(tag: string): boolean {
  return /(?:^|[.-])beta(?:[.-]|$)/i.test(tag);
}

/** 检测 prerelease tag，包括遗留的 dot-beta tag 与命名的 prerelease 渠道。 */
export function isPrereleaseTag(tag: string): boolean {
  const parsed = parseComparableSemver(tag, { normalizeLegacyDotBeta: true });
  if (parsed) {
    return Boolean(parsed.prerelease?.some((part) => !/^[0-9]+$/.test(part)));
  }
  return /(?:^|[.-])(alpha|beta|rc|pre|preview|canary|dev|next|nightly|experimental)(?:[.-]|$)/i.test(
    tag,
  );
}

/** 返回 tag 是否应被视为用于更新的稳定发布候选。 */
export function isStableTag(tag: string): boolean {
  return !isPrereleaseTag(tag);
}

/** 解析用于包检查的 registry 更新渠道，默认保留 beta 安装。 */
export function resolveRegistryUpdateChannel(params: {
  configChannel?: UpdateChannel | null;
  currentVersion?: string | null;
}): UpdateChannel {
  if (
    params.currentVersion &&
    isBetaTag(params.currentVersion) &&
    params.configChannel !== "beta" &&
    params.configChannel !== "dev"
  ) {
    return "beta";
  }
  return params.configChannel ?? DEFAULT_PACKAGE_CHANNEL;
}

/** 解析有效渠道与选择它的信号。 */
export function resolveEffectiveUpdateChannel(params: {
  configChannel?: UpdateChannel | null;
  currentVersion?: string | null;
  installKind: "git" | "package" | "unknown";
  git?: { tag?: string | null; branch?: string | null };
}): { channel: UpdateChannel; source: UpdateChannelSource } {
  if (
    params.currentVersion &&
    isBetaTag(params.currentVersion) &&
    params.configChannel !== "beta" &&
    params.configChannel !== "dev"
  ) {
    return { channel: "beta", source: "installed-version" };
  }

  if (params.configChannel) {
    return { channel: params.configChannel, source: "config" };
  }

  if (params.installKind === "git") {
    const tag = params.git?.tag;
    if (tag) {
      return {
        channel: isBetaTag(tag) ? "beta" : isStableTag(tag) ? "stable" : "dev",
        source: "git-tag",
      };
    }
    const branch = params.git?.branch;
    if (branch && branch !== "HEAD") {
      return { channel: "dev", source: "git-branch" };
    }
    return { channel: DEFAULT_GIT_CHANNEL, source: "default" };
  }

  if (params.installKind === "package") {
    return { channel: DEFAULT_PACKAGE_CHANNEL, source: "default" };
  }

  return { channel: DEFAULT_PACKAGE_CHANNEL, source: "default" };
}

/** 格式化包含决定来源的运维端渠道标签。 */
export function formatUpdateChannelLabel(params: {
  channel: UpdateChannel;
  source: UpdateChannelSource;
  gitTag?: string | null;
  gitBranch?: string | null;
}): string {
  if (params.source === "config") {
    return `${params.channel} (config)`;
  }
  if (params.source === "git-tag") {
    return params.gitTag ? `${params.channel} (${params.gitTag})` : `${params.channel} (tag)`;
  }
  if (params.source === "git-branch") {
    return params.gitBranch
      ? `${params.channel} (${params.gitBranch})`
      : `${params.channel} (branch)`;
  }
  if (params.source === "installed-version") {
    return "beta (installed version)";
  }
  return `${params.channel} (default)`;
}

/** 解析渠道元数据与显示标签，用于状态与更新 UI。 */
export function resolveUpdateChannelDisplay(params: {
  configChannel?: UpdateChannel | null;
  currentVersion?: string | null;
  installKind: "git" | "package" | "unknown";
  gitTag?: string | null;
  gitBranch?: string | null;
}): { channel: UpdateChannel; source: UpdateChannelSource; label: string } {
  const channelInfo = resolveEffectiveUpdateChannel({
    configChannel: params.configChannel,
    currentVersion: params.currentVersion,
    installKind: params.installKind,
    git:
      params.gitTag || params.gitBranch
        ? { tag: params.gitTag ?? null, branch: params.gitBranch ?? null }
        : undefined,
  });
  return {
    channel: channelInfo.channel,
    source: channelInfo.source,
    label: formatUpdateChannelLabel({
      channel: channelInfo.channel,
      source: channelInfo.source,
      gitTag: params.gitTag ?? null,
      gitBranch: params.gitBranch ?? null,
    }),
  };
}
