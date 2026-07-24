/**
 * Engine 通用工具函数入口（barrel）
 *
 * 汇总 server/engine/utils/ 下移植自 openclaw/src/utils.ts 的高价值纯函数。
 * 已被 cross-wms 其他模块覆盖的函数（如 clampNumber / escapeRegExp / isRecord /
 * isPlainObject / resolveUserPath / sleep / ensureDir / pathExists 等）不再重复导出，
 * 请直接从 engine/shared 或 engine/infra 引用。
 */

export { clampInt } from "./number.js";
export { sliceUtf16Safe, truncateUtf16Safe, normalizeE164 } from "./string.js";
export { shortenHomePath, displayPath } from "./path.js";
