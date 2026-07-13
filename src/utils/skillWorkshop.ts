import type { SecurityScanResult } from './securityScanner';

export type SkillProposalStatus = 'pending' | 'applied' | 'rejected' | 'quarantined' | 'stale';
export type SkillProposalKind = 'create' | 'update';
export type SkillProposalSource = 'skill-workshop' | 'cli' | 'gateway';
export type SkillProposalScannerState = 'pending' | 'clean' | 'failed' | 'quarantined';

export interface SkillProposalOrigin {
  agentId?: string;
  sessionKey?: string;
  runId?: string;
  messageId?: string;
}

export interface SkillProposalScan {
  state: SkillProposalScannerState;
  scannedAt: string;
  critical: number;
  warn: number;
  info: number;
  findings: SecurityScanFinding[];
}

export interface SkillProposalSupportFile {
  path: string;
  sizeBytes: number;
  hash: string;
  targetExisted?: boolean;
  targetContentHash?: string;
}

export interface SecurityScanFinding {
  ruleId: string;
  severity: 'info' | 'warn' | 'critical';
  file: string;
  line: number;
  message: string;
  evidence: string;
}

export interface SkillProposalRecord {
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
  version: number;
  parentVersion?: string;
  author?: string;
  forkedFrom?: string;
  draftContent: string;
  draftHash: string;
  supportFiles?: SkillProposalSupportFile[];
  target: {
    skillName: string;
    skillKey: string;
    skillDir: string;
    skillFile: string;
    source?: string;
    currentContentHash?: string;
  };
  scan: SkillProposalScan;
  goal?: string;
  evidence?: string;
  appliedAt?: string;
  rejectedAt?: string;
  quarantinedAt?: string;
  staleAt?: string;
  statusReason?: string;
}

export interface SkillProposalVersionEntry {
  version: number;
  parentVersion?: string;
  author?: string;
  timestamp: number;
  changeSummary: string;
}

export interface SkillProposalManifestEntry {
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
  version?: number;
  author?: string;
  forkedFrom?: string;
  versions?: SkillProposalVersionEntry[];
}

export interface SkillProposalCreateInput {
  name: string;
  description: string;
  content: string;
  supportFiles?: Array<{ path: string; content: string }>;
  createdBy?: SkillProposalSource;
  origin?: SkillProposalOrigin;
  goal?: string;
  evidence?: string;
  author?: string;
}

export interface SkillProposalUpdateInput {
  skillName: string;
  description?: string;
  content: string;
  supportFiles?: Array<{ path: string; content: string }>;
  createdBy?: SkillProposalSource;
  origin?: SkillProposalOrigin;
  goal?: string;
  evidence?: string;
  author?: string;
}

export interface SkillProposalReviseInput {
  proposalId: string;
  content: string;
  supportFiles?: Array<{ path: string; content: string }>;
  description?: string;
  goal?: string;
  evidence?: string;
  changeSummary?: string;
  author?: string;
}

export interface SkillProposalForkInput {
  proposalId: string;
  author: string;
  changeSummary?: string;
}

export interface SkillProposalMergeInput {
  sourceId: string;
  targetId: string;
  conflictStrategy?: 'source-priority' | 'target-priority' | 'manual';
  changeSummary?: string;
}

export interface SkillProposalApplyResult {
  success: boolean;
  record?: SkillProposalRecord;
  targetSkillFile?: string;
  error?: string;
}

export class SkillWorkshop {
  private proposals: Map<string, SkillProposalRecord> = new Map();
  private versionHistory: Map<string, SkillProposalVersionEntry[]> = new Map();

