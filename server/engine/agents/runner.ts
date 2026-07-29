/**
 * ExtensionRunner 入口
 *
 * 完整实现已移植自 openclaw/src/agents/sessions/extensions/runner.ts，
 * 位于 ./sessions/extensions/runner.ts。本文件作为顶层 agents 模块的
 * 转发入口，让旧调用方可以从 agents/runner 直接导入 ExtensionRunner
 * 及其周边类型与函数。
 */

export type {
  ExtensionErrorListener,
  ForkHandler,
  NavigateTreeHandler,
  NewSessionHandler,
  ReloadHandler,
  ShutdownHandler,
  SwitchSessionHandler,
} from "./sessions/extensions/runner.js";
export { ExtensionRunner, emitSessionShutdownEvent } from "./sessions/extensions/runner.js";
