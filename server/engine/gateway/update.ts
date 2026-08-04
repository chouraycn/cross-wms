// 移植自 openclaw/src/gateway/server-methods/update.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

import { fileURLToPath } from "node:url";
import path from "node:path";

// ESM 模块下 __filename/__dirname 不可用，通过 import.meta.url 解析
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// import.meta.url 降级为 CJS 全局 __filename
const __filename_stub: string = typeof __filename !== "undefined" ? __filename : "";
void __filename_stub;

export const updateHandlers: unknown = undefined;
