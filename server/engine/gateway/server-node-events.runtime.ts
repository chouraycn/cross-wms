/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Runtime barrel stub — 移植自 openclaw/src/gateway/server-node-events.runtime.ts
 *
 * 降级说明：原始 barrel 从其他模块 re-export，部分模块在 cross-wms 未移植
 * 或导出名称不一致。此 stub 仅 re-export 已知存在的导出，其余降级为本地占位。
 */

// 原 re-export from ../agents/agent-scope.js
export const resolveSessionAgentId: unknown = undefined;
// 原 re-export from ../auto-reply/reply/inbound-text.js
export const sanitizeInboundSystemTags: unknown = undefined;
// 原 re-export from ../channels/plugins/index.js
export const normalizeChannelId: unknown = undefined;
// 原 re-export from ../channels/message/runtime.js
export const sendDurableMessageBatch: unknown = undefined;
// 原 re-export from ../cli/outbound-send-deps.js
export const createOutboundSendDeps: unknown = undefined;
// 原 re-export from ../commands/agent.js
export const agentCommandFromIngress: unknown = undefined;
// 原 re-export from ../config/io.js
export const getRuntimeConfig: unknown = undefined;
// 原 re-export from ../config/sessions.js
export const canonicalizeSessionEntryAliases: unknown = undefined;
// 原 re-export from ../infra/device-identity.js
export const loadOrCreateDeviceIdentity: unknown = undefined;
// 原 re-export from ../infra/heartbeat-wake.js
export const requestHeartbeat: unknown = undefined;
// 原 re-export from ../infra/outbound/session-context.js
export const buildOutboundSessionContext: unknown = undefined;
// 原 re-export from ../infra/outbound/targets.js
export const resolveOutboundTarget: unknown = undefined;
// 原 re-export from ../infra/push-apns.js
export const registerApnsRegistration: unknown = undefined;
// 原 re-export from ../infra/system-events.js
export const enqueueSystemEvent: unknown = undefined;
// 原 re-export from ../media/store.js
export const deleteMediaBuffer: unknown = undefined;
// 原 re-export from ../routing/session-key.js
export const normalizeMainKey: unknown = undefined;
// 原 re-export from ../routing/session-key.js
export const scopedHeartbeatWakeOptions: unknown = undefined;
// 原 re-export from ../runtime.js
export const defaultRuntime: unknown = undefined;
// 原 re-export from ./chat-attachments.js
export const parseMessageWithAttachments: unknown = undefined;
// 原 re-export from ./chat-attachments.js
export const resolveChatAttachmentMaxBytes: unknown = undefined;
// 原 re-export from ./server-methods/attachment-normalize.js
export const normalizeRpcAttachmentsToChatAttachments: unknown = undefined;
// 原 re-export from ./session-utils.js
export const loadSessionEntry: unknown = undefined;
// 原 re-export from ./session-utils.js
export const resolveGatewayModelSupportsImages: unknown = undefined;
// 原 re-export from ./session-utils.js
export const resolveSessionModelRef: unknown = undefined;
// 原 re-export from ./ws-log.js
export const formatForLog: unknown = undefined;