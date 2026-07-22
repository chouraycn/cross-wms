/**
 * 测试环境变量 mock 工具——惰性加载 vitest，避免生产环境引入 vitest 依赖。
 * 生产环境调用 setMockSkillsHomeEnv/restoreMockSkillsHomeEnv 时会回退到直接修改 env，
 * 不会抛错但也不会 mock os.homedir()。
 */

import os from "node:os";

export type SkillsHomeEnvSnapshot = {
  previousHome: string | undefined;
  previousOpenClawHome: string | undefined;
  previousUserProfile: string | undefined;
  homedirSpy?: { mockRestore: () => void };
};

export function setMockSkillsHomeEnv(fakeHome: string): SkillsHomeEnvSnapshot {
  const snapshot: SkillsHomeEnvSnapshot = {
    previousHome: process.env.HOME,
    previousOpenClawHome: process.env.OPENCLAW_HOME,
    previousUserProfile: process.env.USERPROFILE,
  };
  process.env.HOME = fakeHome;
  delete process.env.OPENCLAW_HOME;
  delete process.env.USERPROFILE;

  // 惰性尝试加载 vitest 的 spyOn（仅在测试环境可用）
  try {
    const vi = (globalThis as Record<string, unknown>).__vitest_vi__ as
      | { spyOn: (obj: typeof os, method: "homedir") => { mockReturnValue: (v: string) => { mockRestore: () => void } } }
      | undefined;
    if (vi) {
      const spy = vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
      snapshot.homedirSpy = spy;
    }
  } catch {
    // vitest 不可用，仅修改环境变量
  }

  return snapshot;
}

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete (process.env as Record<string, string | undefined>)[key];
  } else {
    process.env[key] = value;
  }
}

export async function restoreMockSkillsHomeEnv(
  snapshot: SkillsHomeEnvSnapshot,
  cleanup?: () => Promise<void> | void,
) {
  // 惰性恢复 vitest mock
  try {
    const vi = (globalThis as Record<string, unknown>).__vitest_vi__ as
      | { restoreAllMocks: () => void }
      | undefined;
    if (vi) {
      vi.restoreAllMocks();
    } else if (snapshot.homedirSpy) {
      snapshot.homedirSpy.mockRestore();
    }
  } catch {
    // ignore
  }

  restoreEnvValue("HOME", snapshot.previousHome);
  restoreEnvValue("OPENCLAW_HOME", snapshot.previousOpenClawHome);
  restoreEnvValue("USERPROFILE", snapshot.previousUserProfile);
  if (cleanup) {
    await cleanup();
  }
}
