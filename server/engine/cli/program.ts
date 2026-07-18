// Compatibility barrel for historical CLI program helpers.
// 移植自 openclaw/src/cli/program.ts。
//
// 降级策略：
//  - `forceFreePort` 已移植至 `./ports.ts`，直接 re-export。
//  - `buildProgram` 依赖 openclaw 的 `./program/build-program.js`，
//    该模块进一步依赖 `./command-registry.js`、`./context.js`、
//    `./help.js`、`./preaction.js`、`./program-context.js` 等子模块，
//    这些子模块在 cross-wms 中尚未移植；这里提供降级 stub，
//    抛出 "not supported" 错误，保留函数签名以便未来替换为正式实现。

/** Find a free TCP port for CLI/server tests and startup helpers. */
export { forceFreePort } from "./ports.js";

// ===== 内联降级：buildProgram stub =====
/**
 * Build the root OpenClaw Commander program.
 *
 * 降级实现：openclaw 的 `./program/build-program.js` 未移植（依赖
 * `command-registry.js`、`context.js`、`help.js`、`preaction.js`、
 * `program-context.js` 等子模块）；这里抛出 "not supported" 错误，
 * 保留函数签名以便未来替换为正式实现。
 */
export function buildProgram(): never {
  throw new Error(
    "buildProgram: not supported in stub mode (program/build-program not ported).",
  );
}
// ===== buildProgram stub 结束 =====
