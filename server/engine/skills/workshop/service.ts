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
  SkillProposalReviewInput,
  SkillProposalReviseWithRevisionInput,
  SkillProposalSearchInput,
  SkillProposalRollbackInput,
  SkillProposalSearchResult,
} from "./types.js";
import { ensureWorkspaceSkillsDir } from "../loading/workspace.js";
import { emitProposalEvent } from "./event-bus.js";

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

    record.history = [
      {
        timestamp: record.createdAt,
        action: "created",
        actor: input.createdBy,
        details: `Created ${record.kind} proposal`,
      },
    ];

    await saveProposal(workspaceDir, record);
    logger.info("[Skills] Created skill proposal:", name, record.id);

    emitProposalEvent(record.status === "quarantined" ? "quarantined" : "created", {
      proposalId: record.id,
      skillName: name,
      status: record.status,
      actor: input.createdBy,
      timestamp: record.createdAt,
    });

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

    if (!updatedRecord) {
      return { success: false, error: "Proposal not found" };
    }

    if (!updatedRecord.history) updatedRecord.history = [];
    updatedRecord.history.push({
      timestamp: updatedRecord.updatedAt,
      action: "applied",
      details: input.reason,
    });

    await saveProposal(workspaceDir, updatedRecord);
    logger.info("[Skills] Applied skill proposal:", proposalId, record.target.skillName);

    emitProposalEvent("applied", {
      proposalId: updatedRecord.id,
      skillName: updatedRecord.target.skillName,
      status: "applied",
      reason: input.reason,
      timestamp: updatedRecord.updatedAt,
    });

    return {
      record: updatedRecord,
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

    const updatedRecord = await updateProposalStatus(workspaceDir, proposalId, "rejected", input.reason);

    if (!updatedRecord) {
      return { success: false, error: "Proposal not found" };
    }

    if (!updatedRecord.history) updatedRecord.history = [];
    updatedRecord.history.push({
      timestamp: updatedRecord.updatedAt,
      action: "rejected",
      details: input.reason,
    });

    await saveProposal(workspaceDir, updatedRecord);
    logger.info("[Skills] Rejected skill proposal:", proposalId);

    emitProposalEvent("rejected", {
      proposalId: updatedRecord.id,
      skillName: updatedRecord.target.skillName,
      status: "rejected",
      reason: input.reason,
      timestamp: updatedRecord.updatedAt,
    });

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
  const record = await loadProposal(workspaceDir, proposalId);
  if (!record) {
    return { success: false, error: "Proposal not found" };
  }

  const result = await deleteProposal(workspaceDir, proposalId);
  if (!result) {
    return { success: false, error: "Failed to delete proposal" };
  }

  logger.info("[Skills] Deleted skill proposal:", proposalId);

  emitProposalEvent("deleted", {
    proposalId: record.id,
    skillName: record.target.skillName,
    status: record.status,
    timestamp: new Date().toISOString(),
  });

  return { success: true };
}

export async function createRevision(
  input: SkillProposalReviseWithRevisionInput,
): Promise<{ success: boolean; revisionNumber?: number; error?: string }> {
  const { workspaceDir, proposalId, content, changes, author } = input;

  try {
    const record = await loadProposal(workspaceDir, proposalId);
    if (!record) {
      return { success: false, error: "Proposal not found" };
    }

    const revisionNumber = (record.revisions?.length || 0) + 1;
    const timestamp = new Date().toISOString();

    record.draftHash = hashContent(content);
    record.updatedAt = timestamp;

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

    if (!record.revisions) record.revisions = [];
    record.revisions.push({
      revisionNumber,
      changes,
      timestamp,
      author,
    });

    if (!record.history) record.history = [];
    record.history.push({
      timestamp,
      action: "revised",
      actor: author,
      details: `Revision ${revisionNumber}: ${changes}`,
    });

    await saveProposal(workspaceDir, record);
    logger.info("[Skills] Created revision for proposal:", proposalId, revisionNumber);

    emitProposalEvent("revised", {
      proposalId: record.id,
      skillName: record.target.skillName,
      status: record.status,
      actor: author,
      timestamp,
    });

    return { success: true, revisionNumber };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Failed to create revision:", err);
    return { success: false, error: errorMessage };
  }
}

export async function reviewProposal(
  input: SkillProposalReviewInput,
): Promise<{ success: boolean; error?: string }> {
  const { workspaceDir, proposalId, reviewer, status, comments } = input;

  try {
    const record = await loadProposal(workspaceDir, proposalId);
    if (!record) {
      return { success: false, error: "Proposal not found" };
    }

    const reviewAt = new Date().toISOString();

    if (!record.reviews) record.reviews = [];
    record.reviews.push({
      reviewer,
      reviewAt,
      status,
      comments,
    });

    record.updatedAt = reviewAt;

    if (!record.history) record.history = [];
    record.history.push({
      timestamp: reviewAt,
      action: "reviewed",
      actor: reviewer,
      details: `Review: ${status}`,
    });

    await saveProposal(workspaceDir, record);
    logger.info("[Skills] Reviewed proposal:", proposalId, status);

    emitProposalEvent("reviewed", {
      proposalId: record.id,
      skillName: record.target.skillName,
      status: record.status,
      actor: reviewer,
      reason: comments,
      timestamp: reviewAt,
    });

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Failed to review proposal:", err);
    return { success: false, error: errorMessage };
  }
}

