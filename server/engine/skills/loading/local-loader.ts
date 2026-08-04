// Local skill loader reads skill definitions from local filesystem roots.
import fs from "node:fs";
import fsPromise from "node:fs/promises";
import path from "node:path";
import { openRootFileSync } from "../../infra/boundary-file-read.js";
import { logger } from "../../../logger.js";
import type {
  ParsedSkillFrontmatter,
  SkillEntry,
  SkillSource,
} from "../types.js";
import {
  parseFrontmatter,
  resolveSkillInvocationPolicy,
  resolveSkillMetadata,
} from "./frontmatter.js";
import { createSyntheticSourceInfo, type Skill } from "./skill-contract.js";
import { computeSkillPromptVersion } from "./skill-version.js";

type LoadedLocalSkill = {
  skill: Skill;
  frontmatter: ParsedSkillFrontmatter;
};

// Read SKILL.md through the root boundary helper so symlinks cannot escape the skill root.
function readSkillFileSync(params: {
  rootRealPath: string;
  filePath: string;
  maxBytes?: number;
}): string | null {
  const opened = openRootFileSync({
    absolutePath: params.filePath,
    rootPath: params.rootRealPath,
    rootRealPath: params.rootRealPath,
    boundaryLabel: "skill root",
    maxBytes: params.maxBytes,
  });
  if (!opened.ok) {
    return null;
  }
  try {
    return fs.readFileSync(opened.fd, "utf8");
  } finally {
    fs.closeSync(opened.fd);
  }
}

function loadSingleSkillDirectory(params: {
  skillDir: string;
  source: string;
  rootRealPath: string;
  maxBytes?: number;
}): LoadedLocalSkill | null {
  const skillFilePath = path.join(params.skillDir, "SKILL.md");
  const raw = readSkillFileSync({
    rootRealPath: params.rootRealPath,
    filePath: skillFilePath,
    maxBytes: params.maxBytes,
  });
  if (!raw) {
    return null;
  }

  let frontmatter: ParsedSkillFrontmatter;
  try {
    frontmatter = parseFrontmatter(raw);
  } catch {
    return null;
  }

  const fallbackName = path.basename(params.skillDir).trim();
  const name = frontmatter.name?.trim() || fallbackName;
  const description = frontmatter.description?.trim();
  if (!name || !description) {
    return null;
  }
  const invocation = resolveSkillInvocationPolicy(frontmatter);
  const filePath = path.resolve(skillFilePath);
  const baseDir = path.resolve(params.skillDir);

  return {
    skill: {
      name,
      description,
      filePath,
      baseDir,
      promptVersion: computeSkillPromptVersion(raw),
      source: params.source,
      sourceInfo: createSyntheticSourceInfo(filePath, {
        source: params.source,
        baseDir,
        scope: "project",
        origin: "top-level",
      }),
      disableModelInvocation: invocation.disableModelInvocation,
    },
    frontmatter,
  };
}

function listCandidateSkillDirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules",
      )
      .map((entry) => path.join(dir, entry.name))
      .toSorted((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

/** Loads skills from a local directory while turning read/parse failures into diagnostics. */
export function loadSkillsFromDirSafe(params: { dir: string; source: string; maxBytes?: number }): {
  skills: Skill[];
  frontmatterByFilePath: ReadonlyMap<string, ParsedSkillFrontmatter>;
} {
  const rootDir = path.resolve(params.dir);
  let rootRealPath: string;
  try {
    rootRealPath = fs.realpathSync(rootDir);
  } catch {
    return { skills: [], frontmatterByFilePath: new Map() };
  }

  const rootSkill = loadSingleSkillDirectory({
    skillDir: rootDir,
    source: params.source,
    rootRealPath,
    maxBytes: params.maxBytes,
  });
  if (rootSkill) {
    return {
      skills: [rootSkill.skill],
      frontmatterByFilePath: new Map([[rootSkill.skill.filePath, rootSkill.frontmatter]]),
    };
  }

  const loadedSkills = listCandidateSkillDirs(rootDir)
    .map((skillDir) =>
      loadSingleSkillDirectory({
        skillDir,
        source: params.source,
        rootRealPath,
        maxBytes: params.maxBytes,
      }),
    )
    .filter((skill): skill is LoadedLocalSkill => skill !== null);
  const frontmatterByFilePath = new Map<string, ParsedSkillFrontmatter>();
  for (const loaded of loadedSkills) {
    frontmatterByFilePath.set(loaded.skill.filePath, loaded.frontmatter);
  }

  return {
    skills: loadedSkills.map((loaded) => loaded.skill),
    frontmatterByFilePath,
  };
}

export function readSkillFrontmatterSafe(params: {
  rootDir: string;
  filePath: string;
  maxBytes?: number;
}): ParsedSkillFrontmatter | null {
  let rootRealPath: string;
  try {
    rootRealPath = fs.realpathSync(path.resolve(params.rootDir));
  } catch {
    return null;
  }
  const raw = readSkillFileSync({
    rootRealPath,
    filePath: path.resolve(params.filePath),
    maxBytes: params.maxBytes,
  });
  if (!raw) {
    return null;
  }
  try {
    return parseFrontmatter(raw);
  } catch {
    return null;
  }
}

// ============================================================================
// 兼容：保留 server 旧异步加载函数，供 bundled-context.ts / skill-loader.ts 使用。
// 待后续统一迁移到同步安全版本后可移除。
// ============================================================================

function extractDescription(content: string): string {
  const frontmatterEnd = content.indexOf("\n---", 3);
  const bodyStart = frontmatterEnd !== -1 ? frontmatterEnd + 4 : 0;
  const body = content.slice(bodyStart).trim();

  const firstParagraph = body.split("\n\n")[0]?.trim() || "";
  const cleanDescription = firstParagraph.replace(/^#\s+.+\n+/, "").trim();

  return cleanDescription.slice(0, 200);
}

function generatePromptVersion(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `v1-${Math.abs(hash).toString(36)}`;
}

export async function loadSkillFromDirectory(
  dirPath: string,
  source: SkillSource = "unknown",
): Promise<SkillEntry | null> {
  try {
    const skillFilePath = path.join(dirPath, "SKILL.md");
    const stat = await fsPromise.stat(skillFilePath);
    if (!stat.isFile()) {
      return null;
    }

    const content = await fsPromise.readFile(skillFilePath, "utf-8");
    const frontmatter = parseFrontmatter(content);
    const description = extractDescription(content);
    const name = path.basename(dirPath);
    const promptVersion = generatePromptVersion(content);

    const skill: Skill = {
      name,
      description,
      filePath: skillFilePath,
      baseDir: dirPath,
      promptVersion,
      source,
      sourceInfo: createSyntheticSourceInfo(skillFilePath, {
        source,
        baseDir: dirPath,
        scope: "project",
        origin: "top-level",
      }),
      disableModelInvocation: false,
    };

    const invocation = resolveSkillInvocationPolicy(frontmatter);
    const metadata = resolveSkillMetadata(frontmatter);

    skill.disableModelInvocation = invocation.disableModelInvocation;

    return {
      skill,
      frontmatter,
      metadata,
      invocation,
    };
  } catch (err) {
    logger.debug("[Skills] Failed to load skill from directory:", dirPath, err);
    return null;
  }
}

export async function loadSkillsFromDirectory(
  parentDir: string,
  source: SkillSource = "unknown",
): Promise<SkillEntry[]> {
  try {
    const entries = await fsPromise.readdir(parentDir, { withFileTypes: true });
    const skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const skills: SkillEntry[] = [];
    for (const dirName of skillDirs) {
      const dirPath = path.join(parentDir, dirName);
      const skill = await loadSkillFromDirectory(dirPath, source);
      if (skill) {
        skills.push(skill);
      }
    }
    return skills;
  } catch (err) {
    logger.debug("[Skills] Failed to load skills from directory:", parentDir, err);
    return [];
  }
}

export async function skillDirectoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fsPromise.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
