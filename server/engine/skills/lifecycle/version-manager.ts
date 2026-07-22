import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "../../../logger.js";

export interface SkillVersion {
  version: string;
  installedAt: number;
  path: string;
  sha256: string;
  signature?: string;
}

export interface VersionLock {
  skillName: string;
  lockedVersion: string;
  reason?: string;
  createdAt: number;
}

export interface VersionRange {
  min?: string;
  max?: string;
  exact?: string;
}

export interface VersionUpgradeResult {
  skillName: string;
  fromVersion: string;
  toVersion: string;
  success: boolean;
  error?: string;
}

export interface InstallVersionOptions {
  force?: boolean;
  checksum?: string;
  signature?: string;
  sourceArchive?: string;
}

interface ParsedSemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

const LOCK_FILE_NAME = ".version-lock.json";
const CURRENT_LINK_NAME = "current";

function getSkillVersionsDir(baseDir: string, skillName: string): string {
  return path.join(baseDir, "skills", skillName, "versions");
}

function getVersionDir(baseDir: string, skillName: string, version: string): string {
  return path.join(getSkillVersionsDir(baseDir, skillName), version);
}

function getCurrentLinkPath(baseDir: string, skillName: string): string {
  return path.join(baseDir, "skills", skillName, CURRENT_LINK_NAME);
}

function getLockFilePath(baseDir: string, skillName: string): string {
  return path.join(baseDir, "skills", skillName, LOCK_FILE_NAME);
}

function getVersionMetadataPath(baseDir: string, skillName: string, version: string): string {
  return path.join(getVersionDir(baseDir, skillName, version), ".version-meta.json");
}

export function parseVersion(version: string): ParsedSemVer | null {
  if (!version || typeof version !== "string") return null;

  let trimmed = version.trim();
  if (trimmed.startsWith("v") || trimmed.startsWith("V")) {
    trimmed = trimmed.slice(1);
  }

  let build: string | undefined;
  const plusIdx = trimmed.indexOf("+");
  if (plusIdx !== -1) {
    build = trimmed.slice(plusIdx + 1);
    trimmed = trimmed.slice(0, plusIdx);
  }

  let prerelease: string | undefined;
  const dashIdx = trimmed.indexOf("-");
  if (dashIdx !== -1) {
    prerelease = trimmed.slice(dashIdx + 1);
    trimmed = trimmed.slice(0, dashIdx);
  }

  const parts = trimmed.split(".");
  if (parts.length !== 3) return null;

  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const patch = parseInt(parts[2], 10);

  if (isNaN(major) || isNaN(minor) || isNaN(patch)) return null;
  if (major < 0 || minor < 0 || patch < 0) return null;

  return { major, minor, patch, prerelease, build };
}

export function compareVersions(v1: string, v2: string): number {
  const parsed1 = parseVersion(v1);
  const parsed2 = parseVersion(v2);

  if (!parsed1 || !parsed2) {
    return v1.localeCompare(v2);
  }

  if (parsed1.major !== parsed2.major) return parsed1.major - parsed2.major;
  if (parsed1.minor !== parsed2.minor) return parsed1.minor - parsed2.minor;
  if (parsed1.patch !== parsed2.patch) return parsed1.patch - parsed2.patch;

  if (!parsed1.prerelease && parsed2.prerelease) return 1;
  if (parsed1.prerelease && !parsed2.prerelease) return -1;
  if (parsed1.prerelease && parsed2.prerelease) {
    return parsed1.prerelease.localeCompare(parsed2.prerelease);
  }

  return 0;
}

export function satisfiesVersion(version: string, range: VersionRange): boolean {
  if (range.exact) {
    return version === range.exact || compareVersions(version, range.exact) === 0;
  }

  if (range.min && compareVersions(version, range.min) < 0) {
    return false;
  }

  if (range.max && compareVersions(version, range.max) > 0) {
    return false;
  }

  return true;
}

async function computeDirectorySha256(dirPath: string): Promise<string> {
  const hash = crypto.createHash("sha256");

  const entries = await fs.readdir(dirPath, { withFileTypes: true, recursive: true });
  const fileEntries = entries.filter((e) => e.isFile());

  fileEntries.sort((a, b) => {
    const pathA = a.fullPath || path.join(dirPath, a.name);
    const pathB = b.fullPath || path.join(dirPath, b.name);
    return pathA.localeCompare(pathB);
  });

  for (const entry of fileEntries) {
    const filePath = entry.fullPath || path.join(dirPath, entry.name);
    const content = await fs.readFile(filePath);
    hash.update(filePath);
    hash.update(content);
  }

  return hash.digest("hex");
}

async function writeVersionMetadata(
  baseDir: string,
  skillName: string,
  version: string,
  metadata: Omit<SkillVersion, "path">,
): Promise<void> {
  const metaPath = getVersionMetadataPath(baseDir, skillName, version);
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
}

