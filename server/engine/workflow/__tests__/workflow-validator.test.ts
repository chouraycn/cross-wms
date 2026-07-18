/**
 * WorkflowValidator 单元测试
 *
 * 覆盖工作流验证的各项检查：循环依赖、未连接节点、无效引用、配置完整性等。
 */

import { describe, it, expect } from 'vitest';
import { WorkflowValidator } from '../validator.js';
import type { Workflow } from '../types.js';

const validator = new WorkflowValidator();

function createSimpleWorkflow(overrides?: Partial<Workflow>): Workflow {
  return {
    id: 'test-workflow',
    name: '测试工作流',
    description: '测试用工作流',
    version: 1,
    status: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    triggers: [],
    variables: [],
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        name: '触发器',
        config: { type: 'manual' },
        position: { x: 100, y: 100 },
        connections: [{ source: 'trigger-1', target: 'action-1' }],
      },
      {
        id: 'action-1',
        type: 'action',
        name: '动作节点',
        config: { type: 'notification', params: { title: 'test', message: 'test' } },
        position: { x: 300, y: 100 },
        connections: [],
      },
    ],
    ...overrides,
  } as Workflow;
}

describe('WorkflowValidator', () => {
  describe('基本结构验证', () => {
    it('有效工作流应通过验证', () => {
      const workflow = createSimpleWorkflow();
      const result = validator.validate(workflow);
      expect(result.valid).toBe(true);
    });

    it('缺少名称的工作流应报错', () => {
      const workflow = createSimpleWorkflow({ name: '' });
      const result = validator.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('名称'))).toBe(true);
    });

    it('没有节点的工作流应报错', () => {
      const workflow = createSimpleWorkflow({ nodes: [] });
      const result = validator.validate(workflow);
      expect(result.valid).toBe(false);
    });
  });

  describe('触发器节点验证', () => {
    it('没有触发器节点应报错', () => {
      const workflow = createSimpleWorkflow({
        nodes: [
          {
            id: 'action-1',
            type: 'action',
            name: '动作',
            config: {},
            position: { x: 100, y: 100 },
            connections: [],
          },
        ],
      });
      const result = validator.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('触发器'))).toBe(true);
    });
  });

  describe('循环依赖检测', () => {
    it('检测到循环依赖应报错', () => {
      const workflow = createSimpleWorkflow({
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger',
            name: '触发器',
            config: { type: 'manual' },
            position: { x: 100, y: 100 },
            connections: [{ source: 'trigger-1', target: 'node-a' }],
          },
          {
            id: 'node-a',
            type: 'action',
            name: '节点A',
            config: {},
            position: { x: 300, y: 100 },
            connections: [{ source: 'node-a', target: 'node-b' }],
          },
          {
            id: 'node-b',
            type: 'action',
            name: '节点B',
            config: {},
            position: { x: 500, y: 100 },
            connections: [{ source: 'node-b', target: 'node-a' }],
          },
        ],
      });
      const result = validator.validate(workflow);
      expect(result.errors.some(e => e.message.includes('循环依赖'))).toBe(true);
    });

    it('无循环依赖的工作流应通过', () => {
      const workflow = createSimpleWorkflow();
      const result = validator.validate(workflow);
      expect(result.errors.some(e => e.message.includes('循环依赖'))).toBe(false);
    });
  });

  describe('未连接节点检测', () => {
    it('未连接节点应发出警告', () => {
      const workflow = createSimpleWorkflow({
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger',
            name: '触发器',
            config: { type: 'manual' },
            position: { x: 100, y: 100 },
            connections: [{ source: 'trigger-1', target: 'action-1' }],
          },
          {
            id: 'action-1',
            type: 'action',
            name: '动作1',
            config: {},
            position: { x: 300, y: 100 },
            connections: [],
          },
          {
            id: 'action-2',
            type: 'action',
            name: '孤立节点',
            config: {},
            position: { x: 500, y: 300 },
            connections: [],
          },
        ],
      });
      const result = validator.validate(workflow);
      expect(result.warnings.some(w => w.message.includes('未连接'))).toBe(true);
    });
  });

  describe('无效引用检测', () => {
    it('连接目标不存在应报错', () => {
      const workflow = createSimpleWorkflow({
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger',
            name: '触发器',
            config: { type: 'manual' },
            position: { x: 100, y: 100 },
            connections: [{ source: 'trigger-1', target: 'nonexistent' }],
          },
        ],
      });
      const result = validator.validate(workflow);
      expect(result.errors.some(e => e.message.includes('连接目标不存在'))).toBe(true);
    });

    it('条件节点分支引用无效应报错', () => {
      const workflow = createSimpleWorkflow({
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger',
            name: '触发器',
            config: { type: 'manual' },
            position: { x: 100, y: 100 },
            connections: [{ source: 'trigger-1', target: 'cond-1' }],
          },
          {
            id: 'cond-1',
            type: 'condition',
            name: '条件',
            config: {
              conditions: [],
              logic: 'and',
              branches: { true: 'nonexistent-true', false: 'nonexistent-false' },
            },
            position: { x: 300, y: 100 },
            connections: [],
          },
        ],
      });
      const result = validator.validate(workflow);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('配置完整性验证', () => {
    it('脚本节点缺少代码应报错', () => {
      const workflow = createSimpleWorkflow({
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger',
            name: '触发器',
            config: { type: 'manual' },
            position: { x: 100, y: 100 },
            connections: [{ source: 'trigger-1', target: 'script-1' }],
          },
          {
            id: 'script-1',
            type: 'script',
            name: '脚本节点',
            config: {},
            position: { x: 300, y: 100 },
            connections: [],
          },
        ],
      });
      const result = validator.validate(workflow);
      expect(result.errors.some(e => e.message.includes('脚本节点缺少代码'))).toBe(true);
    });

    it('Switch 节点缺少表达式应报错', () => {
      const workflow = createSimpleWorkflow({
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger',
            name: '触发器',
            config: { type: 'manual' },
            position: { x: 100, y: 100 },
            connections: [{ source: 'trigger-1', target: 'switch-1' }],
          },
          {
            id: 'switch-1',
            type: 'switch',
            name: 'Switch 节点',
            config: { cases: [] },
            position: { x: 300, y: 100 },
            connections: [],
          },
        ],
      });
      const result = validator.validate(workflow);
      expect(result.errors.some(e => e.message.includes('缺少条件表达式'))).toBe(true);
    });
  });
});