  createProposal(input: SkillProposalCreateInput): SkillProposalRecord {
    const id = `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const skillKey = this.normalizeSkillKey(input.name);
    const draftHash = this.hashContent(input.content);

    const record: SkillProposalRecord = {
      id,
      kind: 'create',
      status: 'pending',
      title: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy || 'skill-workshop',
      origin: input.origin,
      proposedVersion: `v1`,
      version: 1,
      author: input.author,
      draftContent: input.content,
      draftHash,
      supportFiles: input.supportFiles?.map(f => ({
        path: f.path,
        sizeBytes: f.content.length,
        hash: this.hashContent(f.content),
      })),
      target: {
        skillName: input.name,
        skillKey,
        skillDir: `skills/${skillKey}`,
        skillFile: `skills/${skillKey}/SKILL.md`,
      },
      scan: {
        state: 'pending',
        scannedAt: now,
        critical: 0,
        warn: 0,
        info: 0,
        findings: [],
      },
      goal: input.goal,
      evidence: input.evidence,
    };

    this.proposals.set(id, record);
    this.versionHistory.set(id, [{
      version: 1,
      author: input.author,
      timestamp: Date.now(),
      changeSummary: 'Initial proposal',
    }]);

    return record;
  }

  createUpdateProposal(input: SkillProposalUpdateInput): SkillProposalRecord {
    const id = `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const skillKey = this.normalizeSkillKey(input.skillName);
    const draftHash = this.hashContent(input.content);

    const record: SkillProposalRecord = {
      id,
      kind: 'update',
      status: 'pending',
      title: `Update ${input.skillName}`,
      description: input.description || '',
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy || 'skill-workshop',
      origin: input.origin,
      proposedVersion: `v1`,
      version: 1,
      author: input.author,
      draftContent: input.content,
      draftHash,
      supportFiles: input.supportFiles?.map(f => ({
        path: f.path,
        sizeBytes: f.content.length,
        hash: this.hashContent(f.content),
      })),
      target: {
        skillName: input.skillName,
        skillKey,
        skillDir: `skills/${skillKey}`,
        skillFile: `skills/${skillKey}/SKILL.md`,
      },
      scan: {
        state: 'pending',
        scannedAt: now,
        critical: 0,
        warn: 0,
        info: 0,
        findings: [],
      },
      goal: input.goal,
      evidence: input.evidence,
    };

    this.proposals.set(id, record);
    this.versionHistory.set(id, [{
      version: 1,
      author: input.author,
      timestamp: Date.now(),
      changeSummary: 'Update proposal',
    }]);

    return record;
  }

  getProposal(proposalId: string): SkillProposalRecord | undefined {
    return this.proposals.get(proposalId);
  }

