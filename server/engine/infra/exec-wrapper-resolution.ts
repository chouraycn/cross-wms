// 移植自 openclaw/src/infra/exec-wrapper-resolution.ts
// exec wrapper 解析 facade —— 汇总可执行 token、dispatch wrapper 与 shell multiplexer。
//
// 降级策略：直接重导出 cross-wms 已有的实现。
export { basenameLower, normalizeExecutableToken } from "./exec-wrapper-tokens.js";
export {
  extractEnvAssignmentKeysFromDispatchWrappers,
  isDispatchWrapperExecutable,
  resolveDispatchWrapperTrustPlan,
  unwrapDispatchWrappersForResolution,
  unwrapEnvInvocation,
  unwrapKnownDispatchWrapperInvocation,
} from "./dispatch-wrapper-resolution.js";
export {
  extractBindableShellWrapperInlineCommand,
  extractShellWrapperCommand,
  extractShellWrapperInlineCommand,
  hasEnvManipulationBeforeShellWrapper,
  isBlockedShellWrapperCommand,
  isShellWrapperExecutable,
  isShellWrapperInvocation,
  POSIX_SHELL_WRAPPERS,
  POWERSHELL_WRAPPERS,
  resolveShellWrapperTransportArgv,
  unwrapKnownShellMultiplexerInvocation,
} from "./shell-wrapper-resolution.js";
