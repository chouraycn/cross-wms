// TUI 主入口 — 统一导出
export { runTui } from './tui.js';
export { ChatServiceBackend, ChatServiceBackend as EmbeddedBackend } from './embeddedBackend.js';
export { HttpBackend, type HttpBackendOptions } from './httpBackend.js';
export { getTheme, detectTheme, colorize, bold, dim, italic, ANSI } from './theme.js';
export { themeManager, type ThemeName } from './themeManager.js';
export { getCommands, executeCommand } from './commands.js';
export {
  loadTuiConfig,
  saveTuiConfig,
  getDefaultConfigPath,
  validateTuiConfig,
  mergeWithDefaults,
  DEFAULT_TUI_CONFIG,
  type TuiConfig,
} from './config.js';
export {
  TOOL_PROFILE_VALUES,
  COMPACTION_STRATEGY_VALUES,
  TOOL_PROFILE_LABELS,
  COMPACTION_STRATEGY_LABELS,
  type ToolProfile,
  type CompactionStrategy,
} from './types/aiEngine.js';
export { runTuiCli, parseArgs, selectBackend, type CliArgs } from './cli.js';
export type {
  TuiOptions, TuiResult, ChatEvent, SessionInfo,
  TuiBackend, TuiCommand, TuiCommandContext, TuiTheme,
} from './types.js';
