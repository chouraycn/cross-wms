// 保留 session-entry 键，使插件扩展槽不能与核心 session 状态冲突。
//
// 移植自 openclaw/src/plugins/session-entry-slot-keys.ts。
//
// 降级策略：
//  - 原文件依赖 ../config/sessions/types.js 的 SessionEntry 类型，用于编译期
//    断言所有 SessionEntry 键已被保留。cross-wms 尚未移植该模块。
//    这里使用 Record<string, unknown> 作为最小占位类型，并删除依赖 keyof 的
//    编译期断言（保留运行时检查）。

/** SessionEntry 降级占位类型。 */
type SessionEntry = Record<string, unknown>;

const SESSION_ENTRY_RESERVED_SLOT_KEY_LIST = [
  "__proto__",
  "constructor",
  "prototype",
  "lastHeartbeatText",
  "lastHeartbeatSentAt",
  "heartbeatIsolatedBaseSessionKey",
  "heartbeatTaskState",
  "pluginExtensions",
  "pluginExtensionSlotKeys",
  "pluginNextTurnInjections",
  "sessionId",
  "updatedAt",
  "sessionFile",
  "spawnedBy",
  "spawnedWorkspaceDir",
  "spawnedCwd",
  "parentSessionKey",
  "forkedFromParent",
  "spawnDepth",
  "subagentRole",
  "subagentControlScope",
  "inheritedToolDeny",
  "inheritedToolAllow",
  "subagentRecovery",
  "pluginOwnerId",
  "systemSent",
  "abortedLastRun",
  "restartRecoveryRuns",
  "goal",
  "sessionStartedAt",
  "lastInteractionAt",
  "startedAt",
  "endedAt",
  "runtimeMs",
  "status",
  "abortCutoffMessageSid",
  "abortCutoffTimestamp",
  "chatType",
  "thinkingLevel",
  "fastMode",
  "verboseLevel",
  "traceLevel",
  "reasoningLevel",
  "elevatedLevel",
  "ttsAuto",
  "lastTtsReadLatestHash",
  "lastTtsReadLatestAt",
  "execHost",
  "execSecurity",
  "execAsk",
  "execNode",
  "responseUsage",
  "usageFamilyKey",
  "usageFamilySessionIds",
  "providerOverride",
  "modelOverride",
  "agentRuntimeOverride",
  "modelOverrideSource",
  "modelOverrideFallbackOriginProvider",
  "modelOverrideFallbackOriginModel",
  "authProfileOverride",
  "authProfileOverrideSource",
  "authProfileOverrideCompactionCount",
  "liveModelSwitchPending",
  "groupActivation",
  "groupActivationNeedsSystemIntro",
  "sendPolicy",
  "queueMode",
  "queueDebounceMs",
  "queueCap",
  "queueDrop",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "pendingFinalDelivery",
  "pendingFinalDeliveryCreatedAt",
  "pendingFinalDeliveryLastAttemptAt",
  "pendingFinalDeliveryAttemptCount",
  "pendingFinalDeliveryLastError",
  "pendingFinalDeliveryText",
  "pendingFinalDeliveryContext",
  "pendingFinalDeliveryIntentId",
  "restartRecoveryDeliveryContext",
  "restartRecoveryDeliveryRunId",
  "totalTokensFresh",
  "estimatedCostUsd",
  "cacheRead",
  "cacheWrite",
  "modelProvider",
  "model",
  "agentHarnessId",
  "fallbackNoticeSelectedModel",
  "fallbackNoticeActiveModel",
  "fallbackNoticeReason",
  "contextTokens",
  "contextBudgetStatus",
  "compactionCount",
  "compactionCheckpoints",
  "memoryFlushAt",
  "memoryFlushCompactionCount",
  "memoryFlushContextHash",
  "memoryFlushFailureCount",
  "memoryFlushLastFailedAt",
  "memoryFlushLastFailureError",
  "cliSessionIds",
  "cliSessionBindings",
  "claudeCliSessionId",
  "label",
  "displayName",
  "channel",
  "groupId",
  "subject",
  "groupChannel",
  "space",
  "origin",
  "route",
  "deliveryContext",
  "lastChannel",
  "lastTo",
  "lastAccountId",
  "lastThreadId",
  "skillsSnapshot",
  "systemPromptReport",
  "pluginDebugEntries",
  "acp",
  "quotaSuspension",
] as const satisfies ReadonlyArray<string>;

const SESSION_ENTRY_RESERVED_SLOT_KEYS = new Set<string>(SESSION_ENTRY_RESERVED_SLOT_KEY_LIST);
const OBJECT_PROTOTYPE_RESERVED_SLOT_KEYS = new Set<string>([
  "prototype",
  ...Object.getOwnPropertyNames(Object.prototype),
]);

const SESSION_ENTRY_SLOT_KEY_RE = /^[A-Za-z][A-Za-z0-9_]*$/u;

export function normalizeSessionEntrySlotKey(
  value: unknown,
): { ok: true; key: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "sessionEntrySlotKey must be a string" };
  }
  const key = value.trim();
  if (!key) {
    return { ok: false, error: "sessionEntrySlotKey cannot be empty" };
  }
  if (!SESSION_ENTRY_SLOT_KEY_RE.test(key)) {
    return {
      ok: false,
      error: "sessionEntrySlotKey must be an identifier-style field name",
    };
  }
  if (SESSION_ENTRY_RESERVED_SLOT_KEYS.has(key)) {
    return {
      ok: false,
      error: `sessionEntrySlotKey is reserved by SessionEntry: ${key}`,
    };
  }
  if (OBJECT_PROTOTYPE_RESERVED_SLOT_KEYS.has(key)) {
    return {
      ok: false,
      error: `sessionEntrySlotKey is reserved by Object: ${key}`,
    };
  }
  return { ok: true, key };
}
