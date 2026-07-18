// 移植自 openclaw/src/infra/exec-safe-bin-policy-validator.ts（降级实现）
// 验证 safe-bin policy profile 与命令 argv 语义。
// 注意：cross-wms 已有 ./exec-approvals/exec-safe-bin-policy-profiles.ts 和 ./exec-approvals/exec-safe-bin-semantics.ts
// 此文件提供根级别入口，re-export 自 exec-approvals/ 子目录并补充验证逻辑。
export type {
  SafeBinProfile,
  SafeBinProfileFixture,
  SafeBinProfileFixtures,
} from "./exec-approvals/exec-safe-bin-policy-profiles.js";
export {
  collectKnownLongFlags,
  buildLongFlagPrefixMap,
  normalizeSafeBinProfileFixtures,
  resolveSafeBinProfiles,
} from "./exec-approvals/exec-safe-bin-policy-profiles.js";
export {
  normalizeSafeBinName,
  validateSafeBinSemantics,
} from "./exec-approvals/exec-safe-bin-semantics.js";
export { parseExecArgvToken } from "./exec-command-resolution.js";

import { parseExecArgvToken } from "./exec-command-resolution.js";
import {
  buildLongFlagPrefixMap,
  collectKnownLongFlags,
  type SafeBinProfile,
} from "./exec-approvals/exec-safe-bin-policy-profiles.js";
import { validateSafeBinSemantics } from "./exec-approvals/exec-safe-bin-semantics.js";

function isPathLikeToken(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") return false;
  if (trimmed.startsWith("./") || trimmed.startsWith("../") || trimmed.startsWith("~")) return true;
  if (trimmed.startsWith("/")) return true;
  return /^[A-Za-z]:[\\/]/.test(trimmed);
}

function hasGlobToken(value: string): boolean {
  return /[*?[\]]/.test(value);
}

function hasShellExpansionToken(value: string): boolean {
  return /\$(?:[A-Za-z0-9_@*?!$#-]|\{|\(|\[)/.test(value);
}

function isSafeLiteralToken(value: string): boolean {
  if (!value || value === "-") return true;
  return !hasGlobToken(value) && !hasShellExpansionToken(value) && !isPathLikeToken(value);
}

function isInvalidValueToken(value: string | undefined): boolean {
  return !value || !isSafeLiteralToken(value);
}

export type SafeBinValidationResult = {
  ok: boolean;
  reason?: string;
  invalidTokens?: string[];
};

/**
 * 验证 safe-bin profile 与 argv 语义。
 * 降级实现：检查路径/glob/shell 展开标记，不调用完整的 validateSafeBinSemantics。
 */
export function validateSafeBinPolicyArgv(params: {
  profile: SafeBinProfile;
  argv: readonly string[];
}): SafeBinValidationResult {
  const { profile, argv } = params;
  if (!Array.isArray(argv) || argv.length === 0) {
    return { ok: true };
  }
  const knownLongFlags = collectKnownLongFlags(profile.allowedValueFlags ?? new Set(), profile.deniedFlags ?? new Set());
  const longFlagPrefixMap = buildLongFlagPrefixMap(knownLongFlags);
  const invalidTokens: string[] = [];
  for (const token of argv) {
    const parsed = parseExecArgvToken(token);
    if (parsed.kind === "positional" && isInvalidValueToken(parsed.raw)) {
      invalidTokens.push(token);
    }
    if (parsed.kind === "option" && parsed.style === "long" && parsed.inlineValue) {
      const canonical = longFlagPrefixMap.get(parsed.flag);
      if (!canonical) {
        // 未知 long flag 不一定无效，但记录供调试
      }
    }
  }
  if (invalidTokens.length > 0) {
    return {
      ok: false,
      reason: `invalid tokens: ${invalidTokens.join(", ")}`,
      invalidTokens,
    };
  }
  return { ok: true };
}

export { isPathLikeToken, hasGlobToken, hasShellExpansionToken, isSafeLiteralToken, isInvalidValueToken };
