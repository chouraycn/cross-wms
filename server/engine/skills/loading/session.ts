import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseFrontmatter } from "../loading/frontmatter.js";
import { formatSkillsForPrompt as formatSkillContractForPrompt } from "./skill-contract.js";
import { computeSkillPromptVersion } from "./skill-version.js";
import type { ParsedSkillFrontmatter, Skill as SkillType } from "../types.js";

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

export interface LoadSkillsResult {
  skills: SkillType[];
  diagnostics: Array<{ type: string; message: string; path: string }>;
}

function validateName(name: string): string[] {
  const errors: string[] = [];
  if (name.length > MAX_NAME_LENGTH) {
    errors.push(`name exceeds ${MAX_NAME_LENGTH} characters (${name.length})`);
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    errors.push(`name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`);
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    errors.push(`name must not start or end with a hyphen`);
  }
  if (name.includes("--")) {
    errors.push(`name must not contain consecutive hyphens`);
  }
  return errors;
}

function validateDescription(description: string | undefined): string[] {
  const errors: string[] = [];
  if (!description || description.trim() === "") {
    errors.push("description is required");
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${description.length})`);
  }
  return errors;
}

export interface LoadSkillsFromDirOptions {
  dir: string;
  source: string;
}

function createSkillSourceInfo(filePath: string, baseDir: string, source: string) {
  return {
    source,
    scope: source === "user" ? "user" : "project",
    origin: "top-level",
    baseDir,
    filePath,
  };
}

export function loadSkillsFromDir(options: LoadSkillsFromDirOptions): LoadSkillsResult {
  const { dir, source } = options;
  return loadSkillsFromDirInternal(dir, source as SkillType["source"], true);
}

function loadSkillsFromDirInternal(
  dir: string,
  source: SkillType["source"],
  includeRootFiles: boolean,
  rootDir?: string,
): LoadSkillsResult {
  const skills: SkillType[] = [];
  const diagnostics: Array<{ type: string; message: string; path: string }> = [];

  if (!existsSync(dir)) {
    return { skills, diagnostics };
  }

  const root = rootDir ?? dir;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name !== "SKILL.md") {
        continue;
      }

      const fullPath = join(dir, entry.name);

      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          isFile = statSync(fullPath).isFile();
        } catch {
          continue;
        }
      }

      if (!isFile) {
        continue;
      }

      const result = loadSkillFromFile(fullPath, source);
      if (result.skill) {
        skills.push(result.skill);
      }
      diagnostics.push(...result.diagnostics);
      return { skills, diagnostics };
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }

      const fullPath = join(dir, entry.name);

      let isDirectory = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          const stats = statSync(fullPath);
          isDirectory = stats.isDirectory();
          isFile = stats.isFile();
        } catch {
          continue;
        }
      }

      if (isDirectory) {
        const subResult = loadSkillsFromDirInternal(fullPath, source, false, root);
        skills.push(...subResult.skills);
        diagnostics.push(...subResult.diagnostics);
        continue;
      }

      if (!isFile || !includeRootFiles || !entry.name.endsWith(".md")) {
        continue;
      }

      const result = loadSkillFromFile(fullPath, source);
      if (result.skill) {
        skills.push(result.skill);
      }
      diagnostics.push(...result.diagnostics);
    }
  } catch {}

  return { skills, diagnostics };
}

function loadSkillFromFile(
  filePath: string,
  source: SkillType["source"],
): { skill: SkillType | null; diagnostics: Array<{ type: string; message: string; path: string }> } {
  const diagnostics: Array<{ type: string; message: string; path: string }> = [];

  try {
    const rawContent = readFileSync(filePath, "utf-8");
    const frontmatter = parseFrontmatter(rawContent);
    const skillDir = dirname(filePath);
    const parentDirName = basename(skillDir);

    const description = frontmatter["description"];
    const name = frontmatter["name"] || parentDirName;

    const descErrors = validateDescription(description);
    for (const error of descErrors) {
      diagnostics.push({ type: "warning", message: error, path: filePath });
    }

    const nameErrors = validateName(name);
    for (const error of nameErrors) {
      diagnostics.push({ type: "warning", message: error, path: filePath });
    }

    if (!description || description.trim() === "") {
      return { skill: null, diagnostics };
    }

    const disableModelInvocationStr = frontmatter["disable-model-invocation"];
    const disableModelInvocation = disableModelInvocationStr === "true" || disableModelInvocationStr === "yes" || disableModelInvocationStr === "1";

    return {
      skill: {
        name,
        description,
        filePath,
        baseDir: skillDir,
        promptVersion: computeSkillPromptVersion(rawContent),
        source,
        disableModelInvocation,
      },
      diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to parse skill file";
    diagnostics.push({ type: "warning", message, path: filePath });
    return { skill: null, diagnostics };
  }
}

export function formatSkillsForPrompt(skills: SkillType[]): string {
  const visibleSkills = skills.filter((s) => !s.disableModelInvocation);
  return formatSkillContractForPrompt(visibleSkills);
}

export interface LoadSkillsOptions {
  cwd: string;
  agentDir: string;
  skillPaths: string[];
  includeDefaults: boolean;
}

function normalizePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") {
    return homedir();
  }
  if (trimmed.startsWith("~/")) {
    return join(homedir(), trimmed.slice(2));
  }
  if (trimmed.startsWith("~")) {
    return join(homedir(), trimmed.slice(1));
  }
  return trimmed;
}

function resolveSkillPath(p: string, cwd: string): string {
  const normalized = normalizePath(p);
  return isAbsolute(normalized) ? normalized : resolve(cwd, normalized);
}

export function loadSkills(options: LoadSkillsOptions): LoadSkillsResult {
  const { cwd, skillPaths, includeDefaults } = options;

  const skillMap = new Map<string, SkillType>();
  const realPathSet = new Set<string>();
  const allDiagnostics: Array<{ type: string; message: string; path: string }> = [];
  const collisionDiagnostics: Array<{ type: string; message: string; path: string }> = [];

  function addSkills(result: LoadSkillsResult) {
    allDiagnostics.push(...result.diagnostics);
    for (const skill of result.skills) {
      const realPath = resolve(skill.filePath);

      if (realPathSet.has(realPath)) {
        continue;
      }

      const existing = skillMap.get(skill.name);
      if (existing) {
        collisionDiagnostics.push({
          type: "collision",
          message: `name "${skill.name}" collision`,
          path: skill.filePath,
        });
      } else {
        skillMap.set(skill.name, skill);
        realPathSet.add(realPath);
      }
    }
  }

  if (includeDefaults) {
    addSkills(loadSkillsFromDirInternal(join(cwd, ".cross-wms", "skills"), "workspace", true));
  }

  for (const rawPath of skillPaths) {
    const resolvedPath = resolveSkillPath(rawPath, cwd);
    if (!existsSync(resolvedPath)) {
      allDiagnostics.push({
        type: "warning",
        message: "skill path does not exist",
        path: resolvedPath,
      });
      continue;
    }

    try {
      const stats = statSync(resolvedPath);
      if (stats.isDirectory()) {
        addSkills(loadSkillsFromDirInternal(resolvedPath, "workspace", true));
      } else if (stats.isFile() && resolvedPath.endsWith(".md")) {
        const result = loadSkillFromFile(resolvedPath, "workspace");
        if (result.skill) {
          addSkills({ skills: [result.skill], diagnostics: result.diagnostics });
        } else {
          allDiagnostics.push(...result.diagnostics);
        }
      } else {
        allDiagnostics.push({
          type: "warning",
          message: "skill path is not a markdown file",
          path: resolvedPath,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to read skill path";
      allDiagnostics.push({ type: "warning", message, path: resolvedPath });
    }
  }

  return {
    skills: Array.from(skillMap.values()),
    diagnostics: [...allDiagnostics, ...collisionDiagnostics],
  };
}
