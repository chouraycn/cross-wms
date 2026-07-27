// Shared option/result types for node CLI command modules.
// 移植自 openclaw/src/cli/nodes-cli/types.ts

/** Common Gateway/node options consumed across node CLI subcommands. */
export type NodesRpcOpts = {
  url?: string;
  token?: string;
  timeout?: string;
  json?: boolean;
  node?: string;
  command?: string;
  params?: string;
  invokeTimeout?: string;
  idempotencyKey?: string;
  connected?: boolean;
  lastConnected?: string;
  target?: string;
  x?: string;
  y?: string;
  width?: string;
  height?: string;
  js?: string;
  jsonl?: string;
  text?: string;
  cwd?: string;
  env?: string[];
  commandTimeout?: string;
  needsScreenRecording?: boolean;
  title?: string;
  body?: string;
  sound?: string;
  priority?: string;
  delivery?: string;
  name?: string;
  facing?: string;
  format?: string;
  maxWidth?: string;
  quality?: string;
  delayMs?: string;
  deviceId?: string;
  maxAge?: string;
  accuracy?: string;
  locationTimeout?: string;
  duration?: string;
  screen?: string;
  fps?: string;
  audio?: boolean;
};

/** Node list, paired-node, and pending-request payload types from shared parsers. */
export type NodeListNode = {
  nodeId: string;
  displayName?: string;
  platform?: string;
  version?: string;
  coreVersion?: string;
  uiVersion?: string;
  remoteIp?: string;
  connected?: boolean;
  paired?: boolean;
  caps?: string[];
  permissions?: Record<string, boolean>;
  approvalState?: string;
  pendingRequestId?: string;
  pendingDeclaredCaps?: string[];
  pendingDeclaredCommands?: string[];
  pendingDeclaredPermissions?: Record<string, boolean>;
  approvedAtMs?: number;
  connectedAtMs?: number;
  deviceFamily?: string;
  modelIdentifier?: string;
  clientId?: string;
  clientMode?: string;
  pathEnv?: string;
  commands?: string[];
};

export type PairedNode = {
  nodeId: string;
  displayName?: string;
  platform?: string;
  version?: string;
  remoteIp?: string;
  token?: string;
  createdAtMs?: number;
  lastConnectedAtMs?: number;
  permissions?: Record<string, boolean>;
  approvedAtMs?: number;
};

export type PendingRequest = {
  requestId: string;
  nodeId?: string;
  displayName?: string;
  platform?: string;
  version?: string;
  remoteIp?: string;
  requiredApproveScopes?: string[];
  commands?: string[];
  createdAtMs?: number;
};

export type GatewayRpcOpts = {
  config?: unknown;
  url?: string;
  token?: string;
  password?: string;
  timeout?: string;
  expectFinal?: boolean;
  json?: boolean;
  localPortOverride?: number;
};

export type DaemonStatusOptions = unknown;
export type DaemonInstallOptions = unknown;
export type DaemonLifecycleOptions = unknown;
