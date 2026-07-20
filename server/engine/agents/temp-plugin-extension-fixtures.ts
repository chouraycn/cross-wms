/**
 * 移植自 openclaw/src/agents/test-helpers/temp-plugin-extension-fixtures.ts
 *
 * Temporary plugin/extension fixtures.
 * cross-wms 简化实现：提供基本的临时目录和插件管理。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Creates a temporary plugin directory. */
export function createTempPluginDir(
  tempDirs: string[],
  prefix: string,
  options?: { parentDir?: string },
): string {
  const parentDir = options?.parentDir ?? os.tmpdir();
  fs.mkdirSync(parentDir, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parentDir, prefix));
  tempDirs.push(dir);
  return dir;
}

/** Writes a temporary plugin file. */
export function writeTempPlugin(params: {
  dir: string;
  id: string;
  body: string;
  manifest?: Record<string, unknown>;
  filename?: string;
}): string {
  const pluginDir = path.join(params.dir, params.id);
  fs.mkdirSync(pluginDir, { recursive: true });
  const file = path.join(pluginDir, params.filename ?? `${params.id}.mjs`);
  fs.writeFileSync(file, params.body, "utf-8");
  fs.writeFileSync(
    path.join(pluginDir, "openclaw.plugin.json"),
    JSON.stringify(
      {
        id: params.id,
        ...params.manifest,
        configSchema: { type: "object", additionalProperties: false, properties: {} },
      },
      null,
      2,
    ),
    "utf-8",
  );
  return file;
}

/** Cleans up temporary plugin test environment. */
export function cleanupTempPluginTestEnvironment(
  tempDirs: string[],
  originalBundledPluginsDir: string | undefined,
  originalDisableBundledPlugins?: string,
) {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (originalBundledPluginsDir === undefined) {
    delete process.env.OPENCLAW_BUNDLED_PLUGINS_DIR;
  } else {
    process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = originalBundledPluginsDir;
  }
  if (originalDisableBundledPlugins === undefined) {
    delete process.env.OPENCLAW_DISABLE_BUNDLED_PLUGINS;
  } else {
    process.env.OPENCLAW_DISABLE_BUNDLED_PLUGINS = originalDisableBundledPlugins;
  }
}

/** Resets the active plugin registry for tests. */
export function resetActivePluginRegistryForTest() {
  // No-op in cross-wms: plugin registry not available
}
