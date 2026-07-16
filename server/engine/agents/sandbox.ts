export interface AgentSandbox {
  agentId: string;
  enabled: boolean;
  allowedPaths?: string[];
  blockedPaths?: string[];
  allowedCommands?: string[];
  blockedCommands?: string[];
  networkAccess?: boolean;
  maxMemoryMb?: number;
  maxCpuPercent?: number;
}

export const DEFAULT_SANDBOX_CONFIG: AgentSandbox = {
  agentId: '',
  enabled: false,
  networkAccess: true,
};

export function createAgentSandbox(agentId: string, config?: Partial<AgentSandbox>): AgentSandbox {
  return {
    ...DEFAULT_SANDBOX_CONFIG,
    agentId,
    ...config,
  };
}

export function isPathAllowed(sandbox: AgentSandbox, path: string): boolean {
  if (!sandbox.enabled) return true;
  if (sandbox.blockedPaths?.includes(path)) return false;
  if (sandbox.allowedPaths?.includes(path)) return true;
  return !sandbox.enabled;
}

export function isCommandAllowed(sandbox: AgentSandbox, command: string): boolean {
  if (!sandbox.enabled) return true;
  if (sandbox.blockedCommands?.includes(command)) return false;
  if (sandbox.allowedCommands?.includes(command)) return true;
  return !sandbox.enabled;
}

export function hasNetworkAccess(sandbox: AgentSandbox): boolean {
  return !sandbox.enabled || sandbox.networkAccess === true;
}
