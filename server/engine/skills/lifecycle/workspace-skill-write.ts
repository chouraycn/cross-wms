import fs from "node:fs/promises";
import path from "node:path";

const ALLOWED_SUPPORT_FILE_ROOTS = new Set(
  "assets examples references scripts templates".split(" "),
);
export const MAX_WORKSPACE_SKILL_SUPPORT_FILE_BYTES = 256 * 1024;

type WorkspaceSkillSymlinkWritePolicy = {
  allowWrites: boolean;
  allowedTargetRealPaths: readonly string[];
};

type WorkspaceSkillSupportFileWrite = { path: string; content: string };

type PreviousSupportFile = { path: string; existed: boolean; previousContent?: string };

export function normalizeWorkspaceSkillSupportPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Support file path is required.");
  }
  if (trimmed.includes("\\")) {
    throw new Error("Support file paths must use forward slashes.");
  }
  if (path.posix.isAbsolute(trimmed)) {
    throw new Error("Support file paths must be relative.");
  }
  if (
    trimmed
      .split("/")
      .some((part) => !part || part === "." || part === ".." || part.startsWith("."))
  ) {
    throw new Error("Support file paths must use plain relative path segments.");
  }
  if (!ALLOWED_SUPPORT_FILE_ROOTS.has(trimmed.split("/")[0] ?? "")) {
    throw new Error(
      `Support file paths must be under one of: ${[...ALLOWED_SUPPORT_FILE_ROOTS].join(", ")}.`,
    );
  }
  if (trimmed === "PROPOSAL.md" || trimmed === "SKILL.md") {
    throw new Error("Support files cannot replace the proposal or skill markdown file.");
  }
  return trimmed;
}

export function assertWorkspaceSkillSupportPathSetIsFileOnly(paths: readonly string[]): void {
  const sorted = [...paths].sort((a, b) => a.localeCompare(b));
  for (const filePath of sorted) {
    if (!filePath.includes("/")) {
      throw new Error("Support file paths must include a file below an allowed support directory.");
    }
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous && current?.startsWith(`${previous}/`)) {
      throw new Error(`Support file paths cannot overlap: ${previous} and ${current}`);
    }
  }
}

