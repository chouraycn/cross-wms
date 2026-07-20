/**
 * 移植自 openclaw/src/agents/harness/native-hook-relay.ts
 *
 * Native hook relay: bridges agent tool approval/invocation events
 * to a native host process via JSON IPC.
 * Cross-wms simplified: no-op relay for environments without a native host.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type NativeHookRelayEvent = {
  kind: string;
  payload?: JsonValue;
};

export type NativeHookRelayProvider = {
  send(event: NativeHookRelayEvent): void;
  close(): void;
};

export type NativeHookRelayInvocation = {
  command: string;
  args?: JsonValue[];
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
};

export type NativeHookRelayProcessResponse = {
  exitCode: number | null;
  stdout?: string;
  stderr?: string;
};

export type NativeHookRelayRegistration = {
  registrationId: string;
  hookKind: string;
};

export type NativeHookRelayRegistrationHandle = {
  registrationId: string;
  dispose(): void;
};

export type RegisterNativeHookRelayParams = {
  hookKind: string;
  onEvent?: (event: NativeHookRelayEvent) => void;
};

export type NativeHookRelayCommandOptions = {
  timeout?: number;
  signal?: AbortSignal;
};

export type NativeHookRelayCommandForEventOptions = NativeHookRelayCommandOptions & {
  command: string;
  args?: JsonValue[];
};

export type InvokeNativeHookRelayParams = {
  registrationId: string;
  invocation: NativeHookRelayInvocation;
  options?: NativeHookRelayCommandOptions;
};

export type InvokeNativeHookRelayBridgeParams = {
  command: string;
  args?: JsonValue[];
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
};

export type NativeHookRelayDeferredApprovalOutcome = {
  approved: boolean;
  reason?: string;
};

const NO_NATIVE_HOST = "Native hook relay is not available in this environment.";

/** Registers a hook relay. No-op in cross-wms without native host. */
export function registerNativeHookRelay(_params: RegisterNativeHookRelayParams): NativeHookRelayRegistrationHandle {
  return {
    registrationId: `stub-${Date.now()}`,
    dispose() {},
  };
}

/** Builds a native hook relay command. Returns minimal stub. */
export function buildNativeHookRelayCommand(
  _event: NativeHookRelayEvent,
  _options?: NativeHookRelayCommandForEventOptions,
): NativeHookRelayInvocation {
  return { command: "", args: [] };
}

/** Invokes a native hook relay. No-op in cross-wms. */
export async function invokeNativeHookRelay(
  _params: InvokeNativeHookRelayParams,
): Promise<NativeHookRelayProcessResponse> {
  return { exitCode: 0, stdout: "", stderr: "" };
}

/** Returns whether a native hook relay invocation is available. */
export function hasNativeHookRelayInvocation(_registrationId: string): boolean {
  return false;
}

/** Resolves a deferred tool approval. No-op in cross-wms. */
export async function resolveNativeHookRelayDeferredToolApproval(
  _params: { registrationId: string; outcome: NativeHookRelayDeferredApprovalOutcome },
): Promise<void> {}

/** Invokes a native hook relay bridge. No-op in cross-wms. */
export async function invokeNativeHookRelayBridge(
  _params: InvokeNativeHookRelayBridgeParams,
): Promise<NativeHookRelayProcessResponse> {
  return { exitCode: 0, stdout: "", stderr: "" };
}

/** Renders a message for when the native hook relay is unavailable. */
export function renderNativeHookRelayUnavailableResponse(
  _invocation: NativeHookRelayInvocation,
): string {
  return NO_NATIVE_HOST;
}

/** Returns whether an error is a stale registration error. */
export function isNativeHookRelayBridgeStaleRegistrationError(_error: unknown): boolean {
  return false;
}

export const testing_native_hook_relay = {
  resetForTests() {},
};