async function readVersionMetadata(
  baseDir: string,
  skillName: string,
  version: string,
): Promise<SkillVersion | null> {
  const metaPath = getVersionMetadataPath(baseDir, skillName, version);
  try {
    const content = await fs.readFile(metaPath, "utf-8");
    const meta = JSON.parse(content) as Omit<SkillVersion, "path">;
    return { ...meta, path: getVersionDir(baseDir, skillName, version) };
  } catch {
    return null;
  }
}

export async function installVersion(
  baseDir: string,
  skillName: string,
  version: string,
  options: InstallVersionOptions = {},
): Promise<SkillVersion | null> {
  const { force = false, checksum, signature } = options;

  if (!parseVersion(version)) {
    logger.error("[VersionManager] Invalid version format:", version);
    return null;
  }

  const versionDir = getVersionDir(baseDir, skillName, version);
  const versionsDir = getSkillVersionsDir(baseDir, skillName);

  try {
    await fs.access(versionDir);
    if (!force) {
      logger.warn("[VersionManager] Version already installed:", `${skillName}@${version}`);
      return await readVersionMetadata(baseDir, skillName, version);
    }
    await fs.rm(versionDir, { recursive: true, force: true });
  } catch {
    // Version directory doesn't exist, proceed
  }

  await fs.mkdir(versionDir, { recursive: true });

  if (options.sourceArchive) {
    try {
      const { extractArchive } = await import("./install-extract.js");
      await extractArchive(options.sourceArchive, versionDir);
    } catch (err) {
      logger.error("[VersionManager] Failed to extract archive:", err);
      await fs.rm(versionDir, { recursive: true, force: true });
      return null;
    }
  }

  let sha256: string;
  try {
    sha256 = await computeDirectorySha256(versionDir);
  } catch (err) {
    logger.error("[VersionManager] Failed to compute checksum:", err);
    await fs.rm(versionDir, { recursive: true, force: true });
    return null;
  }

  if (checksum && sha256 !== checksum) {
    logger.error("[VersionManager] Checksum mismatch:", `${skillName}@${version}`);
    await fs.rm(versionDir, { recursive: true, force: true });
    return null;
  }

  const skillVersion: SkillVersion = {
    version,
    installedAt: Date.now(),
    path: versionDir,
    sha256,
    signature,
  };

  await writeVersionMetadata(baseDir, skillName, version, skillVersion);
  logger.info("[VersionManager] Installed version:", `${skillName}@${version}`);

  return skillVersion;
}

export async function getVersions(baseDir: string, skillName: string): Promise<SkillVersion[]> {
  const versionsDir = getSkillVersionsDir(baseDir, skillName);

  try {
    await fs.access(versionsDir);
  } catch {
    return [];
  }

  const entries = await fs.readdir(versionsDir, { withFileTypes: true });
  const versionDirs = entries.filter((e) => e.isDirectory());

  const versions: SkillVersion[] = [];
  for (const entry of versionDirs) {
    const version = entry.name;
    const meta = await readVersionMetadata(baseDir, skillName, version);
    if (meta) {
      versions.push(meta);
    }
  }

  return versions.sort((a, b) => compareVersions(a.version, b.version));
}

export async function getCurrentVersion(baseDir: string, skillName: string): Promise<SkillVersion | null> {
  const currentLink = getCurrentLinkPath(baseDir, skillName);

  try {
    const resolvedPath = await fs.realpath(currentLink);
    const version = path.basename(resolvedPath);
    return await readVersionMetadata(baseDir, skillName, version);
  } catch {
    const versions = await getVersions(baseDir, skillName);
    if (versions.length === 0) return null;
    return versions[versions.length - 1];
  }
}

export async function switchVersion(
  baseDir: string,
  skillName: string,
  version: string,
): Promise<boolean> {
  const lock = await getVersionLock(baseDir, skillName);
  if (lock && lock.lockedVersion !== version) {
    logger.warn("[VersionManager] Cannot switch version, locked to:", lock.lockedVersion);
    return false;
  }

  if (!(await versionExists(baseDir, skillName, version))) {
    logger.error("[VersionManager] Version not found:", `${skillName}@${version}`);
    return false;
  }

  const currentLink = getCurrentLinkPath(baseDir, skillName);
  const targetDir = getVersionDir(baseDir, skillName, version);
  const skillDir = path.join(baseDir, "skills", skillName);

  try {
    await fs.mkdir(skillDir, { recursive: true });

    try {
      await fs.unlink(currentLink);
    } catch {
      // Link doesn't exist, proceed
    }

    await fs.symlink(targetDir, currentLink);
    logger.info("[VersionManager] Switched version:", `${skillName}@${version}`);
    return true;
  } catch (err) {
    logger.error("[VersionManager] Failed to switch version:", err);
    return false;
  }
}

