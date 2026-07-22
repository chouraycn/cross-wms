import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface OpenClawTestState {
  tmpDir: string;
  workspaceDir: string;
  configDir: string;
  cleanup(): Promise<void>;
}

export async function createInstallDownloadTestState(): Promise<OpenClawTestState> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skills-install-"));
  const workspaceDir = path.join(tmpDir, "workspace");
  const configDir = path.join(tmpDir, "config");

  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });

  return {
    tmpDir,
    workspaceDir,
    configDir,
    async cleanup() {
      await fs.rm(tmpDir, { recursive: true, force: true });
    },
  };
}
