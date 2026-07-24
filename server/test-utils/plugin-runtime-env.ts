// Builds plugin runtime environment fixtures for plugin tests.
// Ported from openclaw/src/test-utils/plugin-runtime-env.ts.
//
// The upstream file imports OutputRuntimeEnv / RuntimeEnv from
// "openclaw/plugin-sdk/runtime"; that module is not part of the cross-wms
// server's resolution graph, so we declare minimal local type stubs that
// capture the same shape (log/error/writeStdout/writeJson/exit) and re-use
// vitest's vi.fn() for spies.
import { vi } from "vitest";

export type OutputRuntimeEnv = {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  writeStdout: (text: string) => void;
  writeJson: (value: unknown) => void;
  exit: (code: number) => never;
};

export type RuntimeEnv = OutputRuntimeEnv;

type RuntimeEnvOptions = {
  throwOnExit?: boolean;
};

/** Creates a plugin runtime env with test-safe defaults and optional exit throwing. */
export function createRuntimeEnv(options?: RuntimeEnvOptions): OutputRuntimeEnv {
  const throwOnExit = options?.throwOnExit ?? true;
  return {
    log: vi.fn(),
    error: vi.fn(),
    writeStdout: vi.fn(),
    writeJson: vi.fn(),
    exit: throwOnExit
      ? (vi.fn((code: number): never => {
          throw new Error(`exit ${code}`);
        }) as unknown as OutputRuntimeEnv["exit"])
      : (vi.fn() as unknown as OutputRuntimeEnv["exit"]),
  };
}

export function createTypedRuntimeEnv<TRuntime extends RuntimeEnv = OutputRuntimeEnv>(
  options?: RuntimeEnvOptions,
  _runtimeShape?: (runtime: TRuntime) => void,
): TRuntime {
  return createRuntimeEnv(options) as unknown as TRuntime;
}

export function createNonExitingRuntimeEnv(): OutputRuntimeEnv {
  return createRuntimeEnv({ throwOnExit: false });
}

export function createNonExitingTypedRuntimeEnv<TRuntime extends RuntimeEnv = OutputRuntimeEnv>(
  runtimeShape?: (runtime: TRuntime) => void,
): TRuntime {
  return createTypedRuntimeEnv<TRuntime>({ throwOnExit: false }, runtimeShape);
}