export async function rollbackVersion(
  baseDir: string,
  skillName: string,
  steps: number = 1,
): Promise<SkillVersion | null> {
  const versions = await getVersions(baseDir, skillName);
  if (versions.length === 0) return null;

  const current = await getCurrentVersion(baseDir, skillName);
  if (!current) return null;

  const currentIndex = versions.findIndex((v) => v.version === current.version);
  if (currentIndex === -1) return null;

  const targetIndex = Math.max(0, currentIndex - steps);
  const targetVersion = versions[targetIndex];

  if (await switchVersion(baseDir, skillName, targetVersion.version)) {
    logger.info("[VersionManager] Rolled back:", `${skillName} from ${current.version} to ${targetVersion.version}`);
    return targetVersion;
  }

  return null;
}

export async function lockVersion(
  baseDir: string,
  skillName: string,
  version: string,
  reason?: string,
): Promise<boolean> {
  if (!(await versionExists(baseDir, skillName, version))) {
    logger.error("[VersionManager] Version not found for locking:", `${skillName}@${version}`);
    return false;
  }

  const lockFilePath = getLockFilePath(baseDir, skillName);
  const lock: VersionLock = {
    skillName,
    lockedVersion: version,
    reason,
    createdAt: Date.now(),
  };

  try {
    await fs.mkdir(path.dirname(lockFilePath), { recursive: true });
    await fs.writeFile(lockFilePath, JSON.stringify(lock, null, 2), "utf-8");
    logger.info("[VersionManager] Locked version:", `${skillName}@${version}`);
    return true;
  } catch (err) {
    logger.error("[VersionManager] Failed to lock version:", err);
    return false;
  }
}

export async function unlockVersion(baseDir: string, skillName: string): Promise<boolean> {
  const lockFilePath = getLockFilePath(baseDir, skillName);

  try {
    await fs.unlink(lockFilePath);
    logger.info("[VersionManager] Unlocked version:", skillName);
    return true;
  } catch {
    return false;
  }
}

export async function getVersionLock(baseDir: string, skillName: string): Promise<VersionLock | null> {
  const lockFilePath = getLockFilePath(baseDir, skillName);

  try {
    const content = await fs.readFile(lockFilePath, "utf-8");
    return JSON.parse(content) as VersionLock;
  } catch {
    return null;
  }
}

export async function upgradeSkill(
  baseDir: string,
  skillName: string,
  targetVersion?: string,
): Promise<VersionUpgradeResult> {
  const current = await getCurrentVersion(baseDir, skillName);
  const currentVersion = current?.version || "none";

  const lock = await getVersionLock(baseDir, skillName);
  if (lock && (!targetVersion || targetVersion !== lock.lockedVersion)) {
    return {
      skillName,
      fromVersion: currentVersion,
      toVersion: lock.lockedVersion,
      success: false,
      error: `Skill is locked to version ${lock.lockedVersion}`,
    };
  }

  const versions = await getVersions(baseDir, skillName);
  if (versions.length === 0) {
    return {
      skillName,
      fromVersion: currentVersion,
      toVersion: targetVersion || "unknown",
      success: false,
      error: "No versions available",
    };
  }

  let target: SkillVersion;

  if (targetVersion) {
    target = versions.find((v) => v.version === targetVersion) || versions[versions.length - 1];
  } else {
    const stableVersions = versions.filter((v) => !parseVersion(v.version)?.prerelease);
    target = stableVersions.length > 0 ? stableVersions[stableVersions.length - 1] : versions[versions.length - 1];
  }

  if (current && compareVersions(current.version, target.version) >= 0) {
    return {
      skillName,
      fromVersion: currentVersion,
      toVersion: target.version,
      success: false,
      error: "Already at latest version",
    };
  }

  if (!(await switchVersion(baseDir, skillName, target.version))) {
    return {
      skillName,
      fromVersion: currentVersion,
      toVersion: target.version,
      success: false,
      error: "Failed to switch version",
    };
  }

  logger.info("[VersionManager] Upgraded skill:", `${skillName} from ${currentVersion} to ${target.version}`);

  return {
    skillName,
    fromVersion: currentVersion,
    toVersion: target.version,
    success: true,
  };
}

export async function versionExists(baseDir: string, skillName: string, version: string): Promise<boolean> {
  const versionDir = getVersionDir(baseDir, skillName, version);

  try {
    await fs.access(versionDir);
    return true;
  } catch {
    return false;
  }
}

export async function uninstallVersion(baseDir: string, skillName: string, version: string): Promise<boolean> {
  const lock = await getVersionLock(baseDir, skillName);
  if (lock && lock.lockedVersion === version) {
    logger.warn("[VersionManager] Cannot uninstall locked version:", `${skillName}@${version}`);
    return false;
  }

  const current = await getCurrentVersion(baseDir, skillName);
  if (current && current.version === version) {
    logger.warn("[VersionManager] Cannot uninstall current version:", `${skillName}@${version}`);
    return false;
  }

  const versionDir = getVersionDir(baseDir, skillName, version);

  try {
    await fs.rm(versionDir, { recursive: true, force: true });
    logger.info("[VersionManager] Uninstalled version:", `${skillName}@${version}`);
    return true;
  } catch {
    return false;
  }
}
