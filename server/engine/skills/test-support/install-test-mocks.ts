/**
 * 测试 mock 工具——惰性加载 vitest，避免生产环境引入 vitest 依赖。
 * 生产环境调用时会抛出错误，仅在 vitest 测试上下文中可用。
 */

type MockFn = (...args: unknown[]) => unknown;

function createLazyMock(name: string): MockFn {
  return function (...args: unknown[]): unknown {
    try {
      // vitest 运行时通过 globalThis.__vitest__ 或 await import("vitest") 可用
      const vi = (globalThis as Record<string, unknown>).__vitest_vi__ as
        | { fn: () => MockFn }
        | undefined;
      if (vi) {
        return vi.fn()(...args);
      }
    } catch {
      // ignore
    }
    throw new Error(
      `Mock "${name}" is only available in vitest test context. ` +
        `Import vitest in your test file and call setupTestMocks() first.`,
    );
  };
}

let _runCommandWithTimeoutMock: MockFn | undefined;
let _fetchWithSsrFGuardMock: MockFn | undefined;
let _hasBinaryMock: MockFn | undefined;

/** 初始化 mock（仅测试环境调用） */
export async function setupTestMocks(): Promise<void> {
  const { vi } = await import("vitest");
  _runCommandWithTimeoutMock = vi.fn() as MockFn;
  _fetchWithSsrFGuardMock = vi.fn() as MockFn;
  _hasBinaryMock = vi.fn() as MockFn;
  // 注册到全局以便 lazy mock 访问
  (globalThis as Record<string, unknown>).__vitest_vi__ = vi;
}

export const runCommandWithTimeoutMock: MockFn = (...args: unknown[]) =>
  (_runCommandWithTimeoutMock ?? createLazyMock("runCommandWithTimeoutMock"))(...args);
export const fetchWithSsrFGuardMock: MockFn = (...args: unknown[]) =>
  (_fetchWithSsrFGuardMock ?? createLazyMock("fetchWithSsrFGuardMock"))(...args);
export const hasBinaryMock: MockFn = (...args: unknown[]) =>
  (_hasBinaryMock ?? createLazyMock("hasBinaryMock"))(...args);
