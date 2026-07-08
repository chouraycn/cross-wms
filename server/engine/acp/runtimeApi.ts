export type AcpRuntimeErrorCode =
  | "ACP_INVALID_RUNTIME_OPTION"
  | "ACP_SESSION_INIT_FAILED"
  | "ACP_TURN_FAILED";

export class AcpRuntimeError extends Error {
  constructor(
    public readonly code: AcpRuntimeErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AcpRuntimeError";
  }
}

export type AcpRuntimeHandle = {
  sessionKey: string;
  acpxRecordId?: string;
  runtimeSessionName?: string;
};

export type AcpRuntimeStatus = {
  healthy: boolean;
  sessionMode?: string;
};

export type AcpRuntimeEvent =
  | { type: "text"; content: string; streamId?: string }
  | { type: "tool_call"; content: unknown; streamId?: string }
  | { type: "tool_result"; content: unknown; streamId?: string }
  | { type: "error"; code: string; message: string; streamId?: string };

export type AcpRuntimeTurnResult =
  | { status: "completed" }
  | { status: "failed"; error: { code: string; message: string } };

export type AcpRuntimeTurn = {
  requestId: string;
  events: AsyncIterable<AcpRuntimeEvent>;
  result: Promise<AcpRuntimeTurnResult>;
  cancel(inputArgs?: { reason?: string }): Promise<void>;
  closeStream(inputArgs?: { reason?: string }): Promise<void>;
};

export interface AcpRuntime {
  isHealthy(): boolean;
  probeAvailability(): Promise<void>;
  doctor?(): Promise<{ ok: boolean; message: string; details?: string[] }>;
  ensureSession(input: {
    agent?: string;
    sessionKey: string;
    mode: "persistent" | "oneshot";
    model?: string;
    thinking?: string;
    cwd?: string;
    resumeSessionId?: string;
  }): Promise<AcpRuntimeHandle>;
  runTurn(input: {
    handle: AcpRuntimeHandle;
    requestId: string;
    messages: unknown[];
    tools?: unknown[];
  }): AsyncIterable<AcpRuntimeEvent>;
  startTurn(input: {
    handle: AcpRuntimeHandle;
    requestId: string;
    messages: unknown[];
    tools?: unknown[];
  }): AcpRuntimeTurn;
  getCapabilities(): unknown;
  getStatus(input: { handle: AcpRuntimeHandle }): Promise<AcpRuntimeStatus>;
  setMode(input: { handle: AcpRuntimeHandle; mode: string }): Promise<void>;
  setConfigOption(input: { handle: AcpRuntimeHandle; key: string; value: unknown }): Promise<void>;
  cancel(input: { handle: AcpRuntimeHandle }): Promise<void>;
  close(input: {
    handle: AcpRuntimeHandle;
    reason?: string;
    discardPersistentState?: boolean;
  }): Promise<void>;
}

export interface OpenClawPluginService {
  id: string;
  start(ctx: OpenClawPluginServiceContext): Promise<void>;
  stop(ctx: OpenClawPluginServiceContext): Promise<void>;
}

export interface OpenClawPluginServiceContext {
  workspaceDir: string;
  stateDir: string;
  logger: PluginLogger;
  config: {
    acp?: {
      allowedAgents?: string[];
    };
  };
  startupTrace?: {
    measure<T>(name: string, run: () => T | Promise<T>): Promise<T>;
    detail?(name: string, metrics: ReadonlyArray<readonly [string, number | string]>): void;
  };
}

export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const registeredBackends = new Map<string, AcpRuntime>();

export function registerAcpRuntimeBackend(params: {
  id: string;
  runtime: AcpRuntime;
  healthy?: () => boolean;
}): void {
  registeredBackends.set(params.id, params.runtime);
}

export function unregisterAcpRuntimeBackend(id: string): void {
  registeredBackends.delete(id);
}

export function getRegisteredAcpRuntimeBackends(): Map<string, AcpRuntime> {
  return new Map(registeredBackends);
}