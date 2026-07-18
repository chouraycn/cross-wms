// Gateway assistant identity resolver.
// Combines UI, agent config, and workspace identity files for Control UI display.
//
// 降级说明：
//  - `../agents/agent-scope.js` 的 resolveAgentWorkspaceDir/resolveDefaultAgentId
//    降级为内联实现（默认 agentId 为 "main"，workspaceDir 从 cfg 读取）。
//  - `../agents/identity.js` 的 resolveAgentIdentity 降级为返回 undefined。
//  - `../commands/agents.config.js` 的 loadAgentIdentity 降级为返回 null。
//  - `../config/types.openclaw.js` 的 OpenClawConfig 改从 `./_openclaw-stubs.js` 导入。
//  - `../routing/session-key.js` 的 normalizeAgentId 降级为内联实现（去空白、小写）。
//  - `../shared/assistant-identity-values.js` 的 coerceIdentityValue 降级为内联实现。
//  - `../shared/avatar-policy.js` 的 avatar 判定函数降级为内联实现。
import type { OpenClawConfig } from "./_openclaw-stubs.js";

// ============================================================================
// 降级类型与工具
// ============================================================================

const MAX_ASSISTANT_NAME = 50;
// Image-bearing avatars (data: URLs, paths) need to round-trip through
// coerceIdentityValue without truncation. Sized to match
// MAX_LOCAL_USER_IMAGE_AVATAR / AVATAR_MAX_BYTES expansion.
const MAX_ASSISTANT_AVATAR = 2_000_000;
const MAX_ASSISTANT_EMOJI = 16;

type AssistantIdentity = {
  agentId: string;
  name: string;
  avatar: string;
  emoji?: string;
};

export const DEFAULT_ASSISTANT_IDENTITY: AssistantIdentity = {
  agentId: "main",
  name: "Assistant",
  avatar: "A",
};

/**
 * 规范化 agent id（降级实现）。
 *
 * 降级原因：openclaw `routing/session-key` 的 normalizeAgentId 还会处理
 * slug 化与别名。这里仅做基础小写化与空白清理。
 */
function normalizeAgentId(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed || "main";
}

/**
 * 解析默认 agent id（降级实现，始终返回 "main"）。
 *
 * 降级原因：openclaw `agents/agent-scope` 的 resolveDefaultAgentId 会从
 * config.agents.default 读取。这里降级为固定值。
 */
function resolveDefaultAgentId(_cfg: OpenClawConfig): string {
  return "main";
}

/**
 * 解析 agent workspace 目录（降级实现，返回 undefined）。
 *
 * 降级原因：openclaw `agents/agent-scope` 的 resolveAgentWorkspaceDir 依赖
 * config/paths 与 state dir。这里降级为 undefined，使文件身份读取跳过。
 */
function resolveAgentWorkspaceDir(
  _cfg: OpenClawConfig,
  _agentId: string,
): string | undefined {
  return undefined;
}

/**
 * Agent 身份宽松占位类型（降级）。
 */
type AgentIdentityFile = {
  name?: string;
  avatar?: string;
  emoji?: string;
};

/**
 * 从 config 解析 agent 身份（降级实现，返回 undefined）。
 *
 * 降级原因：openclaw `agents/identity` 依赖完整的 agent 配置层级。
 */
function resolveAgentIdentity(
  _cfg: OpenClawConfig,
  _agentId: string,
): AgentIdentityFile | undefined {
  return undefined;
}

/**
 * 从 workspace 目录加载 agent 身份文件（降级实现，返回 null）。
 *
 * 降级原因：openclaw `commands/agents.config` 的 loadAgentIdentity 依赖
 * 文件系统与身份文件格式。这里降级为 null。
 */
function loadAgentIdentity(_workspaceDir: string): AgentIdentityFile | null {
  return null;
}

/**
 * 强制身份值为字符串并截断到最大长度（降级实现）。
 *
 * 降级原因：openclaw `shared/assistant-identity-values` 的 coerceIdentityValue
 * 还会处理 NFC 规范化与控制字符过滤。这里仅做基础截断。
 */
