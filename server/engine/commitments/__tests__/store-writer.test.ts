import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  CommitmentStoreWriter,
  CommitmentStoreWriterManager,
  loadCommitmentStore,
} from '../index.js';
import type { CommitmentScope, CommitmentCandidate } from '../index.js';

describe('store-writer', () => {
  let testDir: string;
  let storePath: string;
  let testScope: CommitmentScope;

  beforeEach(async () => {
    testDir = join(tmpdir(), `commitments-writer-test-${randomUUID()}`);
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

  describe('CommitmentStoreWriter', () => {
    it('应该创建存储写入器实例', () => {
      const writer = new CommitmentStoreWriter({ storePath });
      expect(writer).toBeDefined();
      expect(typeof writer.addCommitment).toBe('function');
      expect(typeof writer.flush).toBe('function');
    });

    it('应该写入承诺到存储', async () => {
      const writer = new CommitmentStoreWriter({ storePath, debounceMs: 0 });
      const nowMs = Date.now();
      const candidate: CommitmentCandidate = {
        itemId: 'item-1',
        kind: 'deadline_check',
        sensitivity: 'routine',
        source: 'inferred_user_context',
        priority: 'medium',
        reason: '测试写入',
        suggestedText: '提醒测试写入',
        dedupeKey: 'deadline_check:测试写入',
        confidence: 0.8,
        dueWindow: {
          earliest: new Date(nowMs + 1000).toISOString(),
          latest: new Date(nowMs + 100000).toISOString(),
          timezone: 'Asia/Shanghai',
        },
      };

      await writer.addCommitment({
        candidate,
        scope: testScope,
        itemId: 'item-1',
        earliestMs: nowMs + 1000,
        latestMs: nowMs + 100000,
        timezone: 'Asia/Shanghai',
        nowMs,
      });
      await writer.flush();

      const data = await loadCommitmentStore(storePath);
      expect(data.commitments.length).toBe(1);
      expect(data.commitments[0].reason).toBe('测试写入');
    });

    it('应该支持批处理写入', async () => {
      const writer = new CommitmentStoreWriter({ storePath, debounceMs: 0 });
      const nowMs = Date.now();

      for (let i = 0; i < 5; i++) {
        const candidate: CommitmentCandidate = {
          itemId: `item-${i}`,
          kind: 'deadline_check',
          sensitivity: 'routine',
          source: 'inferred_user_context',
          priority: 'medium',
          reason: `测试承诺 ${i}`,
          suggestedText: `提醒测试承诺 ${i}`,
          dedupeKey: `deadline_check:测试承诺 ${i}`,
          confidence: 0.8,
          dueWindow: {
            earliest: new Date(nowMs + 1000).toISOString(),
            latest: new Date(nowMs + 100000).toISOString(),
            timezone: 'Asia/Shanghai',
          },
        };
        await writer.addCommitment({
          candidate,
          scope: testScope,
          itemId: `item-${i}`,
          earliestMs: nowMs + 1000,
          latestMs: nowMs + 100000,
          timezone: 'Asia/Shanghai',
          nowMs,
        });
      }

      await writer.flush();

      const data = await loadCommitmentStore(storePath);
      expect(data.commitments.length).toBe(5);
    });

    it('应该支持去重', async () => {
      const writer = new CommitmentStoreWriter({ storePath, debounceMs: 0 });
      const nowMs = Date.now();
      const candidate: CommitmentCandidate = {
        itemId: 'item-1',
        kind: 'deadline_check',
        sensitivity: 'routine',
        source: 'inferred_user_context',
        priority: 'medium',
        reason: '去重测试',
        suggestedText: '提醒去重测试',
        dedupeKey: 'deadline_check:去重测试',
        confidence: 0.8,
        dueWindow: {
          earliest: new Date(nowMs + 1000).toISOString(),
          latest: new Date(nowMs + 100000).toISOString(),
          timezone: 'Asia/Shanghai',
        },
      };

      await writer.addCommitment({
        candidate,
        scope: testScope,
        itemId: 'item-1',
        earliestMs: nowMs + 1000,
        latestMs: nowMs + 100000,
        timezone: 'Asia/Shanghai',
        nowMs,
      });
      await writer.addCommitment({
        candidate,
        scope: testScope,
        itemId: 'item-1',
        earliestMs: nowMs + 1000,
        latestMs: nowMs + 100000,
        timezone: 'Asia/Shanghai',
        nowMs: nowMs + 100,
      });
      await writer.flush();

      const data = await loadCommitmentStore(storePath);
      expect(data.commitments.length).toBe(1);
    });

    it('getStats 应该返回统计信息', () => {
      const writer = new CommitmentStoreWriter({ storePath });
      const stats = writer.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.totalWrites).toBe('number');
      expect(typeof stats.successfulWrites).toBe('number');
    });

    it('shutdown 应该关闭写入器', async () => {
      const writer = new CommitmentStoreWriter({ storePath, debounceMs: 100 });
      await writer.shutdown();
      expect(writer.isShutdownStatus()).toBe(true);
    });

    it('原子写入应该工作', async () => {
      const writer = new CommitmentStoreWriter({
        storePath,
        debounceMs: 0,
        atomicWrites: true,
      });
      const nowMs = Date.now();
      const candidate: CommitmentCandidate = {
        itemId: 'item-1',
        kind: 'deadline_check',
        sensitivity: 'routine',
        source: 'inferred_user_context',
        priority: 'medium',
        reason: '原子写入测试',
        suggestedText: '提醒原子写入测试',
        dedupeKey: 'deadline_check:原子写入测试',
        confidence: 0.8,
        dueWindow: {
          earliest: new Date(nowMs + 1000).toISOString(),
          latest: new Date(nowMs + 100000).toISOString(),
          timezone: 'Asia/Shanghai',
        },
      };

      await writer.addCommitment({
        candidate,
        scope: testScope,
        itemId: 'item-1',
        earliestMs: nowMs + 1000,
        latestMs: nowMs + 100000,
        timezone: 'Asia/Shanghai',
        nowMs,
      });
      await writer.flush();

      const content = await readFile(storePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.commitments.length).toBe(1);
    });
  });

  describe('CommitmentStoreWriterManager', () => {
    it('应该创建管理器实例', () => {
      const manager = new CommitmentStoreWriterManager();
      expect(manager).toBeDefined();
      expect(typeof manager.getWriter).toBe('function');
    });

    it('应该为相同路径返回相同的写入器', () => {
      const manager = new CommitmentStoreWriterManager();
      const writer1 = manager.getWriter(storePath);
      const writer2 = manager.getWriter(storePath);
      expect(writer1).toBe(writer2);
    });

    it('应该支持不同路径的不同写入器', () => {
      const manager = new CommitmentStoreWriterManager();
      const path1 = join(testDir, 'store1.json');
      const path2 = join(testDir, 'store2.json');
      const writer1 = manager.getWriter(path1);
      const writer2 = manager.getWriter(path2);
      expect(writer1).not.toBe(writer2);
    });

    it('shutdownAll 应该关闭所有写入器', async () => {
      const manager = new CommitmentStoreWriterManager();
      const path1 = join(testDir, 'store1.json');
      const path2 = join(testDir, 'store2.json');
      manager.getWriter(path1);
      manager.getWriter(path2);
      await manager.shutdownAll();
      expect(manager.getWriterCount()).toBe(2);
    });
  });
});
