// 重新导出 gateway-client 就绪原语，使调用方使用统一的事件循环就绪契约。
// 移植自 openclaw/src/gateway/event-loop-ready.ts。
// 依赖调整：../../packages/gateway-client/src/event-loop-ready.js → 本地 _openclaw-stubs.ts
// （gateway-client 包未移植，stub 提供降级 waitForEventLoopReady 实现）。
export {
  waitForEventLoopReady,
  type EventLoopReadyOptions,
  type EventLoopReadyResult,
} from "./_openclaw-stubs.js";
