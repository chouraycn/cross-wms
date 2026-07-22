import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { logSkillInstallation, logSkillSecurity, logSkillAction } from "../../logging/index.js";
import type { PackageManifest } from "./skill-packager.js";


const DOT_DIR = ".clawhub";
const SKILL_ORIGIN_RELATIVE_PATH = path.join(DOT_DIR, "origin.json");
const LOCKFILE_RELATIVE_PATH = path.join(DOT_DIR, "lock.json");

export type ClawHubSkillSearchResult = {
  slug: string;
  displayName: string;
  version: string;
  summary: string;
  ownerHandle: string;
};

export type ClawHubSkillDetail = {
  slug: string;
  displayName: string;
  version: string;
  summary: string;
  description: string;
  ownerHandle: string;
  latestVersion: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  downloadCount: number;
  homepage?: string;
  repository?: string;
  license?: string;
};

export type ClawHubSkillVerificationResponse = {
  schema: string;
  ok: boolean;
  decision: "trusted" | "warn" | "rejected";
  reasons: string[];
  card?: unknown;
  artifact?: unknown;
  provenance?: unknown;
  security?: unknown;
  signature?: unknown;
};

export type ClawHubSkillOrigin = {
  version: 1;
  registry: string;
  slug: string;
  ownerHandle?: string;
  installedVersion: string;
  installedAt: number;
  sourceUrl?: string;
  sha256?: string;
};

export type ClawHubSkillLockEntry = {
  version: string;
  installedAt: number;
  sha256: string;
  signature?: string;
  registry?: string;
  ownerHandle?: string;
  sourceUrl?: string;
};

type ClawHubSkillsLockfile = {
  version: 1;
  skills: Record<string, ClawHubSkillLockEntry>;
};

type InstallClawHubSkillResult =
  | {
      ok: true;
      slug: string;
      version: string;
      targetDir: string;
      detail?: ClawHubSkillDetail;
      manifest?: PackageManifest;
    }
  | { ok: false; error: string };

type UpdateClawHubSkillResult =
  | {
      ok: true;
      slug: string;
      previousVersion: string | null;
      version: string;
      changed: boolean;
      targetDir: string;
    }
  | { ok: false; error: string };

