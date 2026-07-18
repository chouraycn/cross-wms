// 路由、认证和审批表面共享的 Node 工具命令名。
export const NODE_SYSTEM_RUN_COMMANDS = [
  "system.run.prepare",
  "system.run",
  "system.which",
] as const;

export const NODE_SYSTEM_NOTIFY_COMMAND = "system.notify";
export const NODE_BROWSER_PROXY_COMMAND = "browser.proxy";

export const NODE_EXEC_APPROVALS_COMMANDS = [
  "system.execApprovals.get",
  "system.execApprovals.set",
] as const;
