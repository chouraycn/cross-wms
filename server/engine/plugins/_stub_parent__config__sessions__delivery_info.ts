/**
 * @deprecated This file uses legacy stub naming.
 * Future refactoring should rename to *.stub.ts convention.
 * See P3-23 in optimization plan.
 */

// === MIGRATED FROM OPENCLAW SOURCE (partial) ===
// Source: openclaw/src/config/sessions/delivery-info.ts
// Status: 部分移植 — threadId 解析已移植，deliveryContext 返回 undefined（无投递路由）
// Used by: server/engine/plugins/host-hook-attachments.ts
//
// openclaw 同源 extractDeliveryInfo 从持久化 session store 提取投递目标信息，依赖
// readSessionStoreSnapshot、resolveSessionStoreKey、deliveryContextFromSession 等
// session store 子系统。cross-wms 暂未移植该子系统，因此：
//   1. threadId 解析（:thread: 后缀）已本地移植，行为与 openclaw 一致
//   2. deliveryContext 返回 undefined，调用方将判定无有效投递路由并返回相应错误
// 当 cross-wms 移植完整 session store 子系统后，此文件应替换为真实实现的重导出。

import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "@cdf-know/normalization-core/string-coerce";
import type { OpenClawConfig } from "../config/types.openclaw.js";

/**
 * Parse `:thread:` suffix from a session key.
 * Reference: openclaw/src/sessions/session-key-utils.ts (parseThreadSessionSuffix)
 */
function parseSessionThreadInfo(sessionKey: string | undefined): {
  baseSessionKey: string | undefined;
  threadId: string | undefined;
} {
  const raw = normalizeOptionalString(sessionKey);
  if (!raw) {
    return { baseSessionKey: undefined, threadId: undefined };
  }
  const lowerRaw = normalizeLowercaseStringOrEmpty(raw);
  const threadMarker = ":thread:";
  const markerIndex = lowerRaw.lastIndexOf(threadMarker);
  const baseSessionKey = markerIndex === -1 ? raw : raw.slice(0, markerIndex);
  const threadIdRaw = markerIndex === -1 ? undefined : raw.slice(markerIndex + threadMarker.length);
  return { baseSessionKey, threadId: normalizeOptionalString(threadIdRaw) };
}

/**
 * Extracts the routable delivery context and thread id for a persisted session key.
 *
 * Thread/topic keys are parsed locally; delivery context returns undefined because
 * the session store subsystem is not migrated. Callers treat undefined as
 * "no active delivery route".
 */
export function extractDeliveryInfo(
  sessionKey: string | undefined,
  _options?: { cfg?: OpenClawConfig },
): {
  deliveryContext:
    | { channel?: string; to?: string; accountId?: string; threadId?: string | number }
    | undefined;
  threadId: string | undefined;
} {
  const { baseSessionKey, threadId } = parseSessionThreadInfo(sessionKey);
  if (!sessionKey || !baseSessionKey) {
    return { deliveryContext: undefined, threadId };
  }
  // Session store subsystem not migrated: no routable delivery context available.
  return { deliveryContext: undefined, threadId };
}
