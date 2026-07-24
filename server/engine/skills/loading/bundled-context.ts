import { getChildLogger } from "../../logging/logger.js";
import { loadSkillsFromDirectory } from "./local-loader.js";

const logger = getChildLogger({ module: "skills" } as any);

let hasWarnedMissingBundledDir = false;
let cachedBundledContext: { dir: string; names: Set<string> } | null = null;

export type BundledSkillsResolveOptions = {
  argv1?: string;
  moduleUrl?: string;
  cwd?: string;
  execPath?: string;
};

export interface BundledSkillsContext {
  dir?: string;
  names: Set<string>;
}

export async function resolveBundledSkillsContext(
  opts: BundledSkillsResolveOptions = {},
): Promise<BundledSkillsContext> {
  const dir = resolveBundledSkillsDir(opts);
  const names = new Set<string>();

  if (!dir) {
    if (!hasWarnedMissingBundledDir) {
      hasWarnedMissingBundledDir = true;
      logger.warn(
        "Bundled skills directory could not be resolved; built-in skills may be missing.",
      );
    }
    return { dir, names };
  }

  if (cachedBundledContext?.dir === dir) {
    return { dir, names: new Set(cachedBundledContext.names) };
  }

  const result = await loadSkillsFromDirectory(dir, "bundled");
  for (const entry of result) {
    if (entry.skill.name.trim()) {
      names.add(entry.skill.name);
    }
  }

  cachedBundledContext = { dir, names: new Set(names) };
  return { dir, names };
}

function resolveBundledSkillsDir(
  opts: BundledSkillsResolveOptions = {},
): string | undefined {
  const override = process.env.CROSS_WMS_BUNDLED_SKILLS_DIR?.trim();
  if (override) {
    return override;
  }

  try {
    const execPath = opts.execPath ?? process.execPath;
    const execDir = require("path").dirname(execPath);
    const sibling = require("path").join(execDir, "skills");
    if (require("fs").existsSync(sibling)) {
      return sibling;
    }
  } catch {
    // ignore
  }

  try {
    const moduleUrl = opts.moduleUrl;
    if (moduleUrl) {
      const moduleDir = require("path").dirname(require("url").fileURLToPath(moduleUrl));
      const packageRoot = require("path").resolve(moduleDir, "../../..");
      const skillsDir = require("path").join(packageRoot, "server", "engine", "skills", "builtin");

      if (require("fs").existsSync(skillsDir)) {
        return skillsDir;
      }
    }
  } catch {
    // ignore
  }

  return undefined;
}