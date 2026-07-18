// 为 Control UI 资产运行时测试提供 fs facade。
// 直接移植自 openclaw/src/infra/control-ui-assets.fs.runtime.ts，无外部依赖。
import fs from "node:fs";

// Control UI 资产测试/运行时通过此 facade 导入 fs，这样
// 资产解析器可以在不全局 mock node:fs 的情况下被 stub。
export const existsSync = fs.existsSync.bind(fs);
export const readFileSync = fs.readFileSync.bind(fs);
export const statSync = fs.statSync.bind(fs);
export const realpathSync = fs.realpathSync.bind(fs);
