// @vitest-environment node

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TranscriptManager,
  getGlobalTranscriptManager,
  setGlobalTranscriptManager,
  createTranscriptManager,
  type CompactionCheckpoint,
} from '../compaction-transcript.js';

describe('compaction-transcript', () => {
  let manager: TranscriptManager;

  beforeEach(() => {
    manager = new TranscriptManager();
  });

  const testCheckpoint: CompactionCheckpoint = {
    sessionId: 'session-1',
    sessionFile: '/path/to/session.json',
    position: 10,
    messageCount: 100,
    tokenCount: 5000,
    timestamp: Date.now(),
    reason: 'budget',
    summary: 'test summary',
  };

  describe('createCheckpoint', () => {
    it('应该创建检查点', () => {
      manager.createCheckpoint(testCheckpoint);
      const latest = manager.getLatestCheckpoint('session-1');
      expect(latest).toEqual(testCheckpoint);
    });

    it('应该按顺序存储多个检查点', () => {
      for (let i = 0; i < 5; i++) {
        manager.createCheckpoint({
          ...testCheckpoint,
          position: i * 10,
          messageCount: i * 20,
        });
      }
      const checkpoints = manager.getCheckpoints('session-1');
      expect(checkpoints.length).toBe(5);
      expect(checkpoints[4].position).toBe(40);
    });
  });

  describe('getLatestCheckpoint', () => {
    it('没有检查点时应该返回 null', () => {
      const latest = manager.getLatestCheckpoint('nonexistent');
      expect(latest).toBeNull();
    });

    it('应该返回最新的检查点', () => {
      manager.createCheckpoint({ ...testCheckpoint, position: 10 });
      manager.createCheckpoint({ ...testCheckpoint, position: 20 });
      const latest = manager.getLatestCheckpoint('session-1');
      expect(latest?.position).toBe(20);
    });
  });

  describe('getCheckpoints', () => {
    it('空会话应该返回空数组', () => {
      expect(manager.getCheckpoints('nonexistent')).toEqual([]);
    });

    it('应该返回所有检查点', () => {
      manager.createCheckpoint(testCheckpoint);
      manager.createCheckpoint({ ...testCheckpoint, position: 20 });
      expect(manager.getCheckpoints('session-1').length).toBe(2);
    });
  });

  describe('clearCheckpoints', () => {
    it('应该清空会话检查点', () => {
      manager.createCheckpoint(testCheckpoint);
      manager.clearCheckpoints('session-1');
      expect(manager.getCheckpoints('session-1')).toEqual([]);
    });
  });

  describe('转录本轮换', () => {
    it('应该启用轮换', () => {
      manager.enableRotation('session-1', 'file.json');
      const rotation = manager.getRotation('session-1');
      expect(rotation?.enabled).toBe(true);
      expect(rotation?.currentFile).toBe('file.json');
      expect(rotation?.rotationIndex).toBe(0);
    });

    it('应该执行轮换', () => {
      manager.enableRotation('session-1', 'file-1.json');
      manager.rotateTranscript('session-1', 'file-2.json');

      const rotation = manager.getRotation('session-1');
      expect(rotation?.rotationIndex).toBe(1);
      expect(rotation?.currentFile).toBe('file-2.json');
      expect(rotation?.archivedFiles.length).toBe(1);
      expect(rotation?.archivedFiles[0]).toBe('file-1.json');
    });

    it('未启用轮换时 rotate 应该警告', () => {
      // 不应该抛出
      expect(() => manager.rotateTranscript('nonexistent', 'new.json')).not.toThrow();
    });
  });

  describe('shouldRotate', () => {
    it('没有检查点时不应该轮换', () => {
      const should = manager.shouldRotate('session-1');
      expect(should).toBe(false);
    });

    it('消息数超过阈值时应该轮换', () => {
      manager.createCheckpoint({
        ...testCheckpoint,
        messageCount: 2000,
        tokenCount: 5000,
      });
      const should = manager.shouldRotate('session-1', { maxMessages: 1000 });
      expect(should).toBe(true);
    });
  });

  describe('getSessionStats', () => {
    it('应该返回会话统计', () => {
      manager.createCheckpoint(testCheckpoint);
      manager.createCheckpoint({ ...testCheckpoint, position: 20 });

      const stats = manager.getSessionStats('session-1');
      expect(stats.checkpointCount).toBe(2);
      expect(stats.rotationEnabled).toBe(false);
      expect(stats.rotationIndex).toBe(0);
      expect(stats.archivedCount).toBe(0);
    });
  });

  describe('cleanupSession', () => {
    it('应该清理会话数据', () => {
      manager.createCheckpoint(testCheckpoint);
      manager.enableRotation('session-1', 'file.json');
      manager.cleanupSession('session-1');

      expect(manager.getCheckpoints('session-1')).toEqual([]);
      expect(manager.getRotation('session-1')).toBeNull();
    });
  });

  describe('全局管理器', () => {
    it('应该获取全局管理器', () => {
      const mgr = getGlobalTranscriptManager();
      expect(mgr).toBeInstanceOf(TranscriptManager);
    });

    it('应该设置全局管理器', () => {
      const newMgr = new TranscriptManager();
      setGlobalTranscriptManager(newMgr);
      expect(getGlobalTranscriptManager()).toBe(newMgr);
    });
  });

  describe('createTranscriptManager', () => {
    it('应该创建新的管理器实例', () => {
      const mgr = createTranscriptManager();
      expect(mgr).toBeInstanceOf(TranscriptManager);
    });
  });
});
