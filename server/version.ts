// Version module for cross-wms server
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function readVersionFromPackageJson(): string {
  try {
    const moduleDir = __dirname;
    const candidates = [
      join(moduleDir, "package.json"),
      join(moduleDir, "..", "package.json"),
    ];
    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as { version?: string };
      if (parsed.version) return parsed.version;
    }
  } catch {
    // ignore
  }
  return "0.0.0";
}

export const VERSION = process.env.CDFKNOW_VERSION ?? readVersionFromPackageJson();
