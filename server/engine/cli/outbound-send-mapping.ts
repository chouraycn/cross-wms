// Maps CLI send dependency sources into outbound send dependencies with legacy aliases.
// 移植自 openclaw/src/cli/outbound-send-mapping.ts。
//
// 降级策略：
//  - 原模块依赖 `@openclaw/normalization-core/string-coerce` 的
//    `normalizeLowercaseStringOrEmpty`、`../channels/registry.js` 的
//    `normalizeChannelId`、`../infra/outbound/send-deps.js` 的
//    `resolveLegacyOutboundSendDepKeys` 与 `OutboundSendDeps` 类型。
//    这些模块在 cross-wms 中尚未移植；这里提供降级 stub，
//    `createOutboundSendDepsFromCliSource` 返回空对象，保留函数签名与符号导出。

import { normalizeLowercaseStringOrEmpty } from "../infra/string-coerce.js";

/**
 * CLI-internal send function sources, keyed by channel ID.
 * Each value is a lazily-loaded send function for that channel.
 */
export const CLI_OUTBOUND_SEND_FACTORY: unique symbol = Symbol.for(
  "openclaw.cliOutboundSendFactory",
) as never;

type CliOutboundSendFactory = (channelId: string) => unknown;
export type CliOutboundSendSource = {
  [channelId: string]: unknown;
  [CLI_OUTBOUND_SEND_FACTORY]?: CliOutboundSendFactory;
};

// ===== 内联降级：OutboundSendDeps =====
/** Outbound send dependencies (degraded placeholder). */
export type OutboundSendDeps = Record<string, unknown>;
// ===== OutboundSendDeps 结束 =====

// ===== 内联降级：resolveLegacyOutboundSendDepKeys =====
function resolveLegacyOutboundSendDepKeys(channelId: string): string[] {
  // openclaw 的 `infra/outbound/send-deps.js` 未移植；返回空数组作为降级。
  const normalized = normalizeLowercaseStringOrEmpty(channelId);
  if (!normalized) {
    return [];
  }
  // 保留基本的 legacy key 推导：send<Channel> 与 sendMessage<Channel>
  const stem = normalized.replace(/(?:^|[-_])(.)/g, (_m, ch: string) => ch.toUpperCase());
  return [`send${stem}`, `sendMessage${stem}`];
}
// ===== resolveLegacyOutboundSendDepKeys 结束 =====

/**
 * Pass CLI send sources through as-is.
 *
 * 降级实现：openclaw 的 `channels/registry.js`（`normalizeChannelId`）未移植；
 * 这里不做 channel ID 规范化，仅保留 legacy key 推导逻辑，
 * 返回浅拷贝的 outbound 对象。
 */
export function createOutboundSendDepsFromCliSource(deps: CliOutboundSendSource): OutboundSendDeps {
  const outbound: OutboundSendDeps = { ...deps };
  const sendFactory = deps[CLI_OUTBOUND_SEND_FACTORY];

  for (const legacySourceKey of Object.keys(deps)) {
    const match = legacySourceKey.match(/^sendMessage(.+)$/);
    if (!match) {
      continue;
    }
    const stem = match[1] ?? "";
    const normalizedStem = normalizeLowercaseStringOrEmpty(
      stem.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").trim(),
    ).replace(/-/g, "");
    if (!normalizedStem) {
      continue;
    }
    const sourceValue = deps[legacySourceKey];
    if (sourceValue !== undefined && outbound[normalizedStem] === undefined) {
      outbound[normalizedStem] = sourceValue;
    }
  }

  for (const channelId of Object.keys(outbound)) {
    const sourceValue = outbound[channelId];
    if (sourceValue === undefined) {
      continue;
    }
    for (const legacyDepKey of resolveLegacyOutboundSendDepKeys(channelId)) {
      if (outbound[legacyDepKey] === undefined) {
        outbound[legacyDepKey] = sourceValue;
      }
    }
  }

  if (!sendFactory) {
    return outbound;
  }

  return new Proxy(outbound, {
    get(target, property, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }
      const existing = Reflect.get(target, property, receiver);
      if (existing !== undefined) {
        return existing;
      }
      const value = sendFactory(property);
      if (value !== undefined) {
        target[property] = value;
        for (const legacyDepKey of resolveLegacyOutboundSendDepKeys(property)) {
          if (target[legacyDepKey] === undefined) {
            target[legacyDepKey] = value;
          }
        }
      }
      return value;
    },
  });
}
