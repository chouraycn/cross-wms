import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";
import { scanSkillContent, hasCriticalFindings } from "../security/scanner.js";
import {
  createNewProposalRecord,
  saveProposal,
  loadProposal,
  listProposals,
  updateProposalStatus,
  updateProposalScan,
  deleteProposal,
  hashContent,
} from "./store.js";
import type {
  SkillProposalCreateInput,
  SkillProposalUpdateInput,
  SkillProposalReviseInput,
  SkillProposalActionInput,
  SkillProposalApplyResult,
  SkillProposalReadResult,
} from "./types.js";
import { ensureWorkspaceSkillsDir } from "../loading/workspace.js";

export async function createSkillProposal(
  input: SkillProposalCreateInput,
): Promise<{ success: boolean; proposalId?: string; error?: string }> {
  const { workspaceDir, name, description, content } = input;

  try {
    const skillsDir = await ensureWorkspaceSkillsDir(workspaceDir);
    const skillDir = path.join(skillsDir, name);
    const skillFile = path.join(skillDir, "SKILL.md");

    const record = createNewProposalRecord({
      name,
      description,
      content,
      skillDir,
      skillFile,
      kind: "create",
      createdBy: input.createdBy,
    });

    if (input.goal) record.goal = input.goal;
    if (input.evidence) record.evidence = input.evidence;
    if (input.origin) record.origin = input.origin;

    const scanResult = await scanProposalContent(content);
    record.scan = scanResult;

    if (scanResult.state === "quarantined") {
      record.status = "quarantined";
    }

    await saveProposal(workspaceDir, record);
    logger.info("[Skills] Created skill proposal:", name, record.id);

    return { success: true, proposalId: record.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Failed to create skill proposal:", err);
    return { success: false, error: errorMessage };
  }
}

export async function updateSkillProposal(
  input: SkillProposalUpdateInput,
): Promise<{ success: boolean; proposalId?: string; error?: string }> {
  const { workspaceDir, skillName, description, content } = input;

  try {
    const skillsDir = await ensureWorkspaceSkillsDir(workspaceDir);
    const skillDir = path.join(skillsDir, skillName);
    const skillFile = path.join(skillDir, "SKILL.md");

    let currentContent = "";
    try {
      currentContent = await fs.readFile(skillFile, "utf-8");
    } catch {
      // Skill doesn't exist yet, treat as create
    }

    const record = createNewProposalRecord({
      name: skillName,
      description: description || `Update skill: ${skillName}`,
      content,
      skillDir,
      skillFile,
      kind: "update",
      createdBy: input.createdBy,
    });

    if (currentContent) {
      record.target.currentContentHash = hashContent(currentContent);
    }

    if (input.goal) record.goal = input.goal;
    if (input.evidence) record.evidence = input.evidence;
    if (input.origin) record.origin = input.origin;

    const scanResult = await scanProposalContent(content);
    record.scan = scanResult;

    if (scanResult.state === "quarantined") {
      record.status = "quarantined";
    }

    await saveProposal(workspaceDir, record);
    logger.info("[Skills] Created update proposal:", skillName, record.id);

    return { success: true, proposalId: record.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Failed to create update proposal:", err);
    return { success: false, error: errorMessage };
  }
}

export async function reviseSkillProposal(
  input: SkillProposalReviseInput,
): Promise<{ success: boolean; error?: string }> {
  const { workspaceDir, proposalId, content } = input;

  try {
    const record = await loadProposal(workspaceDir, proposalId);
    if (!record) {
      return { success: false, error: "Proposal not found" };
    }

    record.draftHash = hashContent(content);
    record.updatedAt = new Date().toISOString();

    if (input.description) record.description = input.description;
    if (input.goal) record.goal = input.goal;
    if (input.evidence) record.evidence = input.evidence;

    const scanResult = await scanProposalContent(content);
    record.scan = scanResult;

    if (scanResult.state === "quarantined") {
      record.status = "quarantined";
    } else if (record.status === "quarantined") {
      record.status = "pending";
    }

    await saveProposal(workspaceDir, record);
    logger.info("[Skills] Revised skill proposal:", proposalId);

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Failed to revise skill proposal:", err);
    return { success: false, error: errorMessage };
  }
}

export async function applySkillProposal(
  input: SkillProposalActionInput,
): Promise<SkillProposalApplyResult | { success: false; error: string }> {
  const { workspaceDir, proposalId } = input;

  try {
    const record = await loadProposal(workspaceDir, proposalId);
    if (!record) {
      return { success: false, error: "Proposal not found" };
    }

    if (record.status !== "pending") {
      return { success: false, error: `Cannot apply proposal with status: ${record.status}` };
    }

    const skillDir = record.target.skillDir;
    const skillFile = record.target.skillFile;

    await fs.mkdir(skillDir, { recursive: true });

    const content = `---
name: ${record.target.skillName}
description: ${record.description}
---

# ${record.target.skillName}

${record.description}
`;

    await fs.writeFile(skillFile, content, "utf-8");

    const updatedRecord = await updateProposalStatus(
      workspaceDir,
      proposalId,
      "applied",
      input.reason,
    );

    logger.info("[Skills] Applied skill proposal:", proposalId, record.target.skillName);

    return {
      record: updatedRecord!,
      targetSkillFile: skillFile,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Failed to apply skill proposal:", err);
    return { success: false, error: errorMessage };
  }
}

export async function rejectSkillProposal(
  input: SkillProposalActionInput,
): Promise<{ success: boolean; error?: string }> {
  const { workspaceDir, proposalId } = input;

  try {
    const record = await loadProposal(workspaceDir, proposalId);
    if (!record) {
      return { success: false, error: "Proposal not found" };
    }

    await updateProposalStatus(workspaceDir, proposalId, "rejected", input.reason);
    logger.info("[Skills] Rejected skill proposal:", proposalId);

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Failed to reject skill proposal:", err);
    return { success: false, error: errorMessage };
  }
}

export async function readSkillProposal(
  workspaceDir: string,
  proposalId: string,
): Promise<SkillProposalReadResult | null> {
  const record = await loadProposal(workspaceDir, proposalId);
  if (!record) return null;

  return {
    record,
    content: record.draftHash,
  };
}

export async function listSkillProposals(
  workspaceDir: string,
  status?: string,
): Promise<Array<{ id: string; title: string; status: string; skillName: string; createdAt: string }>> {
  const proposals = await listProposals(workspaceDir, status as any);
  return proposals.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    skillName: p.target.skillName,
    createdAt: p.createdAt,
  }));
}

export async function deleteSkillProposal(
  workspaceDir: string,
  proposalId: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await deleteProposal(workspaceDir, proposalId);
  if (!result) {
    return { success: false, error: "Proposal not found" };
  }
  logger.info("[Skills] Deleted skill proposal:", proposalId);
  return { success: true };
}

async function scanProposalContent(content: string): Promise<{
  state: "pending" | "clean" | "failed" | "quarantined";
  scannedAt: string;
  critical: number;
  warn: number;
  info: number;
  findings: any[];
}> {
  const scannedAt = new Date().toISOString();

  try {
    const findings = scanSkillContent(content, "proposal.md");

    let critical = 0;
    let warn = 0;
    let info = 0;

    for (const finding of findings) {
      if (finding.severity === "critical") critical++;
      else if (finding.severity === "warn") warn++;
      else info++;
    }

    const state = hasCriticalFindings(findings) ? "quarantined" : "clean";

    return {
      state,
      scannedAt,
      critical,
      warn,
      info,
      findings,
    };
  } catch (err) {
    logger.debug("[Skills] Proposal scan failed:", err);
    return {
      state: "failed",
      scannedAt,
      critical: 0,
      warn: 0,
      info: 0,
      findings: [],
    };
  }
}
