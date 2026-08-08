// Agent binding test support centralizes mocked channel plugin registries and lazy imports.
import type { Mock } from "vitest";
import { vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createLazyImportLoader } from "../shared/lazy-promise.js";
import { createTestRuntime } from "./test-runtime-config-helpers.js";

type ReplaceConfigFileResult = Awaited<
  ReturnType<(typeof import("../config/config.js"))["replaceConfigFile"]>
>;

export const readConfigFileSnapshotMock: Mock<(...args: any[]) => Promise<any>> = vi.fn();
export const writeConfigFileMock: Mock<(...args: any[]) => Promise<any>> = vi
  .fn()
  .mockResolvedValue(undefined);
const replaceConfigFileMock: Mock<(...args: any[]) => Promise<any>> = vi.fn(
  async (params: { nextConfig: OpenClawConfig }): Promise<ReplaceConfigFileResult> => {
    await writeConfigFileMock(params.nextConfig);
    return {
      path: "/tmp/openclaw.json",
      previousHash: null,
      snapshot: {} as never,
      nextConfig: params.nextConfig,
      persistedHash: "test-config-hash",
      afterWrite: { mode: "auto" },
      followUp: { mode: "auto", requiresRestart: false },
    };
  },
) as Mock<(...args: any[]) => Promise<any>>;

vi.mock("../config/config.js", () => ({
  readConfigFileSnapshot: (...args: any[]) => readConfigFileSnapshotMock(...args),
  writeConfigFile: (...args: any[]) => writeConfigFileMock(...args),
  replaceConfigFile: (...args: any[]) => replaceConfigFileMock(...args),
}));

vi.mock("./agents.command-shared.js", () => ({
  createQuietRuntime: <T>(runtime: T) => runtime,
  requireValidConfig: async () => {
    const snapshot = (await readConfigFileSnapshotMock()) as
      | { config?: OpenClawConfig; sourceConfig?: OpenClawConfig }
      | undefined;
    return snapshot?.sourceConfig ?? snapshot?.config ?? null;
  },
  requireValidConfigFileSnapshot: async () => readConfigFileSnapshotMock(),
}));

export const runtime = createTestRuntime();

const agentsBindCommandModuleLoader = createLazyImportLoader(
  () => import("./agents.commands.bind.js"),
);

export async function loadFreshAgentsBindCommandModuleForTest() {
  return await agentsBindCommandModuleLoader.load();
}

export function resetAgentsBindTestHarness(): void {
  readConfigFileSnapshotMock.mockClear();
  writeConfigFileMock.mockClear();
  replaceConfigFileMock.mockClear();
  runtime.log.mockClear();
  runtime.error.mockClear();
  runtime.exit.mockClear();
}