export async function quarantineProposal(
  input: SkillProposalActionInput,
): Promise<{ success: boolean; error?: string }> {
  const { workspaceDir, proposalId, reason } = input;

  try {
    const record = await loadProposal(workspaceDir, proposalId);
    if (!record) {
      return { success: false, error: "Proposal not found" };
    }

    const updatedRecord = await updateProposalStatus(workspaceDir, proposalId, "quarantined", reason);
    if (!updatedRecord) {
      return { success: false, error: "Failed to update proposal status" };
    }

    if (!updatedRecord.history) updatedRecord.history = [];
    updatedRecord.history.push({
      timestamp: updatedRecord.updatedAt,
      action: "quarantined",
      details: reason,
    });

    await saveProposal(workspaceDir, updatedRecord);
    logger.info("[Skills] Quarantined proposal:", proposalId);

    emitProposalEvent("quarantined", {
      proposalId: updatedRecord.id,
      skillName: updatedRecord.target.skillName,
      status: "quarantined",
      reason,
      timestamp: updatedRecord.updatedAt,
    });

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Failed to quarantine proposal:", err);
    return { success: false, error: errorMessage };
  }
}

export async function mergeProposal(
  input: SkillProposalActionInput,
): Promise<SkillProposalApplyResult | { success: false; error: string }> {
  const { workspaceDir, proposalId, reason } = input;

  try {
    const record = await loadProposal(workspaceDir, proposalId);
    if (!record) {
      return { success: false, error: "Proposal not found" };
    }

    if (record.status !== "pending") {
      return { success: false, error: `Cannot merge proposal with status: ${record.status}` };
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
      reason || "Merged",
    );

    if (!updatedRecord) {
      return { success: false, error: "Proposal not found" };
    }

    if (!updatedRecord.history) updatedRecord.history = [];
    updatedRecord.history.push({
      timestamp: updatedRecord.updatedAt,
      action: "merged",
      details: reason,
    });

    await saveProposal(workspaceDir, updatedRecord);
    logger.info("[Skills] Merged skill proposal:", proposalId, record.target.skillName);

    emitProposalEvent("applied", {
      proposalId: updatedRecord.id,
      skillName: updatedRecord.target.skillName,
      status: "applied",
      reason,
      timestamp: updatedRecord.updatedAt,
    });

    return {
      record: updatedRecord,
      targetSkillFile: skillFile,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Failed to merge proposal:", err);
    return { success: false, error: errorMessage };
  }
}

export async function rollbackProposal(
  input: SkillProposalRollbackInput,
): Promise<{ success: boolean; error?: string }> {
  const { workspaceDir, proposalId, targetRevision, reason } = input;

  try {
    const record = await loadProposal(workspaceDir, proposalId);
    if (!record) {
      return { success: false, error: "Proposal not found" };
    }

    if (!record.revisions || record.revisions.length === 0) {
      return { success: false, error: "No revisions available to rollback" };
    }

    const rollbackTo = targetRevision || record.revisions.length;
    const revision = record.revisions.find((r) => r.revisionNumber === rollbackTo);

    if (!revision) {
      return { success: false, error: `Revision ${rollbackTo} not found` };
    }

    record.revisions = record.revisions.filter((r) => r.revisionNumber <= rollbackTo);
    record.updatedAt = new Date().toISOString();

    if (!record.history) record.history = [];
    record.history.push({
      timestamp: record.updatedAt,
      action: "rollback",
      details: `Rolled back to revision ${rollbackTo}: ${reason}`,
    });

    await saveProposal(workspaceDir, record);
    logger.info("[Skills] Rolled back proposal:", proposalId, "to revision", rollbackTo);

    emitProposalEvent("updated", {
      proposalId: record.id,
      skillName: record.target.skillName,
      status: record.status,
      reason: `Rollback to revision ${rollbackTo}`,
      timestamp: record.updatedAt,
    });

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[Skills] Failed to rollback proposal:", err);
    return { success: false, error: errorMessage };
  }
}

export async function searchProposals(
  input: SkillProposalSearchInput,
): Promise<SkillProposalSearchResult> {
  const { workspaceDir, query, status, skillName, kind, tags, category, limit = 20, offset = 0 } = input;

  try {
    let proposals = await listProposals(workspaceDir);

    if (status) {
      proposals = proposals.filter((p) => p.status === status);
    }

    if (skillName) {
      proposals = proposals.filter((p) =>
        p.target.skillName.toLowerCase().includes(skillName.toLowerCase()),
      );
    }

    if (kind) {
      proposals = proposals.filter((p) => p.kind === kind);
    }

    if (category) {
      proposals = proposals.filter((p) => p.metadata?.category === category);
    }

    if (tags && tags.length > 0) {
      proposals = proposals.filter((p) =>
        tags.every((tag) => p.metadata?.tags?.includes(tag)),
      );
    }

    if (query) {
      const queryLower = query.toLowerCase();
      proposals = proposals.filter((p) =>
        p.title.toLowerCase().includes(queryLower) ||
        p.description.toLowerCase().includes(queryLower) ||
        p.target.skillName.toLowerCase().includes(queryLower),
      );
    }

    const total = proposals.length;
    const paginated = proposals.slice(offset, offset + limit);

    return {
      proposals: paginated,
      total,
    };
  } catch (err) {
    logger.error("[Skills] Failed to search proposals:", err);
    return {
      proposals: [],
      total: 0,
    };
  }
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