const MOCK_SKILLS: ClawHubSkillDetail[] = [
  {
    slug: "weather",
    displayName: "Weather",
    version: "1.2.0",
    summary: "Get real-time weather forecasts and conditions",
    description: "A comprehensive weather skill that provides current conditions, hourly forecasts, and 7-day forecasts for any location worldwide.",
    ownerHandle: "openclaw",
    latestVersion: "1.2.0",
    tags: ["weather", "utility", "location"],
    createdAt: 1700000000000,
    updatedAt: 1715000000000,
    downloadCount: 15420,
    homepage: "https://clawhub.com/openclaw/weather",
    repository: "https://github.com/openclaw/weather-skill",
    license: "MIT",
  },
  {
    slug: "1password",
    displayName: "1Password",
    version: "2.0.1",
    summary: "Secure password management with 1Password CLI",
    description: "Integrate with 1Password to securely access passwords, secure notes, and other items in your vaults directly through the CLI.",
    ownerHandle: "agilebits",
    latestVersion: "2.0.1",
    tags: ["security", "passwords", "vault"],
    createdAt: 1702000000000,
    updatedAt: 1716000000000,
    downloadCount: 8930,
    homepage: "https://clawhub.com/agilebits/1password",
    repository: "https://github.com/agilebits/op-skill",
    license: "Apache-2.0",
  },
  {
    slug: "obsidian",
    displayName: "Obsidian",
    version: "1.5.3",
    summary: "Interact with your Obsidian vault and notes",
    description: "Search, create, and modify notes in your Obsidian vault. Supports daily notes, backlinks, and tag management.",
    ownerHandle: "obsidian-community",
    latestVersion: "1.5.3",
    tags: ["notes", "productivity", "knowledge-base"],
    createdAt: 1701000000000,
    updatedAt: 1717000000000,
    downloadCount: 12100,
    homepage: "https://clawhub.com/obsidian-community/obsidian",
    repository: "https://github.com/obsidian-community/obsidian-skill",
    license: "MIT",
  },
  {
    slug: "diagram-maker",
    displayName: "Diagram Maker",
    version: "3.1.0",
    summary: "Create beautiful diagrams and flowcharts with code",
    description: "Generate Mermaid, PlantUML, and D2 diagrams from text descriptions. Supports flowcharts, sequence diagrams, class diagrams, and more.",
    ownerHandle: "diagram-labs",
    latestVersion: "3.1.0",
    tags: ["diagrams", "visualization", "documentation"],
    createdAt: 1699000000000,
    updatedAt: 1718000000000,
    downloadCount: 22450,
    homepage: "https://clawhub.com/diagram-labs/diagram-maker",
    repository: "https://github.com/diagram-labs/diagram-maker-skill",
    license: "MIT",
  },
  {
    slug: "notion",
    displayName: "Notion",
    version: "2.2.0",
    summary: "Manage your Notion workspace and databases",
    description: "Create, read, update, and delete Notion pages and database entries. Full support for page content, properties, and filters.",
    ownerHandle: "makenotion",
    latestVersion: "2.2.0",
    tags: ["notion", "productivity", "databases"],
    createdAt: 1703000000000,
    updatedAt: 1714000000000,
    downloadCount: 18760,
    homepage: "https://clawhub.com/makenotion/notion",
    repository: "https://github.com/makenotion/notion-skill",
    license: "MIT",
  },
  {
    slug: "github",
    displayName: "GitHub",
    version: "4.0.0",
    summary: "Full GitHub integration for issues, PRs, and repos",
    description: "Manage GitHub repositories, issues, pull requests, actions, and more directly from your workspace. Powered by the official GitHub CLI.",
    ownerHandle: "github",
    latestVersion: "4.0.0",
    tags: ["github", "devops", "version-control"],
    createdAt: 1698000000000,
    updatedAt: 1719000000000,
    downloadCount: 35200,
    homepage: "https://clawhub.com/github/github",
    repository: "https://github.com/github/gh-skill",
    license: "MIT",
  },
  {
    slug: "spotify-player",
    displayName: "Spotify Player",
    version: "1.3.2",
    summary: "Control Spotify playback and manage your library",
    description: "Play, pause, skip tracks, manage playlists, and search Spotify's catalog. Requires a Spotify Premium account.",
    ownerHandle: "spotify-community",
    latestVersion: "1.3.2",
    tags: ["music", "spotify", "media"],
    createdAt: 1704000000000,
    updatedAt: 1713000000000,
    downloadCount: 6540,
    homepage: "https://clawhub.com/spotify-community/spotify-player",
    repository: "https://github.com/spotify-community/spotify-player-skill",
    license: "MIT",
  },
  {
    slug: "himalaya",
    displayName: "Himalaya",
    version: "1.8.0",
    summary: "CLI email client for reading and sending emails",
    description: "A terminal-based email client that lets you read, compose, and manage emails across multiple IMAP accounts.",
    ownerHandle: "himalaya-cli",
    latestVersion: "1.8.0",
    tags: ["email", "cli", "productivity"],
    createdAt: 1705000000000,
    updatedAt: 1712000000000,
    downloadCount: 4320,
    homepage: "https://clawhub.com/himalaya-cli/himalaya",
    repository: "https://github.com/himalaya-cli/himalaya-skill",
    license: "MIT",
  },
  {
    slug: "nano-pdf",
    displayName: "Nano PDF",
    version: "2.4.1",
    summary: "Lightweight PDF manipulation and generation",
    description: "Create, merge, split, compress, and convert PDF files. Supports text extraction, watermarking, and page manipulation.",
    ownerHandle: "pdf-tools",
    latestVersion: "2.4.1",
    tags: ["pdf", "documents", "conversion"],
    createdAt: 1706000000000,
    updatedAt: 1711000000000,
    downloadCount: 9870,
    homepage: "https://clawhub.com/pdf-tools/nano-pdf",
    repository: "https://github.com/pdf-tools/nano-pdf-skill",
    license: "MIT",
  },
  {
    slug: "skill-creator",
    displayName: "Skill Creator",
    version: "1.0.5",
    summary: "Bootstrap and scaffold new ClawHub skills",
    description: "Create new skill projects with templates for basic skills, tool-based skills, and workflow skills. Includes validation and publishing helpers.",
    ownerHandle: "openclaw",
    latestVersion: "1.0.5",
    tags: ["development", "scaffolding", "meta"],
    createdAt: 1707000000000,
    updatedAt: 1710000000000,
    downloadCount: 7650,
    homepage: "https://clawhub.com/openclaw/skill-creator",
    repository: "https://github.com/openclaw/skill-creator",
    license: "MIT",
  },
];

