/**
 * 运行时路径解析 - 选择稳定的 Node 运行时路径。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const VERSION_MANAGER_MARKERS = [
  "/.nvm/",
  "/.fnm/",
  "/.local/share/fnm/",
  "/library/application support/fnm/",
  "/.volta/",
  "/.asdf/",
  "/.local/share/mise/",
  "/.n/",
  "/.nodenv/",
  "/.nodebrew/",
  "/nvs/",
];

function getPathModule(platform: NodeJS.Platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function normalizeForCompare(input: string, platform: NodeJS.Platform): string {
  const pathModule = getPathModule(platform);
  const normalized = pathModule.normalize(input).replaceAll("\\", "/");
  if (platform === "win32") {
    return normalized.toLowerCase();
  }
  return normalized;
}

function buildSystemNodeCandidates(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): string[] {
  void env;
  if (platform === "darwin") {
    return [
      "/opt/homebrew/bin/node",
      "/opt/homebrew/opt/node/bin/node",
      "/opt/homebrew/opt/node@22/bin/node",
      "/opt/homebrew/opt/node@20/bin/node",
      "/usr/local/bin/node",
      "/usr/local/opt/node/bin/node",
      "/usr/local/opt/node@22/bin/node",
      "/usr/local/opt/node@20/bin/node",
      "/usr/bin/node",
    ];
  }
  if (platform === "linux") {
    return ["/usr/local/bin/node", "/usr/bin/node"];
  }
  if (platform === "win32") {
    const pathModule = getPathModule(platform);
    const programFiles = env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    return [
      pathModule.join(programFiles, "nodejs", "node.exe"),
      pathModule.join(programFilesX86, "nodejs", "node.exe"),
    ];
  }
  return [];
}

const execFileAsync = promisify(execFile);

async function resolveNodeVersion(nodePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(nodePath, ["-p", "process.versions.node"], {
      encoding: "utf8",
    });
    const value = stdout.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

export function isVersionManagedNodePath(
  nodePath: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const normalized = normalizeForCompare(nodePath, platform).toLowerCase();
  return VERSION_MANAGER_MARKERS.some((marker) => normalized.includes(marker));
}

export function isSystemNodePath(
  nodePath: string,
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const normalized = normalizeForCompare(nodePath, platform);
  return buildSystemNodeCandidates(env, platform).some((candidate) => {
    const normalizedCandidate = normalizeForCompare(candidate, platform);
    return normalized === normalizedCandidate;
  });
}

export async function resolveSystemNodePath(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const candidates = buildSystemNodeCandidates(env, platform);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // 继续查找
    }
  }
  return null;
}

export async function resolvePreferredNodePath(params: {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  execPath?: string;
}): Promise<string | undefined> {
  const platform = params.platform ?? process.platform;
  const currentExecPath = params.execPath ?? process.execPath;

  if (currentExecPath) {
    const version = await resolveNodeVersion(currentExecPath);
    if (version) {
      if (!isVersionManagedNodePath(currentExecPath, platform)) {
        return currentExecPath;
      }
      const systemNode = await resolveSystemNodePath(params.env, platform);
      if (systemNode) {
        return systemNode;
      }
      return currentExecPath;
    }
  }

  const systemNode = await resolveSystemNodePath(params.env, platform);
  return systemNode ?? undefined;
}