  listProposals(filter?: {
    status?: SkillProposalStatus;
    kind?: SkillProposalKind;
    skillName?: string;
  }): SkillProposalRecord[] {
    let proposals = Array.from(this.proposals.values());

    if (filter?.status) {
      proposals = proposals.filter(p => p.status === filter.status);
    }
    if (filter?.kind) {
      proposals = proposals.filter(p => p.kind === filter.kind);
    }
    if (filter?.skillName) {
      proposals = proposals.filter(p => 
        p.target.skillName.toLowerCase().includes(filter.skillName!.toLowerCase())
      );
    }

    return proposals.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  reviseProposal(input: SkillProposalReviseInput): SkillProposalRecord | null {
    const record = this.proposals.get(input.proposalId);
    if (!record) return null;

    const now = new Date().toISOString();
    const newVersion = record.version + 1;
    const draftHash = this.hashContent(input.content);

    const updated: SkillProposalRecord = {
      ...record,
      description: input.description ?? record.description,
      draftContent: input.content,
      draftHash,
      proposedVersion: `v${newVersion}`,
      version: newVersion,
      parentVersion: record.proposedVersion,
      updatedAt: now,
      goal: input.goal ?? record.goal,
      evidence: input.evidence ?? record.evidence,
      scan: {
        ...record.scan,
        state: 'pending',
        scannedAt: now,
      },
    };

    if (input.supportFiles) {
      updated.supportFiles = input.supportFiles.map(f => ({
        path: f.path,
        sizeBytes: f.content.length,
        hash: this.hashContent(f.content),
      }));
    }

    this.proposals.set(input.proposalId, updated);

    const history = this.versionHistory.get(input.proposalId) || [];
    history.push({
      version: newVersion,
      parentVersion: record.proposedVersion,
      author: input.author,
      timestamp: Date.now(),
      changeSummary: input.changeSummary || `Revised to version ${newVersion}`,
    });
    this.versionHistory.set(input.proposalId, history);

    return updated;
  }

  forkProposal(input: SkillProposalForkInput): SkillProposalRecord | null {
    const source = this.proposals.get(input.proposalId);
    if (!source) return null;

    const newId = `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const forked: SkillProposalRecord = {
      ...source,
      id: newId,
      title: `${source.title} (Fork)`,
      createdAt: now,
      updatedAt: now,
      version: 1,
      proposedVersion: `v1`,
      forkedFrom: input.proposalId,
      parentVersion: source.proposedVersion,
      author: input.author,
      status: 'pending',
      scan: {
        ...source.scan,
        scannedAt: now,
      },
    };

    this.proposals.set(newId, forked);
    this.versionHistory.set(newId, [{
      version: 1,
      parentVersion: source.proposedVersion,
      author: input.author,
      timestamp: Date.now(),
      changeSummary: input.changeSummary || `Forked from ${input.proposalId}`,
    }]);

    return forked;
  }

  applyProposal(proposalId: string, reason?: string): SkillProposalApplyResult {
    const record = this.proposals.get(proposalId);
    if (!record) {
      return { success: false, error: 'Proposal not found' };
    }
    if (record.status === 'applied') {
      return { success: false, error: 'Proposal already applied' };
    }
    if (record.scan.state === 'quarantined') {
      return { success: false, error: 'Proposal is quarantined due to security issues' };
    }

    const now = new Date().toISOString();
    const updated: SkillProposalRecord = {
      ...record,
      status: 'applied',
      appliedAt: now,
      updatedAt: now,
      statusReason: reason,
    };

    this.proposals.set(proposalId, updated);

    return {
      success: true,
      record: updated,
      targetSkillFile: record.target.skillFile,
    };
  }

  rejectProposal(proposalId: string, reason?: string): SkillProposalRecord | null {
    const record = this.proposals.get(proposalId);
    if (!record) return null;

    const now = new Date().toISOString();
    const updated: SkillProposalRecord = {
      ...record,
      status: 'rejected',
      rejectedAt: now,
      updatedAt: now,
      statusReason: reason,
    };

    this.proposals.set(proposalId, updated);
    return updated;
  }

  quarantineProposal(proposalId: string, reason?: string): SkillProposalRecord | null {
    const record = this.proposals.get(proposalId);
    if (!record) return null;

    const now = new Date().toISOString();
    const updated: SkillProposalRecord = {
      ...record,
      status: 'quarantined',
      quarantinedAt: now,
      updatedAt: now,
      statusReason: reason,
    };

    this.proposals.set(proposalId, updated);
    return updated;
  }

  markStale(proposalId: string, reason?: string): SkillProposalRecord | null {
    const record = this.proposals.get(proposalId);
    if (!record) return null;

    const now = new Date().toISOString();
    const updated: SkillProposalRecord = {
      ...record,
      status: 'stale',
      staleAt: now,
      updatedAt: now,
      statusReason: reason,
    };

    this.proposals.set(proposalId, updated);
    return updated;
  }

  updateScanResult(proposalId: string, scanResult: {
    critical: number;
    warn: number;
    info: number;
    findings: SecurityScanFinding[];
  }): SkillProposalRecord | null {
    const record = this.proposals.get(proposalId);
    if (!record) return null;

    const now = new Date().toISOString();
    const state: SkillProposalScannerState = scanResult.critical > 0 
      ? 'quarantined' 
      : scanResult.warn > 0 
        ? 'failed' 
        : 'clean';

    const updated: SkillProposalRecord = {
      ...record,
      updatedAt: now,
      scan: {
        state,
        scannedAt: now,
        critical: scanResult.critical,
        warn: scanResult.warn,
        info: scanResult.info,
        findings: scanResult.findings,
      },
    };

    if (state === 'quarantined') {
      updated.status = 'quarantined';
      updated.quarantinedAt = now;
      updated.statusReason = 'Security scan detected critical issues';
    }

    this.proposals.set(proposalId, updated);
    return updated;
  }

  getVersionHistory(proposalId: string): SkillProposalVersionEntry[] {
    return this.versionHistory.get(proposalId) || [];
  }

  getManifest(): SkillProposalManifestEntry[] {
    return Array.from(this.proposals.values()).map(p => ({
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
      version: p.version,
      author: p.author,
      forkedFrom: p.forkedFrom,
      versions: this.versionHistory.get(p.id),
    }));
  }

  getProposalCount(): { total: number; pending: number; applied: number; rejected: number; quarantined: number } {
    const proposals = Array.from(this.proposals.values());
    return {
      total: proposals.length,
      pending: proposals.filter(p => p.status === 'pending').length,
      applied: proposals.filter(p => p.status === 'applied').length,
      rejected: proposals.filter(p => p.status === 'rejected').length,
      quarantined: proposals.filter(p => p.status === 'quarantined').length,
    };
  }

  deleteProposal(proposalId: string): boolean {
    this.versionHistory.delete(proposalId);
    return this.proposals.delete(proposalId);
  }

  private normalizeSkillKey(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[\s_/]+/g, '-')
      .replace(/[^a-z0-9-]+/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}

export const skillWorkshop = new SkillWorkshop();