function coerceIdentityValue(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/** 判断字符串是否为 HTTP(S) URL（降级实现）。 */
function isAvatarHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** 判断字符串是否为 image data URL（降级实现）。 */
function isAvatarImageDataUrl(value: string): boolean {
  return /^data:image\//i.test(value);
}

/** 判断字符串是否看起来像 avatar 文件路径（降级实现）。 */
function looksLikeAvatarPath(value: string): boolean {
  // 简单判定：包含路径分隔符或以常见图片扩展名结尾
  return (
    (value.includes("/") || value.includes("\\")) &&
    /\.(?:png|jpe?g|gif|webp|svg|bmp)$/i.test(value)
  );
}

// ============================================================================
// 主实现
// ============================================================================

function isAvatarUrl(value: string): boolean {
  return isAvatarHttpUrl(value) || isAvatarImageDataUrl(value);
}

function normalizeAvatarValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (isAvatarUrl(trimmed)) {
    return trimmed;
  }
  if (looksLikeAvatarPath(trimmed)) {
    return trimmed;
  }
  if (!/\s/.test(trimmed) && trimmed.length <= 4) {
    return trimmed;
  }
  return undefined;
}

function normalizeEmojiValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > MAX_ASSISTANT_EMOJI) {
    return undefined;
  }
  let hasNonAscii = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed.charCodeAt(i) > 127) {
      hasNonAscii = true;
      break;
    }
  }
  if (!hasNonAscii) {
    return undefined;
  }
  if (isAvatarUrl(trimmed) || looksLikeAvatarPath(trimmed)) {
    return undefined;
  }
  return trimmed;
}

/** Resolve the display name/avatar/emoji for an agent-facing assistant identity. */
export function resolveAssistantIdentity(params: {
  cfg: OpenClawConfig;
  agentId?: string | null;
  workspaceDir?: string | null;
}): AssistantIdentity {
  const defaultAgentId = normalizeAgentId(resolveDefaultAgentId(params.cfg));
  const agentId = normalizeAgentId(params.agentId ?? defaultAgentId);
  const isDefaultAgent = agentId === defaultAgentId;
  const workspaceDir = params.workspaceDir ?? resolveAgentWorkspaceDir(params.cfg, agentId);
  const configAssistant = (params.cfg.ui as { assistant?: { name?: string; avatar?: string } } | undefined)?.assistant;
  const agentIdentity = resolveAgentIdentity(params.cfg, agentId);
  const fileIdentity = workspaceDir ? loadAgentIdentity(workspaceDir) : null;

  const uiName = coerceIdentityValue(configAssistant?.name, MAX_ASSISTANT_NAME);
  const agentName = coerceIdentityValue(agentIdentity?.name, MAX_ASSISTANT_NAME);
  const fileName = coerceIdentityValue(fileIdentity?.name, MAX_ASSISTANT_NAME);
  const name =
    (isDefaultAgent ? (uiName ?? agentName ?? fileName) : (agentName ?? fileName ?? uiName)) ??
    DEFAULT_ASSISTANT_IDENTITY.name;

  const uiAvatar = coerceIdentityValue(configAssistant?.avatar, MAX_ASSISTANT_AVATAR);
  const agentAvatarCandidates = [
    coerceIdentityValue(agentIdentity?.avatar, MAX_ASSISTANT_AVATAR),
    coerceIdentityValue(agentIdentity?.emoji, MAX_ASSISTANT_AVATAR),
    coerceIdentityValue(fileIdentity?.avatar, MAX_ASSISTANT_AVATAR),
    coerceIdentityValue(fileIdentity?.emoji, MAX_ASSISTANT_AVATAR),
  ];
  const avatarCandidates = isDefaultAgent
    ? [uiAvatar, ...agentAvatarCandidates]
    : [...agentAvatarCandidates, uiAvatar];
  const avatar =
    avatarCandidates.map((candidate) => normalizeAvatarValue(candidate)).find(Boolean) ??
    DEFAULT_ASSISTANT_IDENTITY.avatar;

  const emojiCandidates = [
    coerceIdentityValue(agentIdentity?.emoji, MAX_ASSISTANT_EMOJI),
    coerceIdentityValue(fileIdentity?.emoji, MAX_ASSISTANT_EMOJI),
    coerceIdentityValue(agentIdentity?.avatar, MAX_ASSISTANT_EMOJI),
    coerceIdentityValue(fileIdentity?.avatar, MAX_ASSISTANT_EMOJI),
  ];
  const emoji = emojiCandidates.map((candidate) => normalizeEmojiValue(candidate)).find(Boolean);

  return { agentId, name, avatar, emoji };
}

export type { AssistantIdentity };
