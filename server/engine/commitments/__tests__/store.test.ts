import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  loadCommitmentStore,
  saveCommitmentStore,
  addCommitment,
  getCommitment,
  updateCommitmentStatus,
  claimDueCommitments,
  listPendingCommitmentsForScope,
  listCommitments,
  getCommitmentStats,
  applyFilter,
  applySort,
  applyPagination,
  addHeartbeatRecord,
  getHeartbeatsForCommitment,
  deleteCommitment,
  updateCommitment,
  coerceCommitment,
} from '../index.js';
import type {
  CommitmentRecord,
  CommitmentScope,
  CommitmentCandidate,
  CommitmentExtractionItem,
  CommitmentFilter,
} from '../index.js';

describe('store', () => {
  let testDir: string;
  let storePath: string;
  let testScope: CommitmentScope;

  beforeEach(async () => {
    testDir = join(tmpdir(), `commitments-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    storePath = join(testDir, 'commitments.json');
    testScope = {
      agentId: 'test-agent',
      sessionKey: 'test-session',
      channel: 'test-channel',
    };
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('loadCommitmentStore / saveCommitmentStore', () => {
    it('应该创建并加载空存储', async () => {
      const store = await loadCommitmentStore(storePath);
      expect(store.version).toBe(1);
      expect(store.commitments).toEqual([]);
    });

    it('应该保存并加载承诺', async () => {
      const commitment: CommitmentRecord = {
        id: 'cm_test_1',
        kind: 'follow_up',
        sensitivity: 'normal',
        source: 'rule',
        status: 'pending',
        reason: '测试跟进',
        suggestedText: '请跟进测试事项',
        dedupeKey: 'test-key',
        confidence: 0.8,
        priority: 'medium',
        dueWindow: {
          earliestMs: Date.now() + 1000,
          latestMs: Date.now() + 2000,
          timezone: 'Asia/Shanghai',
        },
        ...testScope,
        tags: ['test'],
        metadata: { test: true },
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        attempts: 0,
      };

      await saveCommitmentStore(storePath, {
        version: 1,
        commitments: [commitment],
      });

      const loaded = await loadCommitmentStore(storePath);
      expect(loaded.commitments.length).toBe(1);
      expect(loaded.commitments[0]?.id).toBe('cm_test_1');
    });
  });

  describe('coerceCommitment', () => {
    it('应该验证有效的承诺记录', () => {
      const valid: CommitmentRecord = {
        id: 'cm_test',
        kind: 'follow_up',
        sensitivity: 'normal',
        source: 'rule',
        status: 'pending',
        reason: '测试',
        suggestedText: '测试文本',
        dedupeKey: 'key',
        confidence: 0.8,
        priority: 'medium',
        dueWindow: {
          earliestMs: Date.now(),
          latestMs: Date.now() + 1000,
          timezone: 'UTC',
        },
        agentId: 'agent',
        sessionKey: 'session',
        channel: 'channel',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        attempts: 0,
      };
      const result = coerceCommitment(valid);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('cm_test');
    });

    it('应该拒绝缺少必填字段的记录', () => {
      const invalid = {
        id: 'cm_test',
      };
      const result = coerceCommitment(invalid as CommitmentRecord);
      expect(result).toBeNull();
    });
  });

  describe('addCommitment', () => {
    it('应该添加承诺', async () => {
      const item: CommitmentExtractionItem = {
        itemId: 'item-1',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
        ...testScope,
        userText: '我会跟进',
        existingPending: [],
      };

      const candidates: Array<{
        candidate: CommitmentCandidate;
        earliestMs: number;
        latestMs: number;
        timezone: string;
      }> = [
        {
          candidate: {
            itemId: 'item-1',
            kind: 'follow_up',
            reason: '跟进测试',
            confidence: 0.8,
            sensitivity: 'normal',
            dedupeKey: 'test-dedupe',
          },
          earliestMs: Date.now() + 1000,
          latestMs: Date.now() + 2000,
          timezone: 'Asia/Shanghai',
        },
      ];

      const result = await addCommitment({
        storePath,
        item,
        candidates,
      });

      expect(result.added).toBe(1);
      expect(result.duplicates).toBe(0);
    });

    it('应该去重相同的承诺', async () => {
      const item: CommitmentExtractionItem = {
        itemId: 'item-1',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
        ...testScope,
        userText: '我会跟进',
        existingPending: [],
      };

      const candidates = [
        {
          candidate: {
            itemId: 'item-1',
            kind: 'follow_up',
            reason: '跟进测试',
            confidence: 0.8,
            sensitivity: 'normal',
            dedupeKey: 'test-dedupe',
          },
          earliestMs: Date.now() + 1000,
          latestMs: Date.now() + 2000,
          timezone: 'Asia/Shanghai',
        },
      ];

      await addCommitment({ storePath, item, candidates });
      const result = await addCommitment({ storePath, item, candidates });

      expect(result.added).toBe(0);
      expect(result.duplicates).toBe(1);
    });
  });

  describe('getCommitment', () => {
    it('应该通过ID获取承诺', async () => {
      const item: CommitmentExtractionItem = {
        itemId: 'item-1',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
        ...testScope,
        userText: '我会跟进',
        existingPending: [],
      };

      const candidates = [
        {
          candidate: {
            itemId: 'item-1',
            kind: 'follow_up',
            reason: '跟进测试',
            confidence: 0.8,
            sensitivity: 'normal',
            dedupeKey: 'get-test',
          },
          earliestMs: Date.now() + 1000,
          latestMs: Date.now() + 2000,
          timezone: 'Asia/Shanghai',
        },
      ];

      await addCommitment({ storePath, item, candidates });

      const store = await loadCommitmentStore(storePath);
      const id = store.commitments[0]?.id;
      expect(id).toBeDefined();

      const commitment = await getCommitment(id!, storePath);
      expect(commitment).not.toBeNull();
      expect(commitment?.kind).toBe('follow_up');
    });

    it('不存在的ID返回null', async () => {
      const result = await getCommitment('nonexistent', storePath);
      expect(result).toBeNull();
    });
  });

  describe('updateCommitmentStatus', () => {
    it('应该更新承诺状态', async () => {
      const item: CommitmentExtractionItem = {
        itemId: 'item-1',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
        ...testScope,
        userText: '我会跟进',
        existingPending: [],
      };

      const candidates = [
        {
          candidate: {
            itemId: 'item-1',
            kind: 'follow_up',
            reason: '测试状态更新',
            confidence: 0.8,
            sensitivity: 'normal',
            dedupeKey: 'status-test',
          },
          earliestMs: Date.now() + 1000,
          latestMs: Date.now() + 2000,
          timezone: 'Asia/Shanghai',
        },
      ];

      await addCommitment({ storePath, item, candidates });

      const store = await loadCommitmentStore(storePath);
      const id = store.commitments[0]?.id!;

      const result = await updateCommitmentStatus(id, 'sent', { storePath });
      expect(result).toBe(true);

      const updated = await getCommitment(id, storePath);
      expect(updated?.status).toBe('sent');
      expect(updated?.sentAtMs).toBeDefined();
    });
  });

  describe('claimDueCommitments', () => {
    it('应该认领到期的承诺', async () => {
      const item: CommitmentExtractionItem = {
        itemId: 'item-1',
        nowMs: Date.now() - 5000,
        timezone: 'Asia/Shanghai',
        ...testScope,
        userText: '我会跟进',
        existingPending: [],
      };

      const candidates = [
        {
          candidate: {
            itemId: 'item-1',
            kind: 'follow_up',
            reason: '到期测试',
            confidence: 0.8,
            sensitivity: 'normal',
            dedupeKey: 'due-test',
          },
          earliestMs: Date.now() - 1000,
          latestMs: Date.now() + 1000,
          timezone: 'Asia/Shanghai',
        },
      ];

      await addCommitment({ storePath, item, candidates });

      const due = await claimDueCommitments({
        storePath,
        agentId: testScope.agentId,
        sessionKey: testScope.sessionKey,
        limit: 10,
      });

      expect(due.length).toBeGreaterThan(0);
      expect(due[0]?.status).toBe('sent');
    });
  });

  describe('listPendingCommitmentsForScope', () => {
    it('应该列出某作用域的待处理承诺', async () => {
      const item: CommitmentExtractionItem = {
        itemId: 'item-1',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
        ...testScope,
        userText: '我会跟进',
        existingPending: [],
      };

      const candidates = [
        {
          candidate: {
            itemId: 'item-1',
            kind: 'follow_up',
            reason: '待处理测试',
            confidence: 0.8,
            sensitivity: 'normal',
            dedupeKey: 'pending-test',
          },
          earliestMs: Date.now() + 1000,
          latestMs: Date.now() + 2000,
          timezone: 'Asia/Shanghai',
        },
      ];

      await addCommitment({ storePath, item, candidates });

      const pending = await listPendingCommitmentsForScope({
        storePath,
        scope: testScope,
      });

      expect(pending.length).toBeGreaterThan(0);
    });
  });

  describe('applyFilter', () => {
    it('应该按状态过滤', () => {
      const commitments: CommitmentRecord[] = [
        { id: '1', status: 'pending' } as CommitmentRecord,
        { id: '2', status: 'sent' } as CommitmentRecord,
        { id: '3', status: 'completed' } as CommitmentRecord,
      ];

      const filtered = applyFilter(commitments, { status: 'pending' });
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.id).toBe('1');
    });

    it('应该按类型过滤', () => {
      const commitments: CommitmentRecord[] = [
        { id: '1', kind: 'follow_up' } as CommitmentRecord,
        { id: '2', kind: 'reminder' } as CommitmentRecord,
      ];

      const filtered = applyFilter(commitments, { kind: 'reminder' });
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.id).toBe('2');
    });

    it('应该按优先级过滤', () => {
      const commitments: CommitmentRecord[] = [
        { id: '1', priority: 'high' } as CommitmentRecord,
        { id: '2', priority: 'low' } as CommitmentRecord,
      ];

      const filtered = applyFilter(commitments, { priority: 'high' });
      expect(filtered.length).toBe(1);
    });

    it('空过滤器返回全部', () => {
      const commitments = [
        { id: '1' } as CommitmentRecord,
        { id: '2' } as CommitmentRecord,
      ];
      const filtered = applyFilter(commitments, {});
      expect(filtered.length).toBe(2);
    });
  });

  describe('applySort', () => {
    it('应该按创建时间排序', () => {
      const commitments: CommitmentRecord[] = [
        { id: '1', createdAtMs: 100 } as CommitmentRecord,
        { id: '2', createdAtMs: 200 } as CommitmentRecord,
        { id: '3', createdAtMs: 150 } as CommitmentRecord,
      ];

      const sorted = applySort(commitments, { field: 'createdAtMs', order: 'asc' });
      expect(sorted[0]?.id).toBe('1');
      expect(sorted[1]?.id).toBe('3');
      expect(sorted[2]?.id).toBe('2');
    });

    it('应该支持降序排序', () => {
      const commitments: CommitmentRecord[] = [
        { id: '1', createdAtMs: 100 } as CommitmentRecord,
        { id: '2', createdAtMs: 200 } as CommitmentRecord,
      ];

      const sorted = applySort(commitments, { field: 'createdAtMs', order: 'desc' });
      expect(sorted[0]?.id).toBe('2');
    });
  });

  describe('applyPagination', () => {
    it('应该正确分页', () => {
      const commitments = Array.from({ length: 10 }, (_, i) => ({ id: `${i}` })) as CommitmentRecord[];

      const result = applyPagination(commitments, { page: 1, pageSize: 3 });
      expect(result.items.length).toBe(3);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(3);
      expect(result.totalPages).toBe(4);
    });

    it('应该正确计算总页数', () => {
      const commitments = Array.from({ length: 5 }, (_, i) => ({ id: `${i}` })) as CommitmentRecord[];

      const result = applyPagination(commitments, { page: 1, pageSize: 10 });
      expect(result.totalPages).toBe(1);
    });
  });

  describe('getCommitmentStats', () => {
    it('应该返回统计信息', async () => {
      const stats = await getCommitmentStats({ storePath });
      expect(stats.total).toBe(0);
      expect(stats.byStatus).toBeDefined();
      expect(stats.byKind).toBeDefined();
      expect(stats.byPriority).toBeDefined();
    });
  });

  describe('addHeartbeatRecord / getHeartbeatsForCommitment', () => {
    it('应该添加并获取心跳记录', async () => {
      const item: CommitmentExtractionItem = {
        itemId: 'item-1',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
        ...testScope,
        userText: '我会跟进',
        existingPending: [],
      };

      const candidates = [
        {
          candidate: {
            itemId: 'item-1',
            kind: 'follow_up',
            reason: '心跳测试',
            confidence: 0.8,
            sensitivity: 'normal',
            dedupeKey: 'heartbeat-test',
          },
          earliestMs: Date.now() + 1000,
          latestMs: Date.now() + 2000,
          timezone: 'Asia/Shanghai',
        },
      ];

      await addCommitment({ storePath, item, candidates });
      const store = await loadCommitmentStore(storePath);
      const commitmentId = store.commitments[0]?.id!;

      const heartbeat = await addHeartbeatRecord(
        {
          commitmentId,
          heartbeatAtMs: Date.now(),
          status: 'delivered',
        },
        storePath,
      );

      expect(heartbeat.id).toBeDefined();
      expect(heartbeat.commitmentId).toBe(commitmentId);

      const heartbeats = await getHeartbeatsForCommitment(commitmentId, storePath);
      expect(heartbeats.length).toBe(1);
    });
  });

  describe('listCommitments', () => {
    it('应该支持过滤、排序和分页', async () => {
      const result = await listCommitments({
        storePath,
        filter: { status: 'pending' },
        sort: { field: 'createdAtMs', order: 'desc' },
        pagination: { page: 1, pageSize: 10 },
      });

      expect(result.items).toBeDefined();
      expect(result.total).toBeDefined();
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });
  });

  describe('deleteCommitment', () => {
    it('应该删除承诺', async () => {
      const item: CommitmentExtractionItem = {
        itemId: 'item-1',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
        ...testScope,
        userText: '我会跟进',
        existingPending: [],
      };

      const candidates = [
        {
          candidate: {
            itemId: 'item-1',
            kind: 'follow_up',
            reason: '删除测试',
            confidence: 0.8,
            sensitivity: 'normal',
            dedupeKey: 'delete-test',
          },
          earliestMs: Date.now() + 1000,
          latestMs: Date.now() + 2000,
          timezone: 'Asia/Shanghai',
        },
      ];

      await addCommitment({ storePath, item, candidates });
      const store = await loadCommitmentStore(storePath);
      const id = store.commitments[0]?.id!;

      const result = await deleteCommitment(id, storePath);
      expect(result).toBe(true);

      const deleted = await getCommitment(id, storePath);
      expect(deleted).toBeNull();
    });
  });

  describe('updateCommitment', () => {
    it('应该更新承诺字段', async () => {
      const item: CommitmentExtractionItem = {
        itemId: 'item-1',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
        ...testScope,
        userText: '我会跟进',
        existingPending: [],
      };

      const candidates = [
        {
          candidate: {
            itemId: 'item-1',
            kind: 'follow_up',
            reason: '更新测试',
            confidence: 0.8,
            sensitivity: 'normal',
            dedupeKey: 'update-test',
          },
          earliestMs: Date.now() + 1000,
          latestMs: Date.now() + 2000,
          timezone: 'Asia/Shanghai',
        },
      ];

      await addCommitment({ storePath, item, candidates });
      const store = await loadCommitmentStore(storePath);
      const id = store.commitments[0]?.id!;

      const result = await updateCommitment({
        id,
        storePath,
        updates: { reason: '更新后的原因' },
      });

      expect(result).toBe(true);
      const updated = await getCommitment(id, storePath);
      expect(updated?.reason).toBe('更新后的原因');
    });
  });
});
