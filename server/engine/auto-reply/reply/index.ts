// auto-reply/reply 子模块统一 re-export。
// 这里聚合 ACP 命令、子 agent 命令、exec 指令以及 HTML 导出的精简版实现。

export {
  handleAcpCommand,
  clearAcpSessions,
  getAcpSessionSnapshot,
} from './commands-acp.js';
export type {
  AcpCommand,
  AcpSessionStatus,
  AcpSession,
  AcpCommandContext,
  AcpCommandResult,
} from './commands-acp.js';

export {
  handleSubagentCommand,
  clearSubagentRuns,
  getSubagentRunSnapshot,
} from './commands-subagents.js';
export type {
  SubagentCommand,
  SubagentRunStatus,
  SubagentRunRecord,
  SubagentCommandContext,
  SubagentCommandResult,
} from './commands-subagents.js';

export {
  handleExecDirective,
  parseExecDirective,
  clearExecTasks,
  getExecTaskSnapshot,
} from './exec.js';
export type {
  ExecDirectiveName,
  ExecRunStatus,
  ExecDirective,
  ExecTaskRecord,
  ExecDirectiveContext,
  ExecDirectiveResult,
} from './exec.js';

export { exportToHtml } from './export-html.js';
export type {
  HtmlExportMessage,
  HtmlExportConversation,
  HtmlExportOptions,
  HtmlExportResult,
} from './export-html.js';
