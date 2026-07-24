import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "../../../logger.js";
import {
  SKILL_WORKSHOP_SCHEMA,
  SKILL_WORKSHOP_MANIFEST_SCHEMA,
  type SkillProposalRecord,
  type SkillProposalManifest,
  type SkillProposalStatus,
  type SkillProposalScan,
  type SkillProposalSource,
} from "./types.js";

const WORKSHOP_DIR = ".cross-wms/skill-workshop";
const PROPOSALS_DIR = "proposals";
const MANIFEST_FILE = "manifest.json";

function getWorkshopDir(workspaceDir: string): string {
  return path.join(workspaceDir, WORKSHOP_DIR);
}

function getProposalsDir(workspaceDir: string): string {
  return path.join(getWorkshopDir(workspaceDir), PROPOSALS_DIR);
}

function getManifestPath(workspaceDir: string): string {
  return path.join(getWorkshopDir(workspaceDir), MANIFEST_FILE);
}

function generateProposalId(): string {
  return `proposal-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function ensureWorkshopDirs(workspaceDir: string): Promise<void> {
  const proposalsDir = getProposalsDir(workspaceDir);
  await fs.mkdir(proposalsDir, { recursive: true });
}

export async function saveProposal(
  workspaceDir: string,
  record: SkillProposalRecord,
): Promise<void> {
  await ensureWorkshopDirs(workspaceDir);
  const proposalDir = path.join(getProposalsDir(workspaceDir), record.id);
  await fs.mkdir(proposalDir, { recursive: true });

  const recordPath = path.join(proposalDir, "record.json");
  await fs.writeFile(recordPath, JSON.stringify(record, null, 2), "utf-8");

  const proposalPath = path.join(proposalDir, "PROPOSAL.md");
  await fs.writeFile(proposalPath, record.draftHash, "utf-8");

  await updateManifest(workspaceDir);
}

export async function loadProposal(
  workspaceDir: string,
  proposalId: string,
): Promise<SkillProposalRecord | null> {
  const proposalDir = path.join(getProposalsDir(workspaceDir), proposalId);
  const recordPath = path.join(proposalDir, "record.json");

  try {
    const data = await fs.readFile(recordPath, "utf-8");
    return JSON.parse(data) as SkillProposalRecord;
  } catch (err) {
    logger.debug("[Skills] Failed to load proposal:", proposalId, err);
    return null;
  }
}

export async function listProposals(
  workspaceDir: string,
  status?: SkillProposalStatus,
): Promise<SkillProposalRecord[]> {
  const proposalsDir = getProposalsDir(workspaceDir);
  const results: SkillProposalRecord[] = [];

  try {
    await fs.access(proposalsDir);
  } catch {
    return results;
  }

  try {
    const entries = await fs.readdir(proposalsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const record = await loadProposal(workspaceDir, entry.name);
      if (!record) continue;

      if (status && record.status !== status) continue;

      results.push(record);
    }

    results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } catch (err) {
    logger.error("[Skills] Failed to list proposals:", err);
  }

  return results;
}

export async function updateProposalStatus(
  workspaceDir: string,
  proposalId: string,
  status: SkillProposalStatus,
  reason?: string,
): Promise<SkillProposalRecord | null> {
  const record = await loadProposal(workspaceDir, proposalId);
  if (!record) return null;

  record.status = status;
  record.updatedAt = new Date().toISOString();
  if (reason) {
    record.statusReason = reason;
  }

  const now = new Date().toISOString();
  if (status === "applied") record.appliedAt = now;
  if (status === "rejected") record.rejectedAt = now;
  if (status === "quarantined") record.quarantinedAt = now;
  if (status === "stale") record.staleAt = now;

  await saveProposal(workspaceDir, record);
  return record;
}

export async function updateProposalScan(
  workspaceDir: string,
  proposalId: string,
  scan: SkillProposalScan,
): Promise<SkillProposalRecord | null> {
  const record = await loadProposal(workspaceDir, proposalId);
  if (!record) return null;

  record.scan = scan;
  record.updatedAt = new Date().toISOString();

  await saveProposal(workspaceDir, record);
  return record;
}

async function updateManifest(workspaceDir: string): Promise<void> {
  const proposals = await listProposals(workspaceDir);
  const manifest: SkillProposalManifest = {
    schema: SKILL_WORKSHOP_MANIFEST_SCHEMA,
    updatedAt: new Date().toISOString(),
    proposals: proposals.map((p) => ({
      id: p.id,
      kind: p.kind,
      status: p.status,
      title: p.title,
      description: p.description,
      skillName: p.target.skillName,
      skillKey: p.target.skillKey,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      scanState: p.scan.state,
    })),
  };

  const manifestPath = getManifestPath(workspaceDir);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

export async function deleteProposal(
  workspaceDir: string,
  proposalId: string,
): Promise<boolean> {
  const proposalDir = path.join(getProposalsDir(workspaceDir), proposalId);

  try {
    await fs.access(proposalDir);
  } catch {
    return false;
  }

  try {
    await fs.rm(proposalDir, { recursive: true, force: true });
    await updateManifest(workspaceDir);
    return true;
  } catch (err) {
    logger.error("[Skills] Failed to delete proposal:", err);
    return false;
  }
}

export function createNewProposalRecord(params: {
  name: string;
  description: string;
  content: string;
  skillDir: string;
  skillFile: string;
  kind: "create" | "update";
  createdBy?: SkillProposalSource;
}): SkillProposalRecord {
  const now = new Date().toISOString();
  const id = generateProposalId();
  const draftHash = hashContent(params.content);

  return {
    schema: SKILL_WORKSHOP_SCHEMA,
    id,
    kind: params.kind,
    status: "pending",
    title: `${params.kind === "create" ? "Create" : "Update"} skill: ${params.name}`,
    description: params.description,
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy || "skill-workshop",
    proposedVersion: "1.0.0",
    draftFile: "PROPOSAL.md",
    draftHash,
    target: {
      skillName: params.name,
      skillKey: params.name,
      skillDir: params.skillDir,
      skillFile: params.skillFile,
    },
    scan: {
      state: "pending",
      scannedAt: now,
      critical: 0,
      warn: 0,
      info: 0,
      findings: [],
    },
  };
}

export { hashContent, generateProposalId };
