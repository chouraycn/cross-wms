// staffDelegation unit tests (P2b): delegation depth cap, parent authorization,
// terminal-state guard, and service lifecycle with a mocked DAO.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  DelegationError,
  assertDepthAllowed,
  assertNotTerminal,
  assertParentAuthorized,
  computeDelegationDepth,
  staffDelegationService,
} from '../staffDelegation.js';
import type { DelegationRow } from '../../dao/staffDelegationDao.js';

vi.mock('../../dao/staffDelegationDao.js', () => ({
  createDelegation: vi.fn(),
  getDelegationById: vi.fn(),
  listDelegations: vi.fn(),
  maxActiveDepthOfParent: vi.fn(),
  updateDelegationStatus: vi.fn(),
}));

// 避免触发真实账本/DB（测试只验证业务规则，账本写入由集成侧负责）
vi.mock('../../engine/eventRecorder.js', () => ({
  recordDelegationChanged: vi.fn(),
}));

import {
  createDelegation,
  getDelegationById,
  listDelegations,
  maxActiveDepthOfParent,
  updateDelegationStatus,
} from '../../dao/staffDelegationDao.js';

const mocked = {
  createDelegation: vi.mocked(createDelegation),
  getDelegationById: vi.mocked(getDelegationById),
  listDelegations: vi.mocked(listDelegations),
  maxActiveDepthOfParent: vi.mocked(maxActiveDepthOfParent),
  updateDelegationStatus: vi.mocked(updateDelegationStatus),
};

function row(partial: Partial<DelegationRow> = {}): DelegationRow {
  return {
    id: 'd1',
    tenant_id: 't1',
    parent_agent_id: 'agent-a',
    child_agent_id: 'agent-b',
    parent_session_id: 'sess-a',
    child_session_id: null,
    task_description: '盘点上海仓',
    depth: 1,
    status: 'pending',
    error: null,
    created_at: 1,
    updated_at: 1,
    ...partial,
  };
}

/** 捕获同步抛错的 error.code */
function codeOf(fn: () => void): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    return (e as DelegationError).code;
  }
}

describe('staffDelegation — pure rules', () => {
  it('computeDelegationDepth = parent max active depth + 1', () => {
    expect(computeDelegationDepth(0)).toBe(1);
    expect(computeDelegationDepth(2)).toBe(3);
  });

  it('assertDepthAllowed rejects over the limit (default 3)', () => {
    expect(codeOf(() => assertDepthAllowed(3))).toBeUndefined();
    expect(codeOf(() => assertDepthAllowed(4))).toBe('DEPTH_EXCEEDED');
    expect(codeOf(() => assertDepthAllowed(5, 5))).toBeUndefined(); // 显式上限优先
  });

  it('assertParentAuthorized rejects non-parent agents', () => {
    const d = row();
    expect(codeOf(() => assertParentAuthorized(d, 't1', 'agent-a'))).toBeUndefined();
    expect(codeOf(() => assertParentAuthorized(d, 't1', 'agent-c'))).toBe('UNAUTHORIZED');
    expect(codeOf(() => assertParentAuthorized(d, 't2', 'agent-a'))).toBe('UNAUTHORIZED');
  });

  it('assertNotTerminal rejects transitions on completed/failed', () => {
    expect(codeOf(() => assertNotTerminal(row({ status: 'active' })))).toBeUndefined();
    expect(codeOf(() => assertNotTerminal(row({ status: 'completed' })))).toBe('TERMINAL');
    expect(codeOf(() => assertNotTerminal(row({ status: 'failed' })))).toBe('TERMINAL');
  });
});

describe('staffDelegation — service lifecycle (mocked DAO)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create computes depth from parent chain and enforces the cap', async () => {
    mocked.maxActiveDepthOfParent.mockReturnValue(2);
    mocked.createDelegation.mockImplementation((input) => row({ id: input.id, depth: input.depth }));
    const d = await staffDelegationService.create({
      tenantId: 't1',
      parentAgentId: 'agent-a',
      childAgentId: 'agent-b',
      parentSessionId: 'sess-a',
      taskDescription: '盘点上海仓',
    });
    expect(d.depth).toBe(3);
    expect(mocked.createDelegation).toHaveBeenCalledWith(expect.objectContaining({ depth: 3 }));
  });

  it('create rejects when depth would exceed the cap', async () => {
    mocked.maxActiveDepthOfParent.mockReturnValue(3); // 3+1=4 > 3
    await expect(
      staffDelegationService.create({
        tenantId: 't1',
        parentAgentId: 'agent-a',
        childAgentId: 'agent-b',
        parentSessionId: 'sess-a',
        taskDescription: '任务',
      }),
    ).rejects.toMatchObject({ code: 'DEPTH_EXCEEDED' });
    expect(mocked.createDelegation).not.toHaveBeenCalled();
  });

  it('transition requires direct parent authorization', async () => {
    mocked.getDelegationById.mockReturnValue(row());
    await expect(
      staffDelegationService.transition('t1', 'agent-c', 'd1', 'active', { childSessionId: 'sess-b' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('transition activates with child session, then refuses terminal re-transition', async () => {
    // 场景 1：pending → active（绑定子会话）
    mocked.getDelegationById.mockReturnValue(row());
    mocked.updateDelegationStatus.mockReturnValue(row({ status: 'active', child_session_id: 'sess-b' }));
    const d = await staffDelegationService.transition('t1', 'agent-a', 'd1', 'active', { childSessionId: 'sess-b' });
    expect(d.status).toBe('active');
    expect(d.child_session_id).toBe('sess-b');
    expect(mocked.updateDelegationStatus).toHaveBeenCalledWith('t1', 'd1', 'active', { childSessionId: 'sess-b' });

    // 场景 2：已 completed 的派活不可再迁移（TERMINAL）
    mocked.getDelegationById.mockReturnValue(row({ status: 'completed' }));
    await expect(
      staffDelegationService.transition('t1', 'agent-a', 'd1', 'failed', {}),
    ).rejects.toMatchObject({ code: 'TERMINAL' });
  });

  it('transition on unknown delegation throws NOT_FOUND', async () => {
    mocked.getDelegationById.mockReturnValue(null);
    await expect(
      staffDelegationService.transition('t1', 'agent-a', 'nope', 'active', {}),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('list passes tenant and filters through', () => {
    mocked.listDelegations.mockReturnValue([row()]);
    const items = staffDelegationService.list('t1', { status: 'active' });
    expect(mocked.listDelegations).toHaveBeenCalledWith('t1', { status: 'active' });
    expect(items).toHaveLength(1);
  });
});
