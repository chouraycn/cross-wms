// Generates tiny plugin fixtures for plugin loader tests.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { fileURLToPath } from "node:url";

// ESM 模块下 __filename/__dirname 不可用，通过 import.meta.url 解析
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const pluginTestRepoRoot = path.resolve(__dirname, "../..");

const tempDirs: string[] = [];

export function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function createGeneratedPluginTempRoot(prefix: string): string {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(tempRoot);
  return tempRoot;
}

export function installGeneratedPluginTempRootCleanup() {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
