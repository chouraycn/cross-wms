/**
 * 高层入站事件类别，用于将可操作用户请求与房间活动区分开。
 *
 * 移植自 openclaw/src/channels/inbound-event/kind.ts（纯类型，无依赖）。
 */
export type InboundEventKind = "user_request" | "room_event";