function generateMockSha256(slug: string, version: string): string {
  return createHash("sha256")
    .update(`clawhub:${slug}@${version}`)
    .digest("hex");
}

function generateMockSignature(slug: string, version: string): string {
  return createHash("sha256")
    .update(`sig:${slug}@${version}:clawhub-key`)
    .digest("hex");
}

export function searchClawHubSkills(
  query?: string,
  limit = 20,
): ClawHubSkillSearchResult[] {
  const q = (query || "").trim().toLowerCase();
  let results = MOCK_SKILLS;

  if (q && q !== "*") {
    results = results.filter(
      (skill) =>
        skill.slug.toLowerCase().includes(q) ||
        skill.displayName.toLowerCase().includes(q) ||
        skill.summary.toLowerCase().includes(q) ||
        skill.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }

  return results
    .slice(0, limit)
    .map(({ slug, displayName, version, summary, ownerHandle }) => ({
      slug,
      displayName,
      version,
      summary,
      ownerHandle,
    }));
}

export function fetchClawHubSkillDetail(slug: string): ClawHubSkillDetail | null {
  const skill = MOCK_SKILLS.find((s) => s.slug === slug);
  return skill || null;
}

export function fetchClawHubSkillVerification(
  slug: string,
  version?: string,
): ClawHubSkillVerificationResponse {
  const skill = MOCK_SKILLS.find((s) => s.slug === slug);
  const resolvedVersion = version || skill?.latestVersion || "unknown";

  if (!skill) {
    return {
      schema: "clawhub-verification/v1",
      ok: false,
      decision: "rejected",
      reasons: [`Skill "${slug}" not found in registry`],
    };
  }

  const isTrusted = skill.ownerHandle === "openclaw" || skill.ownerHandle === "github";

  const decision = isTrusted ? "trusted" : "warn";
  logSkillSecurity(slug, decision, {
    version: resolvedVersion,
    ownerHandle: skill.ownerHandle,
    score: isTrusted ? "A+" : "B",
  });

  return {
    schema: "clawhub-verification/v1",
    ok: true,
    decision,
    reasons: isTrusted
      ? ["Verified publisher", "Signature valid", "No security issues detected"]
      : ["Community-contributed skill", "Signature valid", "Review recommended"],
    card: {
      slug,
      version: resolvedVersion,
      ownerHandle: skill.ownerHandle,
    },
    artifact: {
      sha256: generateMockSha256(slug, resolvedVersion),
      size: Math.floor(Math.random() * 500000) + 10000,
    },
    provenance: {
      source: "clawhub-registry",
      build: "verified",
    },
    security: {
      vulnerabilities: [],
      score: isTrusted ? "A+" : "B",
    },
    signature: {
      valid: true,
      key: `clawhub-key-${skill.ownerHandle}`,
      signedAt: skill.updatedAt,
    },
  };
}

async function readClawHubSkillsLockfile(
  workspaceDir: string,
): Promise<ClawHubSkillsLockfile> {
  const lockfilePath = path.join(workspaceDir, LOCKFILE_RELATIVE_PATH);
  try {
    const raw = await fs.readFile(lockfilePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ClawHubSkillsLockfile>;
    if (parsed?.version === 1 && parsed.skills && typeof parsed.skills === "object") {
      return {
        version: 1,
        skills: parsed.skills,
      };
    }
  } catch {
    // ignore
  }
  return { version: 1, skills: {} };
}

async function writeClawHubSkillsLockfile(
  workspaceDir: string,
  lockfile: ClawHubSkillsLockfile,
): Promise<void> {
  const lockfilePath = path.join(workspaceDir, LOCKFILE_RELATIVE_PATH);
  const dir = path.dirname(lockfilePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(lockfilePath, JSON.stringify(lockfile, null, 2) + "\n", "utf8");
}

export async function readTrackedClawHubSkillSlugs(
  workspaceDir: string,
): Promise<string[]> {
  const lock = await readClawHubSkillsLockfile(workspaceDir);
  return Object.keys(lock.skills).sort();
}

export async function writeClawHubOrigin(
  skillDir: string,
  origin: ClawHubSkillOrigin,
): Promise<void> {
  const originPath = path.join(skillDir, SKILL_ORIGIN_RELATIVE_PATH);
  const dir = path.dirname(originPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(originPath, JSON.stringify(origin, null, 2) + "\n", "utf8");
  logSkillAction({ skillName: origin.slug, action: "write_origin", success: true, metadata: { originPath } });
}

export async function readClawHubOrigin(
  skillDir: string,
): Promise<ClawHubSkillOrigin | null> {
  const originPath = path.join(skillDir, SKILL_ORIGIN_RELATIVE_PATH);
  try {
    const raw = await fs.readFile(originPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ClawHubSkillOrigin>;
    if (
      parsed?.version === 1 &&
      typeof parsed.registry === "string" &&
      typeof parsed.slug === "string" &&
      typeof parsed.installedVersion === "string" &&
      typeof parsed.installedAt === "number"
    ) {
      return {
        version: 1,
        registry: parsed.registry,
        slug: parsed.slug,
        ...(parsed.ownerHandle ? { ownerHandle: parsed.ownerHandle } : {}),
        installedVersion: parsed.installedVersion,
        installedAt: parsed.installedAt,
        ...(parsed.sourceUrl ? { sourceUrl: parsed.sourceUrl } : {}),
        ...(parsed.sha256 ? { sha256: parsed.sha256 } : {}),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveWorkspaceSkillInstallDir(
  workspaceDir: string,
  slug: string,
): string {
  return path.join(workspaceDir, "skills", slug);
}

function generateSkillMarkdown(skill: ClawHubSkillDetail): string {
  const tagsLine = skill.tags.length > 0 ? `tags: [${skill.tags.join(", ")}]` : "";
  return `---
name: ${skill.displayName}
description: ${skill.summary}
version: ${skill.latestVersion}
owner: ${skill.ownerHandle}
${tagsLine}
---

# ${skill.displayName}

${skill.description}

## Installation

- **Slug:** ${skill.slug}
- **Version:** ${skill.latestVersion}
- **Owner:** ${skill.ownerHandle}
${skill.license ? `- **License:** ${skill.license}` : ""}
${skill.homepage ? `- **Homepage:** ${skill.homepage}` : ""}
${skill.repository ? `- **Repository:** ${skill.repository}` : ""}
`;
}

export async function installSkillFromClawHub(
  workspaceDir: string,
  slug: string,
  version?: string,
  force = false,
): Promise<InstallClawHubSkillResult> {
  try {
    const detail = fetchClawHubSkillDetail(slug);
    if (!detail) {
      return {
        ok: false,
        error: `Skill "${slug}" not found on ClawHub.`,
      };
    }

    const resolvedVersion = version || detail.latestVersion;
    const targetDir = resolveWorkspaceSkillInstallDir(workspaceDir, slug);

    if (!force) {
      try {
        await fs.access(targetDir);
        return {
          ok: false,
          error: `Skill already exists at ${targetDir}. Use force=true to overwrite.`,
        };
      } catch {
        // Directory doesn't exist, proceed
      }
    }

    const startTime = Date.now();

    await fs.mkdir(targetDir, { recursive: true });

    const skillMdContent = generateSkillMarkdown(detail);
    await fs.writeFile(path.join(targetDir, "SKILL.md"), skillMdContent, "utf8");

    const installedAt = Date.now();
    const sha256 = generateMockSha256(slug, resolvedVersion);
    const signature = generateMockSignature(slug, resolvedVersion);

    const origin: ClawHubSkillOrigin = {
      version: 1,
      registry: "https://clawhub.com",
      slug,
      ownerHandle: detail.ownerHandle,
      installedVersion: resolvedVersion,
      installedAt,
      sourceUrl: detail.repository,
      sha256,
    };
    await writeClawHubOrigin(targetDir, origin);

    const lock = await readClawHubSkillsLockfile(workspaceDir);
    lock.skills[slug] = {
      version: resolvedVersion,
      installedAt,
      sha256,
      signature,
      registry: "https://clawhub.com",
      ownerHandle: detail.ownerHandle,
      sourceUrl: detail.repository,
    };
    await writeClawHubSkillsLockfile(workspaceDir, lock);

    const durationMs = Date.now() - startTime;
    logSkillInstallation(slug, resolvedVersion, "clawhub", true);
    logSkillAction({ skillName: slug, action: "install", success: true, durationMs, metadata: { targetDir } });

    return {
      ok: true,
      slug,
      version: resolvedVersion,
      targetDir,
      detail
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logSkillInstallation(slug, version ?? "unknown", "clawhub", false, errorMessage);
    logSkillAction({ skillName: slug, action: "install", success: false, error: errorMessage });
    return {
      ok: false,
      error: errorMessage,
    };
  }
}

export async function updateSkillsFromClawHub(
  workspaceDir: string,
  slug?: string,
): Promise<UpdateClawHubSkillResult[]> {
  const lock = await readClawHubSkillsLockfile(workspaceDir);
  const slugs = slug ? [slug] : Object.keys(lock.skills);

  const results: UpdateClawHubSkillResult[] = [];

  for (const currentSlug of slugs) {
    const lockEntry = lock.skills[currentSlug];
    if (!lockEntry && slug) {
      results.push({
        ok: false,
        error: `Skill "${currentSlug}" is not tracked as a ClawHub install.`,
      });
      continue;
    }

    const previousVersion = lockEntry?.version || null;
    const detail = fetchClawHubSkillDetail(currentSlug);

    if (!detail) {
      results.push({
        ok: false,
        error: `Skill "${currentSlug}" not found on ClawHub.`,
      });
      continue;
    }

    const latestVersion = detail.latestVersion;
    const targetDir = resolveWorkspaceSkillInstallDir(workspaceDir, currentSlug);

    if (!slug && previousVersion === latestVersion) {
      results.push({
        ok: true,
        slug: currentSlug,
        previousVersion,
        version: latestVersion,
        changed: false,
        targetDir,
      });
      continue;
    }

    const installResult = await installSkillFromClawHub(
      workspaceDir,
      currentSlug,
      latestVersion,
      true,
    );

    if (!installResult.ok) {
      results.push(installResult);
      continue;
    }

    results.push({
      ok: true,
      slug: currentSlug,
      previousVersion,
      version: latestVersion,
      changed: previousVersion !== latestVersion,
      targetDir,
    });
  }

  return results;
}
