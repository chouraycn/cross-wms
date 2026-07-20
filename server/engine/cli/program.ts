// Compatibility barrel for historical CLI program helpers.
// 移植自 openclaw/src/cli/program.ts。

/** Find a free TCP port for CLI/server tests and startup helpers. */
export { forceFreePort } from "./ports.js";

/** Build the root OpenClaw Commander program. */
export { buildProgram } from "./build-program.js";
