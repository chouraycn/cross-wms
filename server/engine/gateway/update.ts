// 移植自 openclaw/src/gateway/server-methods/update.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

// import.meta.url 降级为 CJS 全局 __filename
const __filename_stub: string = typeof __filename !== "undefined" ? __filename : "";
void __filename_stub;

export const updateHandlers: unknown = undefined;
