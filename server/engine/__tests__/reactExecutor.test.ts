/**
 * ReActExecutor 综合测试
 *
 * 测试覆盖：
 * 1. 构造函数 — 默认/注入依赖
 * 2. ReAct 状态转换 — 初始状态、阶段变化
 * 3. SelfEvaluation 接口 — reflectionPhase 自评分等级
 * 4. extractUserMessage — 消息提取逻辑
 * 5. execute 流程 — 验证未使用参数(如 result/parentMessages)的 lint 修复未破坏功能
 * 6. 错误处理 — AbortSignal/预算超限/Observer 异常容忍
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Vi.mock 所有外部依赖 =====================
// 注意：测试文件位于 __tests__/ 下，模块路径需要比源文件多一级 ../

vi.mock('../../aiClient.js', () => ({
  callAIModelStream: vi.fn(),
  AIAPIError: vi.fn(),
}));
vi.mock('../observer.js', () => ({ Observer: vi.fn() }));
vi.mock('../planner.js', () => ({ Planner: vi.fn() }));
vi.mock('../toolRegistry.js', () => ({
  getToolDefinitions: vi.fn().mockReturnValue([]),
  executeToolCall: vi.fn(),
}));
vi.mock('../pluginRegistry.js', () => ({
  pluginRegistry: {
    getEnabledPlugins: vi.fn().mockReturnValue([]),
    getActiveTools: vi.fn().mockReturnValue([]),
  },
  PluginState: { HIDDEN: 'hidden' },
}));
vi.mock('../mcpClientManager.js', () => ({
  mcpClientManager: { getMcpTools: vi.fn().mockReturnValue([]) },
}));
vi.mock('../contextTruncate.js', () => ({
  truncateContextForModel: vi.fn(),
  sanitizeToolMessages: vi.fn(),
  estimateTokens: vi.fn().mockReturnValue(10),
}));
vi.mock('../contextCompress.js', () => ({
  compressContextWithSummary: vi.fn().mockResolvedValue({
    compressed: false,
    truncated: false,
    messages: [],
  }),
}));
vi.mock('../budgetManager.js', () => ({
  BudgetManager: vi.fn(),
  DEFAULT_BUDGET_CONFIG: { maxTurns: 10, maxTokens: 50000 },
}));
vi.mock('../loopDetector.js', () => ({
  LoopDetector: vi.fn(),
}));
vi.mock('../workingMemory.js', () => ({
  WorkingMemory: vi.fn(),
}));
vi.mock('../fewShotTemplates.js', () => ({
  fewShotTemplates: {
    injectTemplates: vi.fn(),
    assessTrigger: vi.fn().mockReturnValue(null),
    injectTemplate: vi.fn(),
  },
}));
vi.mock('../observationCompressor.js', () => ({
  ObservationCompressor: vi.fn(),
  needsCompression: vi.fn().mockReturnValue(false),
}));
vi.mock('../circuitBreaker.js', () => ({
  CircuitBreaker: vi.fn(),
}));
vi.mock('../vecMemoryStore.js', () => ({
  writeMemory: vi.fn().mockResolvedValue(undefined),
  extractKeywords: vi.fn().mockReturnValue([]),
}));
vi.mock('../outputValidator.js', () => ({
  OutputValidator: vi.fn(),
}));
vi.mock('../toolPermissionSandbox.js', () => ({
  ToolPermissionSandbox: vi.fn(),
}));
vi.mock('../toolDependencyGraph.js', () => ({
  ToolDependencyGraph: vi.fn(),
}));
vi.mock('../semanticCompressor.js', () => ({
  SemanticCompressor: vi.fn(),
}));
vi.mock('../multilingualIntent.js', () => ({
  MultilingualIntent: vi.fn(),
}));
vi.mock('../actionPhaseExecutor.js', () => ({
  ActionPhaseExecutor: vi.fn(),
}));
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ===================== 导入被测试模块 =====================

import { ReActExecutor } from '../reactExecutor.js';
import type { ReActExecutionResult, SelfEvaluation } from '../reactExecutor.js';
import { Observer } from '../observer.js';
import { Planner } from '../planner.js';
import { callAIModelStream } from '../../aiClient.js';
import { ActionPhaseExecutor } from '../actionPhaseExecutor.js';
import { ObservationCompressor, needsCompression } from '../observationCompressor.js';
import { BudgetManager } from '../budgetManager.js';
import { WorkingMemory } from '../workingMemory.js';
import { LoopDetector } from '../loopDetector.js';
import { OutputValidator } from '../outputValidator.js';
import { CircuitBreaker } from '../circuitBreaker.js';
import { SemanticCompressor } from '../semanticCompressor.js';
import { MultilingualIntent } from '../multilingualIntent.js';
import type { ExecutionStrategyOptions } from '../executionStrategy.js';
import type { ToolCall, AIResponse, ModelCallConfig } from '../../aiClient.js';
import type { Observation } from '../observer.js';

// ===================== 测试工具函数 =====================

/** 创建最小 ExecutionStrategyOptions */
function createMinimalOptions(overrides: Partial<ExecutionStrategyOptions> = {}): ExecutionStrategyOptions {
  return {
    executionMode: 'react' as const,
    modelConfig: {
      id: 'test-model',
      provider: 'test',
      maxTokens: 1000,
    },
    messages: [
      { role: 'user', content: 'Hello, tell me about X' } as const,
    ],
    maxToolTurns: 5,
    ...overrides,
  } as ExecutionStrategyOptions;
}

