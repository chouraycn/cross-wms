import type { SkillScanFinding } from "../security/scanner.js";

export const SKILL_WORKSHOP_SCHEMA = "cross-wms.skill-workshop.proposal.v1" as const;
export const SKILL_WORKSHOP_MANIFEST_SCHEMA =
  "cross-wms.skill-workshop.proposals-manifest.v1" as const;

type SkillProposalKind = "create" | "update";
export type SkillProposalStatus = "pending" | "applied" | "rejected" | "quarantined" | "stale";
type SkillProposalScannerState = "pending" | "clean" | "failed" | "quarantined";
export type SkillProposalSource = "skill-workshop" | "cli" | "api";

export type SkillProposalOrigin = {
  agentId?: string;
  sessionKey?: string;
  runId?: string;
  messageId?: string;
};

export type SkillProposalScan = {
  state: SkillProposalScannerState;
  scannedAt: string;
  critical: number;
  warn: number;
  info: number;
  findings: SkillScanFinding[];
};

type SkillProposalTarget = {
  skillName: string;
  skillKey: string;
  skillDir: string;
  skillFile: string;
  source?: string;
  currentContentHash?: string;
};

export type SkillProposalSupportFile = {
  path: string;
  sizeBytes: number;
  hash: string;
  targetExisted?: boolean;
  targetContentHash?: string;
};

export type ProposalReview = {
  reviewer: string;
  reviewAt: string;
  status: "approved" | "rejected" | "needs_revision";
  comments?: string;
};

export type ProposalRevision = {
  revisionNumber: number;
  changes: string;
  timestamp: string;
  author: string;
};

export type ProposalMetadata = {
  tags?: string[];
  category?: string;
  affectedSkills?: string[];
};

export type SkillProposalRecord = {
  schema: typeof SKILL_WORKSHOP_SCHEMA;
  id: string;
  kind: SkillProposalKind;
  status: SkillProposalStatus;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  createdBy: SkillProposalSource;
  origin?: SkillProposalOrigin;
  proposedVersion: string;
  draftFile: "PROPOSAL.md";
  draftHash: string;
  supportFiles?: SkillProposalSupportFile[];
  target: SkillProposalTarget;
  scan: SkillProposalScan;
  goal?: string;
  evidence?: string;
  appliedAt?: string;
  rejectedAt?: string;
  quarantinedAt?: string;
  staleAt?: string;
  statusReason?: string;
  reviews?: ProposalReview[];
  revisions?: ProposalRevision[];
  metadata?: ProposalMetadata;
  history?: Array<{
    timestamp: string;
    action: string;
    actor?: string;
    details?: string;
  }>;
};

export type SkillProposalManifestEntry = {
  id: string;
  kind: SkillProposalKind;
  status: SkillProposalStatus;
  title: string;
  description: string;
  skillName: string;
  skillKey: string;
  createdAt: string;
  updatedAt: string;
  scanState: SkillProposalScannerState;
};

export type SkillProposalManifest = {
  schema: typeof SKILL_WORKSHOP_MANIFEST_SCHEMA;
  updatedAt: string;
  proposals: SkillProposalManifestEntry[];
};

export type SkillProposalSupportFileInput = {
  path: string;
  content: string;
};

export type SkillProposalCreateInput = {
  workspaceDir: string;
  name: string;
  description: string;
  content: string;
  supportFiles?: SkillProposalSupportFileInput[];
  createdBy?: SkillProposalSource;
  origin?: SkillProposalOrigin;
  goal?: string;
  evidence?: string;
};

export type SkillProposalUpdateInput = {
  workspaceDir: string;
  skillName: string;
  description?: string;
  content: string;
  supportFiles?: SkillProposalSupportFileInput[];
  createdBy?: SkillProposalSource;
  origin?: SkillProposalOrigin;
  goal?: string;
  evidence?: string;
};

export type SkillProposalReviseInput = {
  workspaceDir: string;
  proposalId: string;
  content: string;
  supportFiles?: SkillProposalSupportFileInput[];
  description?: string;
  goal?: string;
  evidence?: string;
};

export type SkillProposalActionInput = {
  workspaceDir: string;
  proposalId: string;
  reason?: string;
};

export type SkillProposalReviewInput = {
  workspaceDir: string;
  proposalId: string;
  reviewer: string;
  status: "approved" | "rejected" | "needs_revision";
  comments?: string;
};

export type SkillProposalReviseWithRevisionInput = {
  workspaceDir: string;
  proposalId: string;
  content: string;
  changes: string;
  author: string;
  supportFiles?: SkillProposalSupportFileInput[];
  description?: string;
  goal?: string;
  evidence?: string;
};

export type SkillProposalSearchInput = {
  workspaceDir: string;
  query?: string;
  status?: SkillProposalStatus;
  skillName?: string;
  kind?: "create" | "update";
  tags?: string[];
  category?: string;
  limit?: number;
  offset?: number;
};

export type SkillProposalRollbackInput = {
  workspaceDir: string;
  proposalId: string;
  targetRevision?: number;
  reason?: string;
};

export type SkillProposalReadResult = {
  record: SkillProposalRecord;
  content: string;
  supportFiles?: SkillProposalSupportFileInput[];
};

export type SkillProposalApplyResult = {
  record: SkillProposalRecord;
  targetSkillFile: string;
};

export type SkillProposalSearchResult = {
  proposals: SkillProposalRecord[];
  total: number;
};

export type ProposalEvent = {
  type: "created" | "updated" | "revised" | "reviewed" | "applied" | "rejected" | "quarantined" | "deleted";
  payload: ProposalEventPayload;
};

export type ProposalEventPayload = {
  proposalId: string;
  skillName: string;
  status: SkillProposalStatus;
  actor?: string;
  reason?: string;
  timestamp: string;
};
