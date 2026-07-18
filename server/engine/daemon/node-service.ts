/**
 * 节点服务管理。
 */
import { buildDaemonCmdArgv } from "./cmd-argv.js";
import { resolveDaemonPaths } from "./paths.js";
import {
  resolveNodeLaunchAgentLabel,
  resolveNodeSystemdServiceName,
  resolveNodeWindowsTaskName,
  formatNodeServiceDescription,
} from "./constants.js";

export interface NodeServiceConfig {
  name?: string;
  command?: string;
  entry?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  autoRestart?: boolean;
  restartDelayMs?: number;
  description?: string;
  stateDir?: string;
  logDir?: string;
}

export function buildNodeServiceProgramArgs(config: NodeServiceConfig = {}): string[] {
  return buildDaemonCmdArgv({
    command: config.command,
    entry: config.entry,
    args: config.args,
  });
}

export function resolveNodeServicePaths(config: NodeServiceConfig = {}) {
  return resolveDaemonPaths({
    label: "node",
    launchdLabel: resolveNodeLaunchAgentLabel(),
    systemdUnitName: resolveNodeSystemdServiceName(),
    schtasksTaskName: resolveNodeWindowsTaskName(),
    stateDir: config.stateDir,
    logDir: config.logDir,
  });
}

export function getNodeServiceDescription(version?: string): string {
  return formatNodeServiceDescription({ version });
}

export function buildNodeServiceEnvironment(
  env: Record<string, string | undefined>,
  extra?: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return {
    ...env,
    ...extra,
    CROSS_WMS_SERVICE_MARKER: "crosswms",
    CROSS_WMS_SERVICE_KIND: "node",
    CROSS_WMS_LAUNCHD_LABEL: resolveNodeLaunchAgentLabel(),
    CROSS_WMS_SYSTEMD_UNIT: `${resolveNodeSystemdServiceName()}.service`,
    CROSS_WMS_WINDOWS_TASK_NAME: resolveNodeWindowsTaskName(),
    CROSS_WMS_TASK_SCRIPT_NAME: "node.cmd",
  };
}
