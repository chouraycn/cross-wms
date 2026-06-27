/**
 * Commands Module Index
 * 命令模块入口
 */

export {
  getCommandRegistry,
  registerCommand,
  unregisterCommand,
  executeCommand,
  listCommands,
  resetCommandRegistryForTests,
} from "./commandRegistry.js";
export type {
  ChatCommandDefinition,
  CommandScope,
  CommandArgDefinition,
  CommandArgs,
  CommandExecutionContext,
  CommandExecutionResult,
  CommandHandler,
  RegisteredCommand,
} from "./commandRegistry.js";

export { registerBuiltinCommands, builtinCommands } from "./builtinCommands.js";
