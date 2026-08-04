/**
 * Public sandbox barrel for agent runtime code.
 *
 * Keep sandbox implementation modules behind this export surface so callers use
 * the same config, backend, Docker, SSH, filesystem, and policy contracts.
 */
export {
  resolveSandboxBrowserConfig,
  resolveSandboxConfigForAgent,
  resolveSandboxDockerConfig,
  resolveSandboxPruneConfig,
  resolveSandboxScope,
} from "./sandbox/config.js";
export {
  DEFAULT_SANDBOX_BROWSER_IMAGE,
  DEFAULT_SANDBOX_COMMON_IMAGE,
  DEFAULT_SANDBOX_IMAGE,
} from "./sandbox/constants.js";
export { ensureSandboxWorkspaceForSession, resolveSandboxContext } from "./sandbox/context.js";
export {
  getSandboxBackendFactory,
  getSandboxBackendManager,
  getSandboxBackendWorkdirResolver,
  registerSandboxBackend,
  requireSandboxBackendFactory,
} from "./sandbox/backend.js";

export { buildSandboxCreateArgs, isDockerDaemonUnavailable } from "./sandbox/docker.js";
export {
  listSandboxBrowsers,
  listSandboxContainers,
  removeSandboxBrowserContainer,
  removeSandboxContainer,
  type SandboxBrowserInfo,
  type SandboxContainerInfo,
} from "./sandbox/manage.js";
export {
  formatSandboxToolPolicyBlockedMessage,
  resolveSandboxRuntimeStatus,
} from "./sandbox/runtime-status.js";

export { isToolAllowed, resolveSandboxToolPolicyForAgent } from "./sandbox/tool-policy.js";
export type { SandboxFsBridge, SandboxFsStat, SandboxResolvedPath } from "./sandbox/fs-bridge.js";
export {
  buildExecRemoteCommand,
  buildRemoteCommand,
  buildSshSandboxArgv,
  buildValidatedExecRemoteCommand,
  createSshSandboxSessionFromConfigText,
  createSshSandboxSessionFromSettings,
  disposeSshSandboxSession,
  runSshSandboxCommand,
  shellEscape,
  uploadDirectoryToSshTarget,
} from "./sandbox/ssh.js";
export { sanitizeEnvVars } from "./sandbox/sanitize-env-vars.js";
export { createRemoteShellSandboxFsBridge } from "./sandbox/remote-fs-bridge.js";
export { createWritableRenameTargetResolver } from "./sandbox/fs-bridge-rename-targets.js";
export { resolveWritableRenameTargets } from "./sandbox/fs-bridge-rename-targets.js";
export { resolveWritableRenameTargetsForBridge } from "./sandbox/fs-bridge-rename-targets.js";

export type {
  CreateSandboxBackendParams,
  SandboxBackendCommandParams,
  SandboxBackendCommandResult,
  SandboxBackendExecSpec,
  SandboxBackendFactory,
  SandboxBackendHandle,
  SandboxBackendId,
  SandboxBackendManager,
  SandboxBackendRegistration,
  SandboxBackendRuntimeInfo,
  SandboxBackendWorkdirResolver,
} from "./sandbox/backend.js";
export type { RemoteShellSandboxHandle } from "./sandbox/remote-fs-bridge.js";
export type {
  RunSshSandboxCommandParams,
  SshSandboxSession,
  SshSandboxSettings,
} from "./sandbox/ssh.js";

export type {
  SandboxBrowserConfig,
  SandboxBrowserContext,
  SandboxConfig,
  SandboxContext,
  SandboxDockerConfig,
  SandboxPruneConfig,
  SandboxScope,
  SandboxSshConfig,
  SandboxToolPolicy,
  SandboxToolPolicyResolved,
  SandboxToolPolicySource,
  SandboxWorkspaceAccess,
  SandboxWorkspaceInfo,
} from "./sandbox/types.js";

// ============================================================================
// WMS 兼容：agents.ts 通过 createAgentSandbox / getAgentSandbox 管理 per-agent
// 运行时沙箱实例。openclaw 没有这个抽象，此处提供最小可运行 stub。
// ============================================================================

export type AgentSandboxOptions = {
  timeoutMs?: number;
  maxMemoryMB?: number;
  maxCpuTimeMs?: number;
};

export class AgentSandbox {
  readonly agentId: string;
  readonly options: AgentSandboxOptions;

  constructor(agentId: string, options: AgentSandboxOptions = {}) {
    this.agentId = agentId;
    this.options = options;
  }
}

const runtimeAgentSandboxes = new Map<string, AgentSandbox>();

/** 创建并注册一个 AgentSandbox 实例。 */
export function createAgentSandbox(
  agentId: string,
  options?: AgentSandboxOptions,
): AgentSandbox {
  const sandbox = new AgentSandbox(agentId, options);
  runtimeAgentSandboxes.set(agentId, sandbox);
  return sandbox;
}

/** 获取已注册的 AgentSandbox；未注册返回 undefined。 */
export function getAgentSandbox(agentId: string): AgentSandbox | undefined {
  return runtimeAgentSandboxes.get(agentId);
}

/** 清空所有已注册的 AgentSandbox（主要用于测试）。 */
export function clearAgentSandboxes(): void {
  runtimeAgentSandboxes.clear();
}