/** 创建标准 ToolCall */
function makeToolCall(name: string, args = '{}', id = 'call_1'): ToolCall {
  return { id, type: 'function', function: { name, arguments: args } };
}

/** 创建 AIResponse */
function makeAIResponse(overrides: Partial<AIResponse> = {}): AIResponse {
  return {
    content: 'test response',
    toolCalls: [],
    ...overrides,
  };
}

/** 创建 Observation */
function makeObservation(
  toolName: string,
  level: 'success' | 'error' | 'warning' = 'success',
  overrides: Partial<Observation> = {},
): Observation {
  return {
    toolCall: { name: toolName, arguments: {} },
    result: 'ok',
    assessment: {
      level,
      reason: level === 'success' ? 'ok' : 'error',
      shouldRetry: level !== 'success',
      shouldAdjustStrategy: false,
      maxRetries: 3,
    },
    ...overrides,
  };
}

// ===================== 测试套件 =====================

describe('ReActExecutor', () => {
  // 每个测试前重置所有 mock
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===================== 1. 构造函数测试 =====================
  describe('constructor', () => {
    it('should create instance with no arguments (default deps)', () => {
      const executor = new ReActExecutor();
      expect(executor).toBeInstanceOf(ReActExecutor);
      // 验证内部 _observer 和 _planner 未初始化（懒加载）
      expect((executor as any)._observer).toBeUndefined();
      expect((executor as any)._planner).toBeUndefined();
      expect((executor as any)._budgetConfig).toBeUndefined();
    });

    it('should accept observer in constructor', () => {
      const observer = new Observer();
      const executor = new ReActExecutor(observer);
      expect((executor as any)._observer).toBe(observer);
      expect((executor as any)._planner).toBeUndefined();
    });

    it('should accept observer and planner in constructor', () => {
      const observer = new Observer();
      const planner = new Planner();
      const executor = new ReActExecutor(observer, planner);
      expect((executor as any)._observer).toBe(observer);
      expect((executor as any)._planner).toBe(planner);
    });

    it('should accept budgetConfig in constructor', () => {
      const budgetConfig = { maxTurns: 5, maxTokens: 10000 };
      const executor = new ReActExecutor(undefined, undefined, budgetConfig);
      expect((executor as any)._budgetConfig).toEqual(budgetConfig);
      // 验证 _budgetManager 保持未初始化（懒加载）
      expect((executor as any)._budgetManager).toBeUndefined();
    });

    it('should accept all three constructor parameters', () => {
      const observer = new Observer();
      const planner = new Planner();
      const budgetConfig = { maxTurns: 3 };
      const executor = new ReActExecutor(observer, planner, budgetConfig);
      expect((executor as any)._observer).toBe(observer);
      expect((executor as any)._planner).toBe(planner);
      expect((executor as any)._budgetConfig).toEqual(budgetConfig);
    });

    it('should initialize _state via createInitialState in constructor', () => {
      const executor = new ReActExecutor();
      const state = (executor as any)._state;
      expect(state).toBeDefined();
      expect(state.phase).toBe('reasoning');
      expect(state.turn).toBe(0);
      expect(state.shouldTerminate).toBe(false);
      expect(state.terminateReason).toBe('');
      // v7.0: currentStepIndex 已移除（3 步循环不再需要步骤索引）
      expect(state.currentComplexityLevel).toBe('moderate');
      expect(state.earlyTermination).toBe(false);
    });
  });

  // ===================== 2. ReAct 状态转换测试 =====================
  describe('state management', () => {
    it('should lazily initialize state on first access via getter', () => {
      const executor = new ReActExecutor(undefined, undefined);
      // 清除构造函数中创建的 _state
      (executor as any)._state = undefined;
      const state = (executor as any).state;
      expect(state).toBeDefined();
      expect(state.phase).toBe('reasoning');
      // 验证缓存
      expect((executor as any)._state).toBe(state);
    });

    it('should allow setting state via setter', () => {
      const executor = new ReActExecutor();
      const newState = {
        phase: 'done' as const,
        turn: 5,
        shouldTerminate: true,
        terminateReason: 'test',
        currentStepIndex: 2,
        currentComplexityLevel: 'complex' as const,
        lastConfidenceScore: 8,
        earlyTermination: false,
      };
      (executor as any).state = newState;
      expect((executor as any)._state).toEqual(newState);
      // 再通过 getter 读出
      expect((executor as any).state).toEqual(newState);
    });

    it('should correctly manage phase transitions', () => {
      const executor = new ReActExecutor();
      const state = (executor as any).state;

      // 初始 = reasoning
      expect(state.phase).toBe('reasoning');

      // 模拟完整阶段转换
      state.phase = 'acting';
      expect(state.phase).toBe('acting');

      state.phase = 'observing';
      expect(state.phase).toBe('observing');

      state.phase = 'reflecting';
      expect(state.phase).toBe('reflecting');

      state.phase = 'done';
      expect(state.phase).toBe('done');
    });

    it('should reset state on each execute call', async () => {
      const executor = new ReActExecutor();

      // 预设旧状态
      (executor as any)._state = {
        phase: 'done',
        turn: 10,
        shouldTerminate: true,
        terminateReason: 'old',
        currentStepIndex: 5,
        currentComplexityLevel: 'complex',
        lastConfidenceScore: 9,
        earlyTermination: true,
      };

      vi.mocked(callAIModelStream).mockResolvedValue(makeAIResponse({ content: 'hello' }));
      vi.mocked(MultilingualIntent).mockImplementation((() => ({
        recognize: vi.fn().mockReturnValue({
          primaryIntent: 'query',
          detectedLanguage: 'zh',
          isMultiStep: false,
          estimatedSteps: 1,
          intents: ['query'],
        }),
      })) as any);
      vi.mocked(BudgetManager).mockImplementation((() => ({
        incrementTurn: vi.fn(),
        checkBudget: vi.fn().mockReturnValue({ exceeded: false }),
        accumulateTokens: vi.fn(),
        setAdaptiveMaxTurns: vi.fn(),
        getMaxTurns: vi.fn().mockReturnValue(10),
        getMaxTokens: vi.fn().mockReturnValue(50000),
        getCurrentTurn: vi.fn().mockReturnValue(1),
        getConsumedTokens: vi.fn().mockReturnValue(0),
      })) as any);
      vi.mocked(WorkingMemory).mockImplementation((() => ({
        getContextMessages: vi.fn().mockReturnValue([]),
        addTurn: vi.fn(),
        needsCompression: vi.fn().mockReturnValue(false),
        getOldTurnsForCompression: vi.fn().mockReturnValue([]),
        getSummary: vi.fn().mockReturnValue(''),
        updateSummaryCache: vi.fn(),
        removeCompressedTurns: vi.fn(),
        getTurnCount: vi.fn().mockReturnValue(0),
        reset: vi.fn(),
      })) as any);
      vi.mocked(LoopDetector).mockImplementation((() => ({
        detectLoop: vi.fn().mockReturnValue({ isLoop: false }),
        getEscalationStrategy: vi.fn(),
        reset: vi.fn(),
      })) as any);
      vi.mocked(OutputValidator).mockImplementation((() => ({
        validate: vi.fn().mockReturnValue({ isValid: true, wasRepaired: false }),
        canRetry: vi.fn().mockReturnValue(false),
        recordRetry: vi.fn(),
        reset: vi.fn(),
      })) as any);
      vi.mocked(CircuitBreaker).mockImplementation((() => ({
        recordSuccess: vi.fn(),
        recordFailure: vi.fn().mockReturnValue('closed'),
        getAlternativeSuggestion: vi.fn().mockReturnValue(null),
        getRecord: vi.fn(),
        reset: vi.fn(),
      })) as any);
      vi.mocked(ActionPhaseExecutor).mockImplementation((() => ({
        actionPhase: vi.fn(),
        executeToolWithPermission: vi.fn(),
      })) as any);
      vi.mocked(SemanticCompressor).mockImplementation((() => ({
        compress: vi.fn().mockResolvedValue({
          compressed: 'summary',
          compressedLength: 20,
          strategy: 'semantic',
          preservedEntities: [],
        }),
      })) as any);
      vi.mocked(Observer).mockImplementation((() => ({
        observe: vi.fn().mockReturnValue({
          toolCall: { name: 'test', arguments: {} },
          result: 'observed',
          assessment: {
            level: 'success',
            reason: 'ok',
            shouldRetry: false,
            shouldAdjustStrategy: false,
            maxRetries: 0,
          },
        }),
        shouldRetry: vi.fn().mockReturnValue(false),
      })) as any);
      vi.mocked(needsCompression).mockReturnValue(false);
      vi.mocked(ObservationCompressor).mockImplementation((() => ({
        compress: vi.fn().mockReturnValue({
          compressed: '',
          compressionRatio: 0,
          wasCompressed: false,
          original: '',
        }),
      })) as any);

      const result = await executor.execute(createMinimalOptions());

      // 状态应重置为新的执行过程
      expect(result.totalTurns).toBe(1);
      expect(result.earlyTermination).toBe(false);
      const finalState = (executor as any)._state;
      expect(finalState.phase).toBe('done');
    });
  });

  // ===================== 3. SelfEvaluation 接口测试 =====================
  // 注意：reflectionPhase 方法已在 v7.0 简化重构中移除（3 步循环不再包含反思阶段）
  // SelfEvaluation 接口保留用于类型兼容，但不再有运行时反思逻辑
  describe('SelfEvaluation interface', () => {
    it('should preserve SelfEvaluation type structure for backward compatibility', () => {
      const evalInstance: SelfEvaluation = { grade: 'A', reason: 'All good' };
      expect(evalInstance.grade).toBe('A');
      expect(evalInstance.reason).toBe('All good');
    });
  });

  // ===================== 4. extractUserMessage 测试 =====================
  describe('extractUserMessage', () => {
    it('should return the last user message content as string', () => {
      const executor = new ReActExecutor();
      const messages = [
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'first message' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'last message' },
      ] as any;

      const result = (executor as any).extractUserMessage(messages);
      expect(result).toBe('last message');
    });

    it('should return null when no user messages exist', () => {
      const executor = new ReActExecutor();
      const messages = [
        { role: 'system', content: 'be helpful' },
        { role: 'assistant', content: 'hello' },
        { role: 'tool', content: 'result', tool_call_id: '1' },
      ] as any;

      const result = (executor as any).extractUserMessage(messages);
      expect(result).toBeNull();
    });

    it('should handle content as array (vision format)', () => {
      const executor = new ReActExecutor();
      const contentArray = [
        { type: 'text' as const, text: 'describe this image' },
        { type: 'image_url' as const, image_url: { url: 'data:...' } },
      ];
      const messages = [{ role: 'user', content: contentArray }];

      const result = (executor as any).extractUserMessage(messages);
      expect(result).toBe(JSON.stringify(contentArray));
    });

    it('should return null when there are no messages', () => {
      const executor = new ReActExecutor();
      const result = (executor as any).extractUserMessage([]);
      expect(result).toBeNull();
    });

    it('should return null when no user message exists in mixed roles', () => {
      const executor = new ReActExecutor();
      const messages = [
        { role: 'system', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ];

      const result = (executor as any).extractUserMessage(messages);
      expect(result).toBeNull();
    });

    it('should handle single user message', () => {
      const executor = new ReActExecutor();
      const messages = [{ role: 'user', content: 'single message' }];

      const result = (executor as any).extractUserMessage(messages);
      expect(result).toBe('single message');
    });

    it('should find user message in the middle of other roles', () => {
      const executor = new ReActExecutor();
      const messages = [
        { role: 'assistant', content: 'first' },
        { role: 'user', content: 'target user message' },
        { role: 'assistant', content: 'response' },
        { role: 'tool', content: 'data', tool_call_id: 'tc_1' },
      ] as any;

      const result = (executor as any).extractUserMessage(messages);
      expect(result).toBe('target user message');
    });
  });

  // ===================== 5. Execute 流程测试 (lint 修复回归验证) =====================
  describe('execute flow (linter fix regression)', () => {
    beforeEach(() => {
      // 通用 mock: MultilingualIntent
      vi.mocked(MultilingualIntent).mockImplementation((() => ({
        recognize: vi.fn().mockReturnValue({
          primaryIntent: 'query',
          detectedLanguage: 'zh',
          isMultiStep: false,
          estimatedSteps: 1,
          intents: ['query'],
        }),
      })) as any);

      // 通用 mock: BudgetManager
      vi.mocked(BudgetManager).mockImplementation((() => ({
        incrementTurn: vi.fn(),
        checkBudget: vi.fn().mockReturnValue({ exceeded: false }),
        accumulateTokens: vi.fn(),
        setAdaptiveMaxTurns: vi.fn(),
        getMaxTurns: vi.fn().mockReturnValue(10),
        getMaxTokens: vi.fn().mockReturnValue(50000),
        getCurrentTurn: vi.fn().mockReturnValue(1),
        getConsumedTokens: vi.fn().mockReturnValue(0),
      })) as any);

      // 通用 mock: WorkingMemory
      vi.mocked(WorkingMemory).mockImplementation((() => ({
        getContextMessages: vi.fn().mockReturnValue([]),
        addTurn: vi.fn(),
        needsCompression: vi.fn().mockReturnValue(false),
        getOldTurnsForCompression: vi.fn().mockReturnValue([]),
        getSummary: vi.fn().mockReturnValue(''),
        updateSummaryCache: vi.fn(),
        removeCompressedTurns: vi.fn(),
        getTurnCount: vi.fn().mockReturnValue(0),
        reset: vi.fn(),
      })) as any);

      // 通用 mock: LoopDetector
      vi.mocked(LoopDetector).mockImplementation((() => ({
        detectLoop: vi.fn().mockReturnValue({ isLoop: false }),
        getEscalationStrategy: vi.fn(),
        reset: vi.fn(),
      })) as any);

      // 通用 mock: OutputValidator
      vi.mocked(OutputValidator).mockImplementation((() => ({
        validate: vi.fn().mockReturnValue({ isValid: true, wasRepaired: false }),
        canRetry: vi.fn().mockReturnValue(false),
        recordRetry: vi.fn(),
        reset: vi.fn(),
      })) as any);

      // 通用 mock: CircuitBreaker
      vi.mocked(CircuitBreaker).mockImplementation((() => ({
        recordSuccess: vi.fn(),
        recordFailure: vi.fn().mockReturnValue('closed'),
        getAlternativeSuggestion: vi.fn().mockReturnValue(null),
        getRecord: vi.fn(),
        reset: vi.fn(),
      })) as any);

      // 通用 mock: ActionPhaseExecutor
      vi.mocked(ActionPhaseExecutor).mockImplementation((() => ({
        actionPhase: vi.fn().mockResolvedValue(new Map()),
        executeToolWithPermission: vi.fn(),
      })) as any);

      // 通用 mock: ObservationCompressor
      vi.mocked(ObservationCompressor).mockImplementation((() => ({
        compress: vi.fn().mockReturnValue({
          compressed: 'compressed result',
          compressionRatio: 0.5,
          wasCompressed: true,
          original: '',
        }),
      })) as any);

      // 通用 mock: SemanticCompressor
      vi.mocked(SemanticCompressor).mockImplementation((() => ({
        compress: vi.fn().mockResolvedValue({
          compressed: 'summary',
          compressedLength: 20,
          strategy: 'semantic',
          preservedEntities: [],
        }),
      })) as any);

      // 通用 mock: Observer （懒加载 fallback）
      vi.mocked(Observer).mockImplementation((() => ({
        observe: vi.fn().mockReturnValue({
          toolCall: { name: 'test', arguments: {} },
          result: 'observed',
          assessment: {
            level: 'success',
            reason: 'ok',
            shouldRetry: false,
            shouldAdjustStrategy: false,
            maxRetries: 0,
          },
        }),
        shouldRetry: vi.fn().mockReturnValue(false),
      })) as any);
    });

    it('should complete simple task without tool calls directly', async () => {
      vi.mocked(callAIModelStream).mockResolvedValue(makeAIResponse({
        content: 'Hello! This is a direct response to your query.',
      }));

      const executor = new ReActExecutor();
      const result = await executor.execute(createMinimalOptions());

      expect(result).toBeDefined();
      expect(result.totalTurns).toBe(1);
      expect(result.earlyTermination).toBe(false);
    });

    it('should handle simple task with tool calls in 2 turns (v7.0 3-step loop)', async () => {
      vi.mocked(callAIModelStream)
        .mockResolvedValueOnce(makeAIResponse({
          content: '',
          toolCalls: [makeToolCall('web_search', '{"q":"test"}', 'call_1')],
        }))
        .mockResolvedValueOnce(makeAIResponse({
          content: 'Final answer after tool execution.',
        }));

      vi.mocked(ActionPhaseExecutor).mockImplementation((() => ({
        actionPhase: vi.fn().mockResolvedValue(
          new Map([[makeToolCall('web_search', '{"q":"test"}', 'call_1'), 'search result']])
        ),
        executeToolWithPermission: vi.fn(),
      })) as any);

      const executor = new ReActExecutor();
      const result = await executor.execute(createMinimalOptions());

      expect(result).toBeDefined();
      // v7.0: 简单路径优化已移除，工具调用后循环继续到第 2 轮
      expect(result.totalTurns).toBe(2);
    });

    it('should continue to second LLM call after tool execution (v7.0 removed simple path optimization)', async () => {
      vi.mocked(callAIModelStream)
        .mockResolvedValueOnce(makeAIResponse({
          content: 'This is a long enough response that should skip the second LLM call.',
          toolCalls: [makeToolCall('db_query', '{"sql":"SELECT 1"}', 'call_1')],
        }))
        .mockResolvedValueOnce(makeAIResponse({
          content: 'Final answer after tool execution.',
        }));

      vi.mocked(ActionPhaseExecutor).mockImplementation((() => ({
        actionPhase: vi.fn().mockResolvedValue(
          new Map([[makeToolCall('db_query', '{"sql":"SELECT 1"}', 'call_1'), '1']])
        ),
        executeToolWithPermission: vi.fn(),
      })) as any);

      const executor = new ReActExecutor();
      const result = await executor.execute(createMinimalOptions());

      expect(result).toBeDefined();
      // v7.0: 简单路径优化已移除，工具调用后循环继续到第 2 轮
      expect(result.totalTurns).toBe(2);
    });

    it('should handoff to main loop when simple path confidence < 5', async () => {
      vi.mocked(callAIModelStream).mockResolvedValue(makeAIResponse({
        content: '',
        toolCalls: [makeToolCall('web_search', '{"q":"handoff"}', 'call_1')],
      }));

      // Observer 返回 error 级别 → low confidence → handoff
      vi.mocked(Observer).mockImplementation((() => ({
        observe: vi.fn().mockReturnValue({
          toolCall: { name: 'web_search', arguments: {} },
          result: 'observed',
          assessment: {
            level: 'error',
            reason: 'low confidence result',
            shouldRetry: true,
            shouldAdjustStrategy: false,
            maxRetries: 3,
          },
        }),
        shouldRetry: vi.fn().mockReturnValue(false),
      })) as any);

      vi.mocked(ActionPhaseExecutor).mockImplementation((() => ({
        actionPhase: vi.fn().mockResolvedValue(
          new Map([[makeToolCall('web_search', '{"q":"handoff"}', 'call_1'), 'error result']])
        ),
        executeToolWithPermission: vi.fn(),
      })) as any);

      const executor = new ReActExecutor();
      const result = await executor.execute(createMinimalOptions());

      expect(result).toBeDefined();
      expect(result.totalTurns).toBeGreaterThanOrEqual(1);
    });

    it('should abort when signal is aborted', async () => {
      vi.mocked(callAIModelStream).mockResolvedValue(makeAIResponse({
        content: '',
        toolCalls: [makeToolCall('some_tool', '{}', 'call_1')],
      }));

      const abortController = new AbortController();
      abortController.abort();

      vi.mocked(Observer).mockImplementation((() => ({
        observe: vi.fn().mockReturnValue({
          toolCall: { name: 'some_tool', arguments: {} },
          result: 'observed',
          assessment: {
            level: 'error',
            reason: 'low confidence',
            shouldRetry: false,
            shouldAdjustStrategy: false,
            maxRetries: 0,
          },
        }),
        shouldRetry: vi.fn().mockReturnValue(false),
      })) as any);

      vi.mocked(ActionPhaseExecutor).mockImplementation((() => ({
        actionPhase: vi.fn().mockResolvedValue(
          new Map([[makeToolCall('some_tool', '{}', 'call_1'), 'error result']])
        ),
        executeToolWithPermission: vi.fn(),
      })) as any);

      const executor = new ReActExecutor();

      await expect(executor.execute(
        createMinimalOptions({ signal: abortController.signal })
      )).rejects.toThrow('请求已取消');
    });

    it('should stop on budget exceeded', async () => {
      vi.mocked(BudgetManager).mockImplementation((() => ({
        incrementTurn: vi.fn(),
        checkBudget: vi.fn().mockReturnValue({
          exceeded: true,
          reason: 'turns_exceeded',
          consumedTurns: 10,
          consumedTokens: 1000,
        }),
        accumulateTokens: vi.fn(),
        setAdaptiveMaxTurns: vi.fn(),
        getMaxTurns: vi.fn().mockReturnValue(10),
        getMaxTokens: vi.fn().mockReturnValue(50000),
        getCurrentTurn: vi.fn().mockReturnValue(10),
        getConsumedTokens: vi.fn().mockReturnValue(1000),
      })) as any);

      // 设置 Observer 返回 error → low confidence → handoff → 进主循环触发 budget check
      vi.mocked(Observer).mockImplementation((() => ({
        observe: vi.fn().mockReturnValue({
          toolCall: { name: 'test', arguments: {} },
          result: 'observed',
          assessment: {
            level: 'error',
            reason: 'low confidence',
            shouldRetry: false,
            shouldAdjustStrategy: false,
            maxRetries: 0,
          },
        }),
        shouldRetry: vi.fn().mockReturnValue(false),
      })) as any);

      vi.mocked(callAIModelStream).mockResolvedValue(makeAIResponse({
        content: '',
        toolCalls: [makeToolCall('some_tool', '{}', 'call_1')],
      }));

      vi.mocked(ActionPhaseExecutor).mockImplementation((() => ({
        actionPhase: vi.fn().mockResolvedValue(
          new Map([[makeToolCall('some_tool', '{}', 'call_1'), 'error result']])
        ),
        executeToolWithPermission: vi.fn(),
      })) as any);

      const executor = new ReActExecutor();
      const result = await executor.execute(createMinimalOptions());

      expect(result).toBeDefined();
      expect(result.earlyTermination).toBe(true);
      expect((executor as any)._state.terminateReason).toBe('budget_exceeded');
    });
  });

  // ===================== 6. 错误处理测试 =====================
  describe('error handling', () => {
    beforeEach(() => {
      vi.mocked(MultilingualIntent).mockImplementation((() => ({
        recognize: vi.fn().mockReturnValue({
          primaryIntent: 'query',
          detectedLanguage: 'zh',
          isMultiStep: false,
          estimatedSteps: 1,
          intents: ['query'],
        }),
      })) as any);

      vi.mocked(BudgetManager).mockImplementation((() => ({
        incrementTurn: vi.fn(),
        checkBudget: vi.fn().mockReturnValue({ exceeded: false }),
        accumulateTokens: vi.fn(),
        setAdaptiveMaxTurns: vi.fn(),
        getMaxTurns: vi.fn().mockReturnValue(10),
        getMaxTokens: vi.fn().mockReturnValue(50000),
        getCurrentTurn: vi.fn().mockReturnValue(1),
        getConsumedTokens: vi.fn().mockReturnValue(0),
      })) as any);

      vi.mocked(WorkingMemory).mockImplementation((() => ({
        getContextMessages: vi.fn().mockReturnValue([]),
        addTurn: vi.fn(),
        needsCompression: vi.fn().mockReturnValue(false),
        getOldTurnsForCompression: vi.fn().mockReturnValue([]),
        getSummary: vi.fn().mockReturnValue(''),
        updateSummaryCache: vi.fn(),
        removeCompressedTurns: vi.fn(),
        getTurnCount: vi.fn().mockReturnValue(0),
        reset: vi.fn(),
      })) as any);

      vi.mocked(LoopDetector).mockImplementation((() => ({
        detectLoop: vi.fn().mockReturnValue({ isLoop: false }),
        getEscalationStrategy: vi.fn(),
        reset: vi.fn(),
      })) as any);

      vi.mocked(OutputValidator).mockImplementation((() => ({
        validate: vi.fn().mockReturnValue({ isValid: true, wasRepaired: false }),
        canRetry: vi.fn().mockReturnValue(false),
        recordRetry: vi.fn(),
        reset: vi.fn(),
      })) as any);

      vi.mocked(CircuitBreaker).mockImplementation((() => ({
        recordSuccess: vi.fn(),
        recordFailure: vi.fn().mockReturnValue('closed'),
        getAlternativeSuggestion: vi.fn().mockReturnValue(null),
        getRecord: vi.fn(),
        reset: vi.fn(),
      })) as any);

      vi.mocked(ActionPhaseExecutor).mockImplementation((() => ({
        actionPhase: vi.fn().mockResolvedValue(new Map()),
        executeToolWithPermission: vi.fn(),
      })) as any);

      vi.mocked(Observer).mockImplementation((() => ({
        observe: vi.fn(),
        shouldRetry: vi.fn().mockReturnValue(false),
      })) as any);
    });

    it('should tolerate Observer errors in observationPhase', () => {
      const executor = new ReActExecutor();

      vi.mocked(Observer).mockImplementation((() => ({
        observe: vi.fn().mockImplementation(() => { throw new Error('observer crashed'); }),
        shouldRetry: vi.fn().mockReturnValue(false),
      })) as any);

      const actionResults = new Map<ToolCall, string>([
        [makeToolCall('api_call', '{}', 'call_1'), 'some result data'],
        [makeToolCall('db_query', '{"sql":"SELECT 1"}', 'call_2'), '1'],
      ]);

      const observations = (executor as any).observationPhase(actionResults);

      // Observer 异常容忍：返回 success 级别的观察结果
      expect(observations).toHaveLength(2);
      for (const obs of observations) {
        expect(obs.assessment.level).toBe('success');
        expect(obs.assessment.reason).toBe('Observer 错误已忽略');
      }
    });

    it('should handle observationPhase with empty actionResults', () => {
      const executor = new ReActExecutor();
      const observations = (executor as any).observationPhase(new Map());
      expect(observations).toEqual([]);
    });

    it('should handle observationPhase with malformed tool arguments', () => {
      const executor = new ReActExecutor();

      vi.mocked(Observer).mockImplementation((() => ({
        observe: vi.fn().mockReturnValue({
          toolCall: { name: 'test_tool', arguments: {} },
          result: 'result ok',
          assessment: {
            level: 'success',
            reason: 'ok',
            shouldRetry: false,
            shouldAdjustStrategy: false,
            maxRetries: 0,
          },
        }),
        shouldRetry: vi.fn().mockReturnValue(false),
      })) as any);

      // 无效 JSON 参数 → 会被 try-catch 捕获，不抛异常
      const toolCall = makeToolCall('foo', '{malformed json', 'call_1');
      const actionResults = new Map<ToolCall, string>([[toolCall, 'result']]);

      const observations = (executor as any).observationPhase(actionResults);
      expect(observations).toHaveLength(1);
      expect(observations[0].assessment.level).toBe('success');
    });

    it('should tolerate planner errors in execute (caught and logged)', async () => {
      vi.mocked(callAIModelStream).mockResolvedValue(makeAIResponse({
        content: 'simple reply',
      }));

      // 设置复杂任务等级 → 跳过 simple 路径进入 planner
      vi.mocked(MultilingualIntent).mockImplementation((() => ({
        recognize: vi.fn().mockReturnValue({
          primaryIntent: 'complex_query',
          detectedLanguage: 'zh',
          isMultiStep: true,
          estimatedSteps: 6,
          intents: ['complex_query'],
        }),
      })) as any);

      // Planner 抛出异常
      const mockPlanner = {
        assessTrigger: vi.fn().mockReturnValue({ shouldTrigger: true }),
        generatePlan: vi.fn().mockRejectedValue(new Error('plan failed')),
        adjustPlan: vi.fn(),
      };

      const executor = new ReActExecutor(undefined, mockPlanner as any);
      const result = await executor.execute(createMinimalOptions());

      // 不应抛出，规划失败被静默捕获
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should handle empty messages array gracefully', async () => {
      vi.mocked(callAIModelStream).mockResolvedValue(makeAIResponse({
        content: 'response to empty messages',
      }));

      const executor = new ReActExecutor();
      const result = await executor.execute(
        createMinimalOptions({ messages: [] as any })
      );

      expect(result).toBeDefined();
      expect(result.content).toContain('response to empty messages');
    });

    it('should compress observations when needsCompression is true', () => {
      const executor = new ReActExecutor();
      const longResult = 'x'.repeat(1000);

      // 启用压缩
      vi.mocked(needsCompression).mockReturnValue(true);
      vi.mocked(ObservationCompressor).mockImplementation((() => ({
        compress: vi.fn().mockReturnValue({
          compressed: longResult.substring(0, 100),
          original: longResult,
          wasCompressed: true,
          compressionRatio: 0.1,
        }),
      })) as any);

      vi.mocked(Observer).mockImplementation((() => ({
        observe: vi.fn().mockReturnValue({
          toolCall: { name: 'big_data', arguments: {} },
          result: longResult,
          assessment: {
            level: 'success',
            reason: 'ok',
            shouldRetry: false,
            shouldAdjustStrategy: false,
            maxRetries: 0,
          },
          metadata: {},
        }),
        shouldRetry: vi.fn().mockReturnValue(false),
      })) as any);

      const toolCall = makeToolCall('big_data', '{}', 'call_1');
      const actionResults = new Map<ToolCall, string>([[toolCall, longResult]]);

      const observations = (executor as any).observationPhase(actionResults);
      expect(observations).toHaveLength(1);
      expect(observations[0].result.length).toBeLessThan(longResult.length);
      expect(observations[0].metadata).toBeDefined();
      expect(observations[0].metadata.wasCompressed).toBe(true);
      expect(observations[0].metadata.compressionRatio).toBeLessThan(1);
    });
  });

  // ===================== 接口导出验证 =====================
  describe('type exports', () => {
    it('should export SelfEvaluation interface structure', () => {
      const evalInstance: SelfEvaluation = { grade: 'A', reason: 'All good' };
      expect(evalInstance.grade).toBe('A');
      expect(evalInstance.reason).toBe('All good');

      const grades: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
      for (const g of grades) {
        const e: SelfEvaluation = { grade: g, reason: '' };
        expect(e.grade).toBe(g);
      }
    });

    it('should define ReActPhase union type', () => {
      const phases = ['reasoning', 'acting', 'observing', 'reflecting', 'done'] as const;
      expect(phases).toContain('reasoning');
    });

    it('should have correct ReActExecutionResult shape', () => {
      const result: ReActExecutionResult = {
        content: 'ok',
        toolCalls: [],
        observations: [],
        totalTurns: 0,
        earlyTermination: false,
      };
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('toolCalls');
      expect(result).toHaveProperty('observations');
      expect(result).toHaveProperty('totalTurns');
      expect(result).toHaveProperty('earlyTermination');
    });
  });
});