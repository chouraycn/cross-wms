import fs from "node:fs";
import path from "node:path";
import { logger } from "../../../logger.js";

export interface SkillEnvOverride {
  skillName: string;
  env: Record<string, string>;
  priority: number;
  source: string;
}

export interface SkillEnvOverrideOptions {
  skillName?: string;
  inheritDefaults?: boolean;
}

export interface ProcessEnvSnapshot {
  env: Record<string, string | undefined>;
  skillName: string;
}

const GLOBAL_SCOPE = "__global__";
const DEFAULT_PRIORITY = 100;
const DEFAULT_SOURCE = "default";

const skillEnvOverrides = new Map<string, SkillEnvOverride[]>();
let registrationOrder = 0;

interface InternalOverride extends SkillEnvOverride {
  _order: number;
}

function getOverridesArray(skillName: string): InternalOverride[] {
  if (!skillEnvOverrides.has(skillName)) {
    skillEnvOverrides.set(skillName, []);
  }
  return skillEnvOverrides.get(skillName) as InternalOverride[];
}

export function registerSkillEnvOverride(
  skillName: string,
  env: Record<string, string>,
  source: string = DEFAULT_SOURCE,
  priority: number = DEFAULT_PRIORITY,
): void {
  const overrides = getOverridesArray(skillName);
  const existingIndex = overrides.findIndex((o) => o.source === source);
  const entry: InternalOverride = {
    skillName,
    env: { ...env },
    priority,
    source,
    _order: registrationOrder++,
  };

  if (existingIndex >= 0) {
    overrides[existingIndex] = entry;
  } else {
    overrides.push(entry);
  }

  logger.debug(
    `Registered env override for skill="${skillName}" source="${source}" priority=${priority} keys=${Object.keys(env).length}`,
  );
}

function sortOverrides(overrides: InternalOverride[]): InternalOverride[] {
  return [...overrides].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a._order - b._order;
  });
}

export function getSkillEnv(
  skillName: string,
  options: SkillEnvOverrideOptions = {},
): Record<string, string> {
  const { inheritDefaults = true } = options;
  const result: Record<string, string> = {};

  if (inheritDefaults) {
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  const globalOverrides = getOverridesArray(GLOBAL_SCOPE) as InternalOverride[];
  const skillOverrides = getOverridesArray(skillName) as InternalOverride[];

  const sortedGlobal = sortOverrides(globalOverrides);
  const sortedSkill = sortOverrides(skillOverrides);

  for (const override of sortedGlobal) {
    Object.assign(result, override.env);
  }

  for (const override of sortedSkill) {
    Object.assign(result, override.env);
  }

  return result;
}

export function setSkillEnvVar(
  skillName: string,
  key: string,
  value: string,
  source: string = DEFAULT_SOURCE,
): void {
  const overrides = getOverridesArray(skillName);
  let target = overrides.find((o) => o.source === source) as InternalOverride;

  if (!target) {
    target = {
      skillName,
      env: {},
      priority: DEFAULT_PRIORITY,
      source,
      _order: registrationOrder++,
    };
    overrides.push(target);
  }

  target.env[key] = value;
  logger.debug(`Set env var for skill="${skillName}" source="${source}" key="${key}"`);
}

export function getSkillEnvVar(
  skillName: string,
  key: string,
  options: SkillEnvOverrideOptions = {},
): string | undefined {
  const merged = getSkillEnv(skillName, options);
  return merged[key];
}

export function removeSkillEnvOverride(skillName: string, source?: string): void {
  if (source) {
    const overrides = getOverridesArray(skillName);
    const index = overrides.findIndex((o) => o.source === source);
    if (index >= 0) {
      overrides.splice(index, 1);
      logger.debug(`Removed env override for skill="${skillName}" source="${source}"`);
    }
  } else {
    skillEnvOverrides.delete(skillName);
    logger.debug(`Removed all env overrides for skill="${skillName}"`);
  }
}

export function listSkillEnvOverrides(skillName?: string): SkillEnvOverride[] {
  const result: SkillEnvOverride[] = [];

  if (skillName) {
    const overrides = getOverridesArray(skillName);
    for (const override of overrides) {
      result.push({
        skillName: override.skillName,
        env: { ...override.env },
        priority: override.priority,
        source: override.source,
      });
    }
  } else {
    for (const [, overrides] of skillEnvOverrides) {
      for (const override of overrides) {
        result.push({
          skillName: override.skillName,
          env: { ...override.env },
          priority: override.priority,
          source: override.source,
        });
      }
    }
  }

  return result;
}

export function clearAllSkillEnvOverrides(): void {
  skillEnvOverrides.clear();
  registrationOrder = 0;
  logger.debug("Cleared all skill env overrides");
}

export function applySkillEnvToProcess(skillName: string): ProcessEnvSnapshot {
  const snapshot: ProcessEnvSnapshot = {
    env: {},
    skillName,
  };

  const mergedEnv = getSkillEnv(skillName);

  for (const key of Object.keys(process.env)) {
    snapshot.env[key] = process.env[key];
  }

  for (const [key, value] of Object.entries(mergedEnv)) {
    process.env[key] = value;
  }

  logger.debug(`Applied env to process for skill="${skillName}"`);
  return snapshot;
}

export function restoreProcessEnv(snapshot: ProcessEnvSnapshot): void {
  const currentKeys = new Set(Object.keys(process.env));
  const snapshotKeys = new Set(Object.keys(snapshot.env));

  for (const key of currentKeys) {
    if (!snapshotKeys.has(key)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(snapshot.env)) {
    process.env[key] = value;
  }

  logger.debug(`Restored process env from snapshot for skill="${snapshot.skillName}"`);
}

export function loadSkillEnvFromFile(configPath: string): void {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const data = JSON.parse(raw);

    if (Array.isArray(data.overrides)) {
      for (const override of data.overrides) {
        if (override.skillName && override.env) {
          registerSkillEnvOverride(
            override.skillName,
            override.env,
            override.source ?? DEFAULT_SOURCE,
            override.priority ?? DEFAULT_PRIORITY,
          );
        }
      }
      logger.info(`Loaded ${data.overrides.length} env overrides from ${configPath}`);
    }
  } catch (err) {
    logger.error(`Failed to load skill env config from ${configPath}: ${(err as Error).message}`);
    throw err;
  }
}

export function saveSkillEnvToFile(configPath: string): void {
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const overrides = listSkillEnvOverrides();
    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      overrides,
    };

    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8");
    logger.info(`Saved ${overrides.length} env overrides to ${configPath}`);
  } catch (err) {
    logger.error(`Failed to save skill env config to ${configPath}: ${(err as Error).message}`);
    throw err;
  }
}
