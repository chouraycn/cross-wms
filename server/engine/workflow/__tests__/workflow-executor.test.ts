/**
 * WorkflowExecutor 单元测试
 *
 * 覆盖工作流执行器的核心功能：基本执行、变量传递、延迟节点、
 * 脚本节点、转换节点、Switch 节点、子工作流、重试、超时等。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Workflow, WorkflowNode } from '../types.js';

const { mockLogger, mockUuid, mockCallAIModel, mockExecuteToolCall,
  mockAbortPrimitives, mockCreateRunAbortController, mockToolFallbackManager,
  mockToolSendReceipts, mockToolExecutionQueue, mockExecuteToolCallWithRetry,
  mockExecuteToolCallWithTimeout, mockExecuteToolCallWithMiddleware,
  mockToolExecutionStats, mockToolAuditLog, mockGuardToolResultContext } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockUuid: vi.fn(() => 'test-uuid'),
  mockCallAIModel: vi.fn(),
  mockExecuteToolCall: vi.fn(),
  mockAbortPrimitives: { release: vi.fn(), abort: vi.fn() },
  mockCreateRunAbortController: vi.fn(() => ({ signal: { aborted: false } })),
  mockToolFallbackManager: { checkAndFallback: vi.fn((name) => name) },
  mockToolSendReceipts: { createReceipt: vi.fn(), completeReceipt: vi.fn(), failReceipt: vi.fn() },
  mockToolExecutionQueue: { enqueue: vi.fn((_task, executor) => executor(new AbortController().signal)) },
  mockExecuteToolCallWithRetry: vi.fn((_name, fn) => fn().then((result: unknown) => ({ result, retryCount: 0 }))),
  mockExecuteToolCallWithTimeout: vi.fn((_name, fn) => fn()),
  mockExecuteToolCallWithMiddleware: vi.fn((_name, result) => ({ content: result, errorType: 'none' as const, truncated: false })),
  mockToolExecutionStats: { record: vi.fn() },
  mockToolAuditLog: { log: vi.fn() },
  mockGuardToolResultContext: vi.fn((result) => result),
}));

vi.mock('../../../logger.js', () => ({ logger: mockLogger }));
vi.mock('uuid', () => ({ v4: mockUuid }));
vi.mock('../../../aiClient.js', () => ({ callAIModel: mockCallAIModel }));
vi.mock('../../toolRegistry.js', () => ({ executeToolCall: mockExecuteToolCall }));
vi.mock('../../abortPrimitives.js', () => ({
  abortPrimitives: mockAbortPrimitives,
  createRunAbortController: mockCreateRunAbortController,
}));
vi.mock('../../toolFallbackStrategy.js', () => ({ toolFallbackManager: mockToolFallbackManager }));
vi.mock('../../toolSendReceipts.js', () => ({ toolSendReceipts: mockToolSendReceipts }));
vi.mock('../../toolExecutionQueue.js', () => ({ toolExecutionQueue: mockToolExecutionQueue }));
vi.mock('../../toolRetryWrapper.js', () => ({ executeToolCallWithRetry: mockExecuteToolCallWithRetry }));
vi.mock('../../toolTimeoutWrapper.js', () => ({ executeToolCallWithTimeout: mockExecuteToolCallWithTimeout }));
vi.mock('../../toolResultMiddleware.js', () => ({ executeToolCallWithMiddleware: mockExecuteToolCallWithMiddleware }));
vi.mock('../../toolExecutionStats.js', () => ({ toolExecutionStats: mockToolExecutionStats }));
vi.mock('../../toolAuditLog.js', () => ({ toolAuditLog: mockToolAuditLog }));
vi.mock('../../toolContextGuard.js', () => ({ guardToolResultContext: mockGuardToolResultContext }));

import { WorkflowExecutor } from '../executor.js';

function createTestWorkflow(nodes: WorkflowNode[]): Workflow {
  return {
    id: 'test-wf',
    name: '测试工作流',
    description: '',
    version: 1,
    status: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    triggers: [],
    variables: [],
    nodes,
  };
}

describe('WorkflowExecutor', () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    executor = new WorkflowExecutor();
    vi.clearAllMocks();
    mockUuid.mockReturnValue('test-uuid-' + Math.random());
  });

  describe('基本执行', () => {
    it('应成功执行简单的触发器到动作工作流', async () => {
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [{ source: 'trigger-1', target: 'action-1' }],
        },
        {
          id: 'action-1',
          type: 'action',
          name: '通知',
          config: { type: 'notification', params: { title: 'Hi', message: 'Hello' } },
          position: { x: 200, y: 0 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual');
      const execution = executor.getExecution(execId);

      expect(execution).toBeDefined();
      expect(execution?.status).toBe('success');
      expect(execution?.nodeExecutions.length).toBe(2);
    });

    it('没有触发器节点应标记为失败', async () => {
      const workflow = createTestWorkflow([
        {
          id: 'action-1',
          type: 'action',
          name: '动作',
          config: {},
          position: { x: 0, y: 0 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual');
      const execution = executor.getExecution(execId);

      expect(execution?.status).toBe('failed');
      expect(execution?.error).toContain('触发器节点');
    });
  });

  describe('变量上下文', () => {
    it('应正确传递初始变量', async () => {
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual', undefined, { myVar: 'hello' });
      const execution = executor.getExecution(execId);

      expect(execution?.variables.myVar).toBe('hello');
    });

    it('节点输出应合并到变量上下文中', async () => {
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual');
      const varCtx = executor.getVariableContext(execId);

      expect(varCtx?.get('triggered')).toBe(true);
    });
  });

  describe('延迟节点', () => {
    it('延迟节点应正确等待', async () => {
      const startTime = Date.now();
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [{ source: 'trigger-1', target: 'delay-1' }],
        },
        {
          id: 'delay-1',
          type: 'delay',
          name: '延迟',
          config: { duration: 50 },
          position: { x: 200, y: 0 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual');
      const execution = executor.getExecution(execId);
      const duration = Date.now() - startTime;

      expect(execution?.status).toBe('success');
      expect(duration).toBeGreaterThanOrEqual(40);
    });
  });

  describe('脚本节点', () => {
    it('脚本节点应执行 JavaScript 代码', async () => {
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [{ source: 'trigger-1', target: 'script-1' }],
        },
        {
          id: 'script-1',
          type: 'script',
          name: '脚本',
          config: { language: 'javascript', code: 'return x * 2;' },
          position: { x: 200, y: 0 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual', undefined, { x: 21 });
      const varCtx = executor.getVariableContext(execId);

      expect(varCtx?.get('result')).toBe(42);
    });
  });

  describe('数据转换节点', () => {
    it('应正确执行数据转换', async () => {
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [{ source: 'trigger-1', target: 'transform-1' }],
        },
        {
          id: 'transform-1',
          type: 'transform',
          name: '转换',
          config: {
            mappings: [
              { source: 'inputName', target: 'outputName', transform: 'uppercase' },
              { source: 'inputNum', target: 'outputNum', transform: 'number' },
            ],
          },
          position: { x: 200, y: 0 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual', undefined, {
        inputName: 'hello',
        inputNum: '42',
      });
      const varCtx = executor.getVariableContext(execId);

      expect(varCtx?.get('outputName')).toBe('HELLO');
      expect(varCtx?.get('outputNum')).toBe(42);
    });
  });

  describe('Switch 节点', () => {
    it('应根据表达式值选择正确的分支', async () => {
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [{ source: 'trigger-1', target: 'switch-1' }],
        },
        {
          id: 'switch-1',
          type: 'switch',
          name: '分支',
          config: {
            expression: 'status',
            cases: [
              { value: 'success', targetNodeId: 'action-success' },
              { value: 'error', targetNodeId: 'action-error' },
            ],
            defaultTargetNodeId: 'action-default',
          },
          position: { x: 200, y: 0 },
          connections: [],
        },
        {
          id: 'action-success',
          type: 'action',
          name: '成功分支',
          config: { type: 'notification', params: { title: 'success', message: 'ok' } },
          position: { x: 400, y: -50 },
          connections: [],
        },
        {
          id: 'action-error',
          type: 'action',
          name: '错误分支',
          config: { type: 'notification', params: { title: 'error', message: 'err' } },
          position: { x: 400, y: 50 },
          connections: [],
        },
        {
          id: 'action-default',
          type: 'action',
          name: '默认分支',
          config: { type: 'notification', params: { title: 'default', message: 'def' } },
          position: { x: 400, y: 150 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual', undefined, { status: 'success' });
      const execution = executor.getExecution(execId);
      const nodeNames = execution?.nodeExecutions.map(e => e.nodeName);

      expect(nodeNames).toContain('成功分支');
      expect(nodeNames).not.toContain('错误分支');
    });
  });

  describe('重试机制', () => {
    it('节点失败时应根据重试策略重试', async () => {
      let nodeCallCount = 0;
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [{ source: 'trigger-1', target: 'script-1' }],
        },
        {
          id: 'script-1',
          type: 'script',
          name: '会失败的脚本',
          config: {
            language: 'javascript',
            code: 'return "test";',
          },
          retryPolicy: {
            maxRetries: 3,
            retryDelay: 10,
          },
          position: { x: 200, y: 0 },
          connections: [],
        },
      ]);

      const originalExecuteNodeByType = (executor as any).executeNodeByType?.bind(executor);
      (executor as any).executeNodeByType = function(workflow: any, node: any, context: any, variableCtx: any) {
        if (node.id === 'script-1') {
          nodeCallCount++;
          if (nodeCallCount < 3) {
            throw new Error('fail');
          }
          return { success: true };
        }
        return originalExecuteNodeByType(workflow, node, context, variableCtx);
      };

      const execId = await executor.execute(workflow, 'manual');
      const execution = executor.getExecution(execId);
      const nodeExec = execution?.nodeExecutions.find(n => n.nodeId === 'script-1');

      expect(execution?.status).toBe('success');
      expect(nodeExec?.retryCount).toBe(2);
      expect(nodeCallCount).toBe(3);
    });
  });

  describe('超时控制', () => {
    it('节点执行超过超时时间应失败', async () => {
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [{ source: 'trigger-1', target: 'delay-1' }],
        },
        {
          id: 'delay-1',
          type: 'delay',
          name: '长延迟',
          config: { duration: 500 },
          timeout: 50,
          position: { x: 200, y: 0 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual');
      const execution = executor.getExecution(execId);

      expect(execution?.status).toBe('failed');
      expect(execution?.error).toContain('超时');
    });
  });

  describe('执行追踪', () => {
    it('应记录执行追踪事件', async () => {
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual');
      const tracer = executor.getTracer();
      const events = tracer.getEvents(execId);

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'workflow_start')).toBe(true);
      expect(events.some(e => e.type === 'workflow_complete')).toBe(true);
      expect(events.some(e => e.type === 'node_start')).toBe(true);
      expect(events.some(e => e.type === 'node_complete')).toBe(true);
    });
  });

  describe('子工作流', () => {
    it('应支持调用子工作流', async () => {
      const subWorkflow = createTestWorkflow([
        {
          id: 'sub-trigger',
          type: 'trigger',
          name: '子开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [],
        },
      ]);
      subWorkflow.id = 'sub-wf-id';

      const parentWorkflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [{ source: 'trigger-1', target: 'sub-1' }],
        },
        {
          id: 'sub-1',
          type: 'subworkflow',
          name: '子工作流',
          config: {
            workflowId: 'sub-wf-id',
          },
          position: { x: 200, y: 0 },
          connections: [],
        },
      ]);

      executor.setSubWorkflowLoader('test', async (id) => {
        if (id === 'sub-wf-id') return subWorkflow;
        return null;
      });

      const execId = await executor.execute(parentWorkflow, 'manual');
      const execution = executor.getExecution(execId);

      expect(execution?.status).toBe('success');
    });
  });

  describe('禁用节点', () => {
    it('已禁用的节点应被跳过', async () => {
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [{ source: 'trigger-1', target: 'action-1' }],
        },
        {
          id: 'action-1',
          type: 'action',
          name: '已禁用',
          config: { type: 'notification', params: { title: 'test', message: 'test' } },
          enabled: false,
          position: { x: 200, y: 0 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual');
      const execution = executor.getExecution(execId);
      const nodeNames = execution?.nodeExecutions.map(e => e.nodeName);

      expect(nodeNames).not.toContain('已禁用');
    });
  });

  describe('条件节点', () => {
    it('条件节点应根据变量值选择分支', async () => {
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [{ source: 'trigger-1', target: 'cond-1' }],
        },
        {
          id: 'cond-1',
          type: 'condition',
          name: '条件',
          config: {
            conditions: [{ variable: 'value', operator: 'greater_than', value: 10 }],
            logic: 'and',
            branches: {
              true: 'action-true',
              false: 'action-false',
            },
          },
          position: { x: 200, y: 0 },
          connections: [],
        },
        {
          id: 'action-true',
          type: 'action',
          name: '真分支',
          config: { type: 'notification', params: { title: 'T', message: 'T' } },
          position: { x: 400, y: -50 },
          connections: [],
        },
        {
          id: 'action-false',
          type: 'action',
          name: '假分支',
          config: { type: 'notification', params: { title: 'F', message: 'F' } },
          position: { x: 400, y: 50 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual', undefined, { value: 15 });
      const execution = executor.getExecution(execId);
      const nodeNames = execution?.nodeExecutions.map(e => e.nodeName);

      expect(nodeNames).toContain('真分支');
      expect(nodeNames).not.toContain('假分支');
    });
  });

  describe('合并节点', () => {
    it('Merge 节点 first 模式应取第一个输入', async () => {
      const workflow = createTestWorkflow([
        {
          id: 'trigger-1',
          type: 'trigger',
          name: '开始',
          config: { type: 'manual' },
          position: { x: 0, y: 0 },
          connections: [{ source: 'trigger-1', target: 'merge-1' }],
        },
        {
          id: 'merge-1',
          type: 'merge',
          name: '合并',
          config: { mode: 'first', mergeStrategy: 'first' },
          position: { x: 200, y: 0 },
          connections: [],
        },
      ]);

      const execId = await executor.execute(workflow, 'manual');
      const execution = executor.getExecution(execId);
      const varCtx = executor.getVariableContext(execId);

      expect(execution?.status).toBe('success');
      expect(varCtx?.has('merged')).toBe(true);
    });
  });
});