export async function readWorkspaceSkillFile(filePath: string): Promise<string | null> {
  try {
    await fs.access(filePath);
    const buffer = await fs.readFile(filePath);
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

export async function readWorkspaceSupportFile(params: {
  skillDir: string;
  relativePath: string;
}): Promise<string | null> {
  const relativePath = normalizeWorkspaceSkillSupportPath(params.relativePath);
  const filePath = path.join(params.skillDir, ...relativePath.split("/"));
  try {
    const buffer = await fs.readFile(filePath);
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

export async function writeWorkspaceSkill(params: {
  workspaceDir: string;
  skillDir: string;
  skillFile: string;
  content: string;
  supportFiles?: readonly WorkspaceSkillSupportFileWrite[];
  mode: "create" | "update";
  symlinkPolicy: WorkspaceSkillSymlinkWritePolicy;
}): Promise<void> {
  assertInsideWorkspace(params.workspaceDir, params.skillDir, "skill directory");
  const supportFiles = normalizeSupportFiles(params.supportFiles ?? []);
  const previousSupportFiles = await prepareWorkspaceSkillWrite({
    mode: params.mode,
    workspaceDir: params.workspaceDir,
    skillDir: params.skillDir,
    skillFile: params.skillFile,
    supportFiles,
    symlinkPolicy: params.symlinkPolicy,
  });
  const writtenSupportPaths: string[] = [];
  try {
    for (const file of supportFiles) {
      await fs.mkdir(path.dirname(path.join(params.skillDir, ...file.path.split("/"))), { recursive: true });
      await fs.writeFile(
        path.join(params.skillDir, ...file.path.split("/")),
        file.content,
        "utf-8",
      );
      writtenSupportPaths.push(file.path);
    }
    await fs.mkdir(path.dirname(params.skillFile), { recursive: true });
    await fs.writeFile(params.skillFile, params.content, "utf-8");
  } catch (error) {
    await restoreSupportFilesAfterFailedWrite({
      mode: params.mode,
      workspaceDir: params.workspaceDir,
      skillDir: params.skillDir,
      writtenSupportPaths,
      previousSupportFiles,
      symlinkPolicy: params.symlinkPolicy,
    });
    throw error;
  }
}

function normalizeSupportFiles(
  supportFiles: readonly WorkspaceSkillSupportFileWrite[],
): WorkspaceSkillSupportFileWrite[] {
  const normalized = supportFiles.map((file) => ({
    ...file,
    path: normalizeWorkspaceSkillSupportPath(file.path),
  }));
  assertWorkspaceSkillSupportPathSetIsFileOnly(normalized.map((file) => file.path));
  return normalized;
}

async function prepareWorkspaceSkillWrite(params: {
  mode: "create" | "update";
  workspaceDir: string;
  skillDir: string;
  skillFile: string;
  supportFiles: readonly WorkspaceSkillSupportFileWrite[];
  symlinkPolicy: WorkspaceSkillSymlinkWritePolicy;
}): Promise<PreviousSupportFile[]> {
  assertInsideWorkspace(params.workspaceDir, params.skillFile, "skill file");
  const previousContent = await readWorkspaceSkillFile(params.skillFile);
  if (params.mode === "create" && previousContent !== null) {
    throw new Error(`Target skill already exists: ${params.skillFile}`);
  }
  if (params.mode === "update" && previousContent === null) {
    throw new Error(`Target skill is missing: ${params.skillFile}`);
  }

  const previousSupportFiles: PreviousSupportFile[] = [];
  for (const file of params.supportFiles) {
    const filePath = path.join(params.skillDir, ...file.path.split("/"));
    assertInsideWorkspace(params.workspaceDir, filePath, "support file");
    if (params.mode === "update") {
      const previousSupportContent = await readWorkspaceSupportFile({
        skillDir: params.skillDir,
        relativePath: file.path,
      });
      previousSupportFiles.push(
        previousSupportContent === null
          ? { path: file.path, existed: false }
          : { path: file.path, existed: true, previousContent: previousSupportContent },
      );
    }
  }
  return previousSupportFiles;
}

async function restoreSupportFilesAfterFailedWrite(params: {
  mode: "create" | "update";
  workspaceDir: string;
  skillDir: string;
  writtenSupportPaths: readonly string[];
  previousSupportFiles: readonly PreviousSupportFile[];
  symlinkPolicy: WorkspaceSkillSymlinkWritePolicy;
}): Promise<void> {
  const previousByPath = new Map(params.previousSupportFiles.map((file) => [file.path, file]));
  await Promise.allSettled(
    [...params.writtenSupportPaths].reverse().map(async (relativePath) => {
      const filePath = path.join(params.skillDir, ...relativePath.split("/"));
      const previous = previousByPath.get(relativePath);
      if (params.mode === "update" && previous?.existed) {
        await fs.writeFile(filePath, previous.previousContent ?? "", "utf-8");
      } else {
        await fs.unlink(filePath).catch((error: unknown) => {
          if ((error as { code?: string })?.code !== "ENOENT") {
            throw error;
          }
        });
      }
    }),
  );
}

export function assertInsideWorkspace(
  workspaceDir: string,
  targetPath: string,
  label: string,
): void {
  const resolvedWorkspaceDir = path.resolve(workspaceDir);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedWorkspaceDir, resolvedTarget);
  if (
    resolvedTarget !== resolvedWorkspaceDir &&
    (relative.startsWith("..") || path.isAbsolute(relative))
  ) {
    throw new Error(`${label} must stay inside the workspace.`);
  }
}
