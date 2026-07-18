/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Runtime barrel stub — 移植自 openclaw/src/gateway/server-node-events.runtime.ts
 *
 * 降级说明：原始 barrel 从其他模块 re-export，部分模块在 cross-wms 未移植
 * 或导出名称不一致。此 stub 仅 re-export 已知存在的导出，其余降级为本地占位。
 */

// 原 re-export from ../agents/agent-scope.js
export const resolveSessionAgentId: any = undefined;
// 原 re-export from ../auto-reply/reply/inbound-text.js
export const sanitizeInboundSystemTags: any = undefined;
// 原 re-export from ../channels/plugins/index.js
export const normalizeChannelId: any = undefined;
// 原 re-export from ../channels/message/runtime.js
export const sendDurableMessageBatch: any = undefined;
// 原 re-export from ../cli/outbound-send-deps.js
export const createOutboundSendDeps: any = undefined;
// 原 re-export from ../commands/agent.js
export const agentCommandFromIngress: any = undefined;
// 原 re-export from ../config/io.js
export const getRuntimeConfig: any = undefined;
// 原 re-export from ../config/sessions.js
export const canonicalizeSessionEntryAliases: any = undefined;
// 原 re-export from ../infra/device-identity.js
export const loadOrCreateDeviceIdentity: any = undefined;
// 原 re-export from ../infra/heartbeat-wake.js
export const requestHeartbeat: any = undefined;
// 原 re-export from ../infra/outbound/session-context.js
export const buildOutboundSessionContext: any = undefined;
// 原 re-export from ../infra/outbound/targets.js
export const resolveOutboundTarget: any = undefined;
// 原 re-export from ../infra/push-apns.js
export const registerApnsRegistration: any = undefined;
// 原 re-export from ../infra/system-events.js
export const enqueueSystemEvent: any = undefined;
// 原 re-export from ../media/store.js
export const deleteMediaBuffer: any = undefined;
// 原 re-export from ../routing/session-key.js
export const normalizeMainKey: any = undefined;
// 原 re-export from ../routing/session-key.js
export const scopedHeartbeatWakeOptions: any = undefined;
// 原 re-export from ../runtime.js
export const defaultRuntime: any = undefined;
// 原 re-export from ./chat-attachments.js
export const parseMessageWithAttachments: any = undefined;
// 原 re-export from ./chat-attachments.js
export const resolveChatAttachmentMaxBytes: any = undefined;
// 原 re-export from ./server-methods/attachment-normalize.js
export const normalizeRpcAttachmentsToChatAttachments: any = undefined;
// 原 re-export from ./session-utils.js
export const loadSessionEntry: any = undefined;
// 原 re-export from ./session-utils.js
export const resolveGatewayModelSupportsImages: any = undefined;
// 原 re-export from ./session-utils.js
export const resolveSessionModelRef: any = undefined;
// 原 re-export from ./ws-log.js
export const formatForLog: any = undefined;