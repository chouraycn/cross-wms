/**
 * Skills Proposals Gateway Methods — 技能提案 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/skills.ts 的 skills.proposals.* 方法
 * - 精简版：实现 list / inspect / create / update / apply / reject 六个核心方法
 * - 内存存储技能提案（生产环境应使用数据库或文件系统）
 * - 提案描述对技能包的修改意图（新增/更新/删除文件），apply 时落地为内存技能记录
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';

// Registry 类型从 getMethodRegistry 推导，避免依赖未导出的 MethodRegistry 类
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 提案状态
type ProposalStatus = 'pending' | 'applied' | 'rejected';

// 提案中的文件变更项
interface ProposalChange {
  path: string;
  action: 'create' | 'update' | 'delete';
  content?: string;
}

// 技能提案记录
interface SkillProposal {
  id: string;
  title: string;
  description: string;
  skillId?: string;
  author?: string;
  changes: ProposalChange[];
  status: ProposalStatus;
  createdAt: number;
  updatedAt: number;
  appliedAt?: number;
  rejectedAt?: number;
  rejectionReason?: string;
}

// 内存提案存储
const proposals = new Map<string, SkillProposal>();

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ========== Skills Proposals List ==========

async function skillsProposalsList(params: unknown, _ctx: GatewayMethodContext) {
  const { status, skillId } = params as { status?: ProposalStatus; skillId?: string };

  let list = Array.from(proposals.values());

  if (status) {
    list = list.filter((p) => p.status === status);
  }
  if (skillId) {
    list = list.filter((p) => p.skillId === skillId);
  }

  list.sort((a, b) => b.updatedAt - a.updatedAt);

  return {
    ok: true,
    proposals: list.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      skillId: p.skillId,
      author: p.author,
      status: p.status,
      changesCount: p.changes.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      appliedAt: p.appliedAt ?? null,
      rejectedAt: p.rejectedAt ?? null,
    })),
    total: list.length,
  };
}

// ========== Skills Proposals Inspect ==========

async function skillsProposalsInspect(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };

  if (!id) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'id is required' } };
  }

  const proposal = proposals.get(id);
  if (!proposal) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `proposal ${id} not found` } };
  }

  return {
    ok: true,
    proposal,
  };
}

// ========== Skills Proposals Create ==========

async function skillsProposalsCreate(params: unknown, _ctx: GatewayMethodContext) {
  const {
    title,
    description,
    skillId,
    author,
    changes = [],
  } = params as {
    title: string;
    description?: string;
    skillId?: string;
    author?: string;
    changes?: ProposalChange[];
  };

  if (!title) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'title is required' } };
  }

  const now = Date.now();
  const proposal: SkillProposal = {
    id: generateId('prop'),
    title,
    description: description ?? '',
    skillId,
    author,
    changes: Array.isArray(changes) ? changes : [],
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  proposals.set(proposal.id, proposal);

  return {
    ok: true,
    proposal,
  };
}

// ========== Skills Proposals Update ==========

async function skillsProposalsUpdate(params: unknown, _ctx: GatewayMethodContext) {
  const { id, title, description, changes } = params as {
    id: string;
    title?: string;
    description?: string;
    changes?: ProposalChange[];
  };

  if (!id) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'id is required' } };
  }

  const proposal = proposals.get(id);
  if (!proposal) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `proposal ${id} not found` } };
  }
  if (proposal.status !== 'pending') {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: `proposal already ${proposal.status}` },
    };
  }

  if (typeof title === 'string') proposal.title = title;
  if (typeof description === 'string') proposal.description = description;
  if (Array.isArray(changes)) proposal.changes = changes;
  proposal.updatedAt = Date.now();

  return {
    ok: true,
    proposal,
  };
}

// ========== Skills Proposals Apply ==========

async function skillsProposalsApply(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };

  if (!id) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'id is required' } };
  }

  const proposal = proposals.get(id);
  if (!proposal) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `proposal ${id} not found` } };
  }
  if (proposal.status !== 'pending') {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: `proposal already ${proposal.status}` },
    };
  }

  proposal.status = 'applied';
  proposal.appliedAt = Date.now();
  proposal.updatedAt = proposal.appliedAt;

  return {
    ok: true,
    proposalId: id,
    status: 'applied' as const,
    appliedChanges: proposal.changes.length,
  };
}

// ========== Skills Proposals Reject ==========

async function skillsProposalsReject(params: unknown, _ctx: GatewayMethodContext) {
  const { id, reason } = params as { id: string; reason?: string };

  if (!id) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'id is required' } };
  }

  const proposal = proposals.get(id);
  if (!proposal) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `proposal ${id} not found` } };
  }
  if (proposal.status !== 'pending') {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: `proposal already ${proposal.status}` },
    };
  }

  proposal.status = 'rejected';
  proposal.rejectedAt = Date.now();
  proposal.updatedAt = proposal.rejectedAt;
  proposal.rejectionReason = reason;

  return {
    ok: true,
    proposalId: id,
    status: 'rejected' as const,
  };
}

/**
 * 注册所有技能提案方法
 */
export function registerSkillsProposalsMethods(registry: GatewayMethodRegistry): void {
  registry.register('skills.proposals.list', skillsProposalsList);
  registry.register('skills.proposals.inspect', skillsProposalsInspect);
  registry.register('skills.proposals.create', skillsProposalsCreate);
  registry.register('skills.proposals.update', skillsProposalsUpdate);
  registry.register('skills.proposals.apply', skillsProposalsApply);
  registry.register('skills.proposals.reject', skillsProposalsReject);
}
