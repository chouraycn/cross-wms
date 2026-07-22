import path from "node:path";
import type { SkillEntry } from "../types.js";

export function resolveSkillToolsRootDir(entry: SkillEntry): string {
  const key = entry.skill.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const safeKey = key.replace(/[^a-z0-9-]/g, "_");
  const configDir = process.env.CROSS_WMS_CONFIG_DIR || path.join(process.env.HOME || "/", ".cross-wms");
  return path.join(configDir, "tools", safeKey);
}