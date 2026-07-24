// === PENDING MIGRATION STUB ===
// Source: openclaw/src/config/sessions/delivery-info.ts (待迁移)
// Status: 类型安全 no-op 实现 — 返回空投递上下文 (调用方将判定无有效投递路由)
// Used by: server/engine/plugins/host-hook-attachments.ts
// 注：openclaw 同源实现从 session config 提取投递目标信息

export const extractDeliveryInfo = (
  _sessionKey: string,
  _opts?: unknown,
): {
  deliveryContext: { channel: string; to: string; threadId?: string; accountId?: string };
  threadId: undefined;
} => ({
  deliveryContext: { channel: "", to: "" },
  threadId: undefined,
});
