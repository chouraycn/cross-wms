/**
 * Normalizes inherited tool allow/deny lists and ACP compatibility errors.
 *
 * 降级说明：
 *  - `@openclaw/normalization-core/string-normalization` 的 `uniqueStrings`
 *    改从 `../infra/string-normalization.js` 导入。
 *  - openclaw `./tool-policy-shared.js` 的 `normalizeToolName` 与
 *    `./tool-policy-match.js` 的 `isToolAllowedByPolicyName` 在 cross-wms
 *    中签名不同，这里内联实现等价逻辑（别名映射 + glob 匹配）。
 */
import { uniqueStrings } from "../infra/string-normalization.js";
import { compileGlobPatterns, matchesAnyGlobPattern } from "./glob-pattern.js";

const TOOL_NAME_ALIASES: Record<string, string> = {
  bash: "exec",
  "apply-patch": "apply_patch",
};

/** Normalizes a tool name or alias to the policy id used for matching. */
function normalizeToolName(name: string): string {
  const normalized = name.toLowerCase().trim();
  return TOOL_NAME_ALIASES[normalized] ?? normalized;
}

type InheritedToolPolicy = {
  allow?: string[];
  deny?: string[];
};

/**
 * Return whether one tool name is allowed by a single inherited policy.
 *
 * 内联实现：deny 优先，空 allow 表示允许所有未拒绝的工具。
 * 与 openclaw `tool-policy-match.ts` 的 `isToolAllowedByPolicyName` 保持一致。
 */
function isToolAllowedByPolicyName(name: string, policy?: InheritedToolPolicy): boolean {
  if (!policy) {
    return true;
  }
  const deny = compileGlobPatterns({
    raw: policy.deny,
    normalize: normalizeToolName,
  });
  const allow = compileGlobPatterns({
    raw: policy.allow,
    normalize: normalizeToolName,
  });
  const normalized = normalizeToolName(name);
  if (matchesAnyGlobPattern(normalized, deny)) {
    return false;
  }
  if (allow.length === 0) {
    return true;
  }
  if (matchesAnyGlobPattern(normalized, allow)) {
    return true;
  }
  // `apply_patch` is the concrete write tool, so a broad write allowlist entry
  // should cover it even though its tool name is more specific.
  if (normalized === "apply_patch" && matchesAnyGlobPattern("write", allow)) {
    return true;
  }
  return false;
}

const ACP_UNSUPPORTED_INHERITED_TOOL_DENY = [
  "apply_patch",
  "edit",
  "exec",
  "fs_delete",
  "fs_move",
  "fs_write",
  "process",
  "read",
  "shell",
  "spawn",
  "write",
] as const;

// Inherited allowlists are rebuilt from the effective OpenClaw tool surface.
// ACP-only aliases can appear in explicit deny policies, but not in that
// effective allowlist unless a plugin happens to expose matching tool names.
const ACP_REQUIRED_INHERITED_TOOL_ALLOW = [
  "apply_patch",
  "edit",
  "exec",
  "process",
  "read",
  "write",
] as const;

export function normalizeInheritedToolDenylist(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(
    value.flatMap((entry) => {
      const normalized = typeof entry === "string" ? normalizeToolName(entry) : "";
      return normalized ? [normalized] : [];
    }),
  );
}

export function inheritedToolDenyPatch(value: unknown): { inheritedToolDeny?: string[] } {
  const inheritedToolDeny = normalizeInheritedToolDenylist(value);
  return inheritedToolDeny.length > 0 ? { inheritedToolDeny } : {};
}

export function normalizeInheritedToolAllowlist(value: unknown): string[] {
  return normalizeInheritedToolDenylist(value);
}

export function inheritedToolAllowPatch(value: unknown): { inheritedToolAllow?: string[] } {
  const inheritedToolAllow = normalizeInheritedToolAllowlist(value);
  return inheritedToolAllow.length > 0 ? { inheritedToolAllow } : {};
}

export function findAcpUnsupportedInheritedToolDeny(value: unknown): string | undefined {
  const inheritedToolDeny = normalizeInheritedToolDenylist(value);
  if (inheritedToolDeny.length === 0) {
    return undefined;
  }
  return ACP_UNSUPPORTED_INHERITED_TOOL_DENY.find(
    (toolName) => !isToolAllowedByPolicyName(toolName, { deny: inheritedToolDeny }),
  );
}

export function findAcpUnsupportedInheritedToolAllow(value: unknown): string | undefined {
  const inheritedToolAllow = normalizeInheritedToolAllowlist(value);
  if (inheritedToolAllow.length === 0) {
    return undefined;
  }
  return ACP_REQUIRED_INHERITED_TOOL_ALLOW.find(
    (toolName) => !isToolAllowedByPolicyName(toolName, { allow: inheritedToolAllow }),
  );
}

export function formatAcpInheritedToolDenyError(toolName: string): string {
  return `runtime="acp" is unavailable because the requester denies ${toolName}. Use runtime="subagent".`;
}

export function formatAcpInheritedToolAllowError(toolName: string): string {
  return `runtime="acp" is unavailable because the requester does not allow ${toolName}. Use runtime="subagent".`;
}
