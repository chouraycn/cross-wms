/**
 * Shared Vitest mocks for Node builtin modules used by plugin tests.
 */
import { vi } from "vitest";

type MockFactory<TModule extends object> =
  | Partial<TModule>
  | ((actual: TModule) => Partial<TModule>);

let childProcessModulePromise: Promise<typeof import("node:child_process")> | null = null;

const loadChildProcessModule = async () => {
  childProcessModulePromise ??=
    vi.importActual<typeof import("node:child_process")>("node:child_process");
  return await childProcessModulePromise;
};

function resolveMockOverrides<TModule extends object>(
  actual: TModule,
  factory: MockFactory<TModule>,
): Partial<TModule> {
  return typeof factory === "function" ? factory(actual) : factory;
}

function resolveDefaultBase(actual: object): Record<string, any> {
  const defaultExport = (actual as { default?: any }).default;
  if (defaultExport && typeof defaultExport === "object") {
    return defaultExport as Record<string, any>;
  }
  return actual as Record<string, any>;
}

export async function mockNodeBuiltinModule<TModule extends object>(
  loadActual: () => Promise<TModule>,
  factory: MockFactory<TModule>,
  options?: { mirrorToDefault?: boolean },
): Promise<TModule> {
  const actual = await loadActual();
  const overrides = resolveMockOverrides(actual, factory);
  const mocked = {
    ...actual,
    ...overrides,
  } as TModule & { default?: Record<string, any> };

  if (!options?.mirrorToDefault) {
    return mocked;
  }

  return {
    ...mocked,
    default: {
      ...resolveDefaultBase(actual),
      ...overrides,
    },
  } as TModule;
}

export async function mockNodeChildProcessSpawnSync(
  spawnSync: (...args: any[]) => unknown,
  loadActual: () => Promise<typeof import("node:child_process")> = loadChildProcessModule,
): Promise<typeof import("node:child_process")> {
  return mockNodeBuiltinModule(loadActual, {
    spawnSync: (...args: any[]) => spawnSync(...args),
  } as Partial<typeof import("node:child_process")>);
}

export async function mockNodeChildProcessExecFile(
  execFile: typeof import("node:child_process").execFile,
  loadActual: () => Promise<typeof import("node:child_process")> = loadChildProcessModule,
): Promise<typeof import("node:child_process")> {
  return mockNodeBuiltinModule(loadActual, {
    execFile,
  } as Partial<typeof import("node:child_process")>);
}
