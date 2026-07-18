/**
 * Owner display settings for prompt rendering.
 *
 * Hash mode uses a dedicated prompt-display secret so auth material is never reused for owner redaction.
 *
 * 移植自 openclaw/src/agents/owner-display.ts
 * 降级策略：
 *  - 内联 normalizeOptionalString（来自 @openclaw/normalization-core/string-coerce）
 *  - OpenClawConfig 降级为本地最小类型（仅包含 commands.ownerDisplay/ownerDisplaySecret 字段）
 */

import crypto from "node:crypto";

// 降级实现：normalizeOptionalString 来自 @openclaw/normalization-core/string-coerce
function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

// 降级类型：OpenClawConfig 的最小子集，仅保留 owner-display 相关字段
type OpenClawConfigLike = {
  commands?: {
    ownerDisplay?: "raw" | "hash";
    ownerDisplaySecret?: string;
  };
};

type OwnerDisplaySetting = {
  ownerDisplay?: "raw" | "hash";
  ownerDisplaySecret?: string;
};

type OwnerDisplaySecretResolution = {
  config: OpenClawConfigLike;
  generatedSecret?: string;
};

/**
 * Resolve owner display settings for prompt rendering.
 * Keep auth secrets decoupled from owner hash secrets.
 */
export function resolveOwnerDisplaySetting(config?: OpenClawConfigLike): OwnerDisplaySetting {
  const ownerDisplay = config?.commands?.ownerDisplay;
  if (ownerDisplay !== "hash") {
    return { ownerDisplay, ownerDisplaySecret: undefined };
  }
  return {
    ownerDisplay: "hash",
    ownerDisplaySecret: normalizeOptionalString(config?.commands?.ownerDisplaySecret),
  };
}

/**
 * Ensure hash mode has a dedicated secret.
 * Returns updated config and generated secret when autofill was needed.
 */
export function ensureOwnerDisplaySecret(
  config: OpenClawConfigLike,
  generateSecret: () => string = () => crypto.randomBytes(32).toString("hex"),
): OwnerDisplaySecretResolution {
  const settings = resolveOwnerDisplaySetting(config);
  if (settings.ownerDisplay !== "hash" || settings.ownerDisplaySecret) {
    return { config };
  }
  const generatedSecret = generateSecret();
  return {
    config: {
      ...config,
      commands: {
        ...config.commands,
        ownerDisplay: "hash",
        ownerDisplaySecret: generatedSecret,
      },
    },
    generatedSecret,
  };
}
