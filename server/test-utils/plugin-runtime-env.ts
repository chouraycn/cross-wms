// Builds plugin runtime environment fixtures for plugin tests.
// Ported from openclaw/src/test-utils/plugin-runtime-env.ts.
//
// The upstream file imports OutputRuntimeEnv / RuntimeEnv from
// "openclaw/plugin-sdk/runtime"; that module is not part of the cross-wms
// server's resolution graph, so we declare minimal local type stubs that
// capture the same shape (log/error/writeStdout/writeJson/exit).
// 注意：不导入 vitest，避免生产环境加载 vitest 导致 "Vitest failed to
// access its internal state" 错误。测试中如需 vi.fn() 断言能力，可在测试
// 文件中自行 mock 本模块。

type MockFn = ((...args: unknown[]) => unknown) & {
  mock?: { calls: unknown[][] };
};

function createMockFn(): MockFn {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    calls.push(args);
    return undefined;
  };
  (fn as MockFn).mock = { calls };
  return fn as MockFn;
}

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
    log: createMockFn() as OutputRuntimeEnv["log"],
    error: createMockFn() as OutputRuntimeEnv["error"],
    writeStdout: createMockFn() as OutputRuntimeEnv["writeStdout"],
    writeJson: createMockFn() as OutputRuntimeEnv["writeJson"],
    exit: throwOnExit
      ? ((code: number): never => {
          throw new Error(`exit ${code}`);
        }) as OutputRuntimeEnv["exit"]
      : (createMockFn() as unknown as OutputRuntimeEnv["exit"]),
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
