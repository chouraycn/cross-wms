// 通过受管理的 Windows 计划任务重启 gateway。
// 降级实现：openclaw 中从 ../daemon/cmd-argv.js 导入 quoteCmdScriptArg，
// 从 ../daemon/constants.js 导入 resolveGatewayWindowsTaskName，
// 从 ../daemon/restart-logs.js 导入 renderCmdRestartLogSetup，
// 从 ../daemon/schtasks.js 导入 resolveTaskScriptPath；
// cross-wms 未移植 daemon 模块，这里提供本地降级实现。
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { formatErrorMessage } from "./errors.js";
import type { RestartAttempt } from "./restart.types.js";
import { resolvePreferredOpenClawTmpDir } from "./tmp-openclaw-dir.js";
import { getWindowsCmdExePath } from "./windows-install-roots.js";

const TASK_RESTART_RETRY_LIMIT = 12;
const TASK_RESTART_RETRY_DELAY_SEC = 1;

/**
 * 为 cmd 脚本参数添加引号。
 * 降级实现：openclaw 中从 ../daemon/cmd-argv.js 导入 quoteCmdScriptArg，
 * cross-wms 未移植 daemon 模块，这里提供简化的本地实现。
 */
function quoteCmdScriptArg(value: string): string {
  if (!value) {
    return '""';
  }
  if (/^[A-Za-z0-9_./:~\\=-]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * 解析 gateway Windows 任务名称。
 * 降级实现：openclaw 中从 ../daemon/constants.js 导出，
 * cross-wms 未移植 daemon 模块，这里提供基于环境变量的降级实现。
 */
function resolveGatewayWindowsTaskName(profile?: string): string {
  const base = profile?.trim() ? `openclaw-${profile.trim()}` : "openclaw";
  return `${base}-gateway`;
}

/**
 * 解析任务脚本路径。
 * 降级实现：openclaw 中从 ../daemon/schtasks.js 导出，
 * cross-wms 未移植 daemon 模块，这里返回 undefined。
 */
function resolveTaskScriptPath(_env: NodeJS.ProcessEnv): string | undefined {
  return undefined;
}

type CmdRestartLogSetup = {
  quotedLogPath: string;
  lines: string[];
};

/**
 * 渲染 cmd 重启日志设置。
 * 降级实现：openclaw 中从 ../daemon/restart-logs.js 导出，
 * cross-wms 未移植 daemon 模块，这里提供最小化的本地实现。
 */
function renderCmdRestartLogSetup(env: NodeJS.ProcessEnv): CmdRestartLogSetup {
  const logDir = env.OPENCLAW_RESTART_LOG_DIR?.trim() || resolvePreferredOpenClawTmpDir();
  const logPath = path.join(logDir, "openclaw-restart.log");
  return {
    quotedLogPath: quoteCmdScriptArg(logPath),
    lines: [`set OPENCLAW_RESTART_LOG=${quoteCmdScriptArg(logPath)}`],
  };
}

function quotePowerShellSingleQuotedLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function resolveWindowsTaskName(env: NodeJS.ProcessEnv): string {
  const override = env.OPENCLAW_WINDOWS_TASK_NAME?.trim();
  if (override) {
    return override;
  }
  return resolveGatewayWindowsTaskName(env.OPENCLAW_PROFILE);
}

function buildScheduledTaskRestartScript(params: {
  quotedLogPath: string;
  setupLines: string[];
  taskName: string;
  taskScriptPath?: string;
}): string {
  const { quotedLogPath, setupLines, taskName, taskScriptPath } = params;
  const quotedTaskName = quoteCmdScriptArg(taskName);
  const queryTaskStateCommand = `(Get-ScheduledTask -TaskName ${quotePowerShellSingleQuotedLiteral(
    taskName,
  )} -ErrorAction SilentlyContinue).State`;
  const quotedQueryTaskStateCommand = quoteCmdScriptArg(queryTaskStateCommand);
  const lines = [
    "@echo off",
    "setlocal",
    ...setupLines,
    `>> ${quotedLogPath} 2>&1 echo [%DATE% %TIME%] openclaw restart attempt source=windows-task-handoff target=${quotedTaskName}`,
    `schtasks /Query /TN ${quotedTaskName} >> ${quotedLogPath} 2>&1`,
    "if errorlevel 1 goto fallback",
    "set /a attempts=0",
    ":retry",
    `timeout /t ${TASK_RESTART_RETRY_DELAY_SEC} /nobreak >nul`,
    "set /a attempts+=1",
    // 避免与已经启动计划任务的另一条重启路径竞争。
    `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ${quotedQueryTaskStateCommand} 2>nul | findstr /I /C:"Running" >nul 2>&1`,
    "if not errorlevel 1 goto cleanup",
    `schtasks /Run /TN ${quotedTaskName} >> ${quotedLogPath} 2>&1`,
    "if not errorlevel 1 goto cleanup",
    `if %attempts% GEQ ${TASK_RESTART_RETRY_LIMIT} goto fallback`,
    "goto retry",
    ":fallback",
    `>> ${quotedLogPath} 2>&1 echo [%DATE% %TIME%] openclaw restart fallback source=windows-task-handoff`,
  ];
  if (taskScriptPath) {
    const quotedScript = quoteCmdScriptArg(taskScriptPath);
    const quotedCmd = quoteCmdScriptArg(getWindowsCmdExePath());
    lines.push(
      `if exist ${quotedScript} (`,
      `  start "" /min ${quotedCmd} /d /c ${quotedScript}`,
      ")",
    );
  }
  lines.push(
    ":cleanup",
    `>> ${quotedLogPath} 2>&1 echo [%DATE% %TIME%] openclaw restart finished source=windows-task-handoff`,
    'del "%~f0" >nul 2>&1',
  );
  return lines.join("\r\n");
}

export function relaunchGatewayScheduledTask(env: NodeJS.ProcessEnv = process.env): RestartAttempt {
  const taskName = resolveWindowsTaskName(env);
  const taskScriptPath = resolveTaskScriptPath(env);
  const scriptPath = path.join(
    resolvePreferredOpenClawTmpDir(),
    `openclaw-schtasks-restart-${randomUUID()}.cmd`,
  );
  const quotedScriptPath = quoteCmdScriptArg(scriptPath);
  const restartLog = renderCmdRestartLogSetup({ ...process.env, ...env });
  try {
    fs.writeFileSync(
      scriptPath,
      `${buildScheduledTaskRestartScript({
        quotedLogPath: restartLog.quotedLogPath,
        setupLines: restartLog.lines,
        taskName,
        taskScriptPath,
      })}\r\n`,
      "utf8",
    );
    const cmdExePath = getWindowsCmdExePath();
    const child = spawn(cmdExePath, ["/d", "/s", "/c", quotedScriptPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return {
      ok: true,
      method: "schtasks",
      tried: [`schtasks /Run /TN "${taskName}"`, `${cmdExePath} /d /s /c ${quotedScriptPath}`],
    };
  } catch (err) {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // 尽力清理；保留原始重启失败。
    }
    return {
      ok: false,
      method: "schtasks",
      detail: formatErrorMessage(err),
      tried: [`schtasks /Run /TN "${taskName}"`],
    };
  }
}
