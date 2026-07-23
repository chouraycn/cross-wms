// Gateway session 事件字段构建器。
// 移植自 openclaw/src/gateway/session-event-payload.ts
//
// 适配说明：
//  - ./session-utils.js → ./session-utils.types.js（cross-wms 中 GatewaySessionRow 定义于此）
//  - cross-wms 的 GatewaySessionRow 包含 openclaw 所需全部字段，可完整移植

import type { GatewaySessionRow } from "./session-utils.types.js";

/**
 * 构建 gateway session 事件字段，用于广播 session 变更事件。
 *
 * 将 sessionRow 中的关键字段提取为扁平的 Record，供事件 payload 使用。
 * 当 sessionRow.key 为 "global" 且未指定 agentId 时，省略 goal 字段以避免
 * 向无 scope 的全局会话广播 goal 信息。
 */
export function buildGatewaySessionEventFields(params: {
  sessionRow: GatewaySessionRow;
  agentId?: string;
  label?: string;
  displayName?: string;
  parentSessionKey?: string;
  hasActiveRun?: boolean;
}): Record<string, unknown> {
  const { sessionRow } = params;
  const omitUnscopedGlobalGoal = sessionRow.key === "global" && !params.agentId;
  return {
    updatedAt: sessionRow.updatedAt ?? undefined,
    sessionId: sessionRow.sessionId,
    kind: sessionRow.kind,
    channel: sessionRow.channel,
    subject: sessionRow.subject,
    groupChannel: sessionRow.groupChannel,
    space: sessionRow.space,
    chatType: sessionRow.chatType,
    origin: sessionRow.origin,
    spawnedBy: sessionRow.spawnedBy,
    spawnedWorkspaceDir: sessionRow.spawnedWorkspaceDir,
    spawnedCwd: sessionRow.spawnedCwd,
    forkedFromParent: sessionRow.forkedFromParent,
    spawnDepth: sessionRow.spawnDepth,
    subagentRole: sessionRow.subagentRole,
    subagentControlScope: sessionRow.subagentControlScope,
    label: params.label ?? sessionRow.label,
    displayName: params.displayName ?? sessionRow.displayName,
    deliveryContext: sessionRow.deliveryContext,
    parentSessionKey: params.parentSessionKey ?? sessionRow.parentSessionKey,
    childSessions: sessionRow.childSessions,
    thinkingLevel: sessionRow.thinkingLevel,
    fastMode: sessionRow.fastMode,
    verboseLevel: sessionRow.verboseLevel,
    reasoningLevel: sessionRow.reasoningLevel,
    elevatedLevel: sessionRow.elevatedLevel,
    sendPolicy: sessionRow.sendPolicy,
    systemSent: sessionRow.systemSent,
    abortedLastRun: sessionRow.abortedLastRun,
    inputTokens: sessionRow.inputTokens,
    outputTokens: sessionRow.outputTokens,
    lastChannel: sessionRow.lastChannel,
    lastTo: sessionRow.lastTo,
    lastAccountId: sessionRow.lastAccountId,
    lastThreadId: sessionRow.lastThreadId,
    totalTokens: sessionRow.totalTokens,
    totalTokensFresh: sessionRow.totalTokensFresh,
    ...(omitUnscopedGlobalGoal ? {} : { goal: sessionRow.goal ?? null }),
    contextTokens: sessionRow.contextTokens,
    estimatedCostUsd: sessionRow.estimatedCostUsd,
    responseUsage: sessionRow.responseUsage,
    modelProvider: sessionRow.modelProvider,
    model: sessionRow.model,
    status: sessionRow.status,
    ...(params.hasActiveRun === undefined ? {} : { hasActiveRun: params.hasActiveRun }),
    startedAt: sessionRow.startedAt,
    endedAt: sessionRow.endedAt,
    runtimeMs: sessionRow.runtimeMs,
    compactionCheckpointCount: sessionRow.compactionCheckpointCount,
    latestCompactionCheckpoint: sessionRow.latestCompactionCheckpoint,
  };
}
