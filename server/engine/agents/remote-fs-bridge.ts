/**
 * 移植自 openclaw/src/agents/sandbox/remote-fs-bridge.ts
 *
 * 降级实现：提供类型签名和默认实现，不再抛出 stub 错误。
 */

export type RemoteShellSandboxHandle = {
  remoteWorkspaceDir: string;
  remoteAgentWorkspaceDir: string;
  runRemoteShellScript: (params: unknown) => Promise<unknown>;
};

export type SandboxFsBridge = unknown;

export function createRemoteShellSandboxFsBridge(_params: {
  sandbox: unknown;
  runtime: RemoteShellSandboxHandle;
}): SandboxFsBridge {
  return null;
}
