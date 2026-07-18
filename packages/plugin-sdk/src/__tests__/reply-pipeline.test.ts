/**
 * ReplyPipeline 契约测试
 *
 * 覆盖回复处理流水线：
 * - 处理消息
 * - 添加阶段
 * - 移除阶段
 */

import { describe, it, expect, vi } from 'vitest';
import { ReplyPipeline } from '../reply-pipeline.js';
import type { ReplyMessage, PipelineStage } from '../types.js';

describe('ReplyPipeline Contract', () => {
  describe('process', () => {
    it('处理消息返回回复', async () => {
      const pipeline = new ReplyPipeline();
      const message: ReplyMessage = {
        id: 'msg-1',
        content: 'Hello',
        role: 'assistant',
        timestamp: Date.now(),
      };

      const reply = await pipeline.process(message);

      expect(reply.id).toMatch(/^reply-/);
      expect(reply.message.content).toBe('Hello');
      expect(reply.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('触发 pipeline_started 事件', async () => {
      const pipeline = new ReplyPipeline();
      const handler = vi.fn();
      pipeline.on('pipeline_started', handler);

      const message: ReplyMessage = {
        id: 'msg-start',
        content: 'test',
        role: 'assistant',
        timestamp: Date.now(),
      };
      await pipeline.process(message);

      expect(handler).toHaveBeenCalledWith(message);
    });

    it('触发 pipeline_completed 事件', async () => {
      const pipeline = new ReplyPipeline();
      const handler = vi.fn();
      pipeline.on('pipeline_completed', handler);

      const message: ReplyMessage = {
        id: 'msg-complete',
        content: 'test',
        role: 'assistant',
        timestamp: Date.now(),
      };
      await pipeline.process(message);

      expect(handler).toHaveBeenCalled();
    });

    it('无阶段时返回原消息', async () => {
      const pipeline = new ReplyPipeline();
      const message: ReplyMessage = {
        id: 'msg-original',
        content: 'original',
        role: 'assistant',
        timestamp: Date.now(),
      };

      const reply = await pipeline.process(message);

      expect(reply.message.content).toBe('original');
      expect(reply.stages).toHaveLength(0);
    });
  });

  describe('addStage', () => {
    it('添加处理阶段', () => {
      const pipeline = new ReplyPipeline();
      const stage: PipelineStage = {
        id: 'stage-1',
        name: 'Test Stage',
        process: async (msg) => msg,
      };

      pipeline.addStage(stage);

      expect(pipeline.hasStage('stage-1')).toBe(true);
    });

    it('触发 stage_added 事件', () => {
      const pipeline = new ReplyPipeline();
      const handler = vi.fn();
      pipeline.on('stage_added', handler);

      const stage: PipelineStage = {
        id: 'stage-add',
        name: 'Add Stage',
        process: async (msg) => msg,
      };
      pipeline.addStage(stage);

      expect(handler).toHaveBeenCalledWith(stage);
    });

    it('重复添加相同 ID 阶段抛出错误', () => {
      const pipeline = new ReplyPipeline();
      const stage: PipelineStage = {
        id: 'dup-stage',
        name: 'Duplicate',
        process: async (msg) => msg,
      };

      pipeline.addStage(stage);
      expect(() => pipeline.addStage(stage)).toThrow('already exists');
    });

    it('阶段按优先级排序执行', async () => {
      const pipeline = new ReplyPipeline();
      const order: string[] = [];

      const stage1: PipelineStage = {
        id: 'low',
        name: 'Low Priority',
        priority: 1,
        process: async (msg) => {
          order.push('low');
          return msg;
        },
      };

      const stage2: PipelineStage = {
        id: 'high',
        name: 'High Priority',
        priority: 10,
        process: async (msg) => {
          order.push('high');
          return msg;
        },
      };

      pipeline.addStage(stage1);
      pipeline.addStage(stage2);

      const message: ReplyMessage = {
        id: 'msg-order',
        content: 'test',
        role: 'assistant',
        timestamp: Date.now(),
      };
      await pipeline.process(message);

      // 高优先级先执行
      expect(order[0]).toBe('high');
      expect(order[1]).toBe('low');
    });

    it('禁用的阶段不执行', async () => {
      const pipeline = new ReplyPipeline();
      const handler = vi.fn();

      const stage: PipelineStage = {
        id: 'disabled',
        name: 'Disabled Stage',
        enabled: false,
        process: handler,
      };

      pipeline.addStage(stage);

      const message: ReplyMessage = {
        id: 'msg-disabled',
        content: 'test',
        role: 'assistant',
        timestamp: Date.now(),
      };
      await pipeline.process(message);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('removeStage', () => {
    it('移除存在的阶段', () => {
      const pipeline = new ReplyPipeline();
      const stage: PipelineStage = {
        id: 'remove-test',
        name: 'Remove Test',
        process: async (msg) => msg,
      };

      pipeline.addStage(stage);
      pipeline.removeStage('remove-test');

      expect(pipeline.hasStage('remove-test')).toBe(false);
    });

    it('触发 stage_removed 事件', () => {
      const pipeline = new ReplyPipeline();
      const handler = vi.fn();
      pipeline.on('stage_removed', handler);

      const stage: PipelineStage = {
        id: 'remove-evt',
        name: 'Remove Event',
        process: async (msg) => msg,
      };
      pipeline.addStage(stage);
      pipeline.removeStage('remove-evt');

      expect(handler).toHaveBeenCalledWith('remove-evt');
    });

    it('移除不存在的阶段不报错', () => {
      const pipeline = new ReplyPipeline();
      expect(() => pipeline.removeStage('nonexistent')).not.toThrow();
    });
  });

  describe('错误处理', () => {
    it('阶段错误触发 pipeline_error 事件', async () => {
      const pipeline = new ReplyPipeline();
      const handler = vi.fn();
      pipeline.on('pipeline_error', handler);

      const stage: PipelineStage = {
        id: 'error-stage',
        name: 'Error Stage',
        process: async () => {
          throw new Error('Stage error');
        },
      };

      pipeline.addStage(stage);

      const message: ReplyMessage = {
        id: 'msg-error',
        content: 'test',
        role: 'assistant',
        timestamp: Date.now(),
      };
      await pipeline.process(message);

      expect(handler).toHaveBeenCalled();
    });

    it('阶段错误后继续处理', async () => {
      const pipeline = new ReplyPipeline();
      let nextStageCalled = false;

      const errorStage: PipelineStage = {
        id: 'error',
        name: 'Error Stage',
        process: async () => {
          throw new Error('Error');
        },
      };

      const nextStage: PipelineStage = {
        id: 'next',
        name: 'Next Stage',
        priority: 0,
        process: async (msg) => {
          nextStageCalled = true;
          return msg;
        },
      };

      pipeline.addStage(errorStage);
      pipeline.addStage(nextStage);

      const message: ReplyMessage = {
        id: 'msg-continue',
        content: 'test',
        role: 'assistant',
        timestamp: Date.now(),
      };
      await pipeline.process(message);

      expect(nextStageCalled).toBe(true);
    });
  });

  describe('clear', () => {
    it('清空所有阶段', () => {
      const pipeline = new ReplyPipeline();

      pipeline.addStage({
        id: 'clear-1',
        name: 'Stage 1',
        process: async (msg) => msg,
      });
      pipeline.addStage({
        id: 'clear-2',
        name: 'Stage 2',
        process: async (msg) => msg,
      });

      pipeline.clear();

      expect(pipeline.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('返回阶段数量', () => {
      const pipeline = new ReplyPipeline();

      expect(pipeline.size()).toBe(0);

      pipeline.addStage({
        id: 'size-test',
        name: 'Size Test',
        process: async (msg) => msg,
      });

      expect(pipeline.size()).toBe(1);
    });
  });
});