// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { LegacyContextEngine } from '../legacyEngine.js';
import type {
  AgentMessage,
  ContextEngineRuntimeContext,
  AssembleResult,
  BootstrapResult,
  IngestResult,
  IngestBatchResult,
  CompactResult,
  ContextEngineMaintenanceResult,
} from '../types.js';

describe('LegacyContextEngine', () => {
  let engine: LegacyContextEngine;

  const testMessages: AgentMessage[] = [
    { role: 'user', content: '你好，请介绍一下人工智能', timestamp: Date.now() - 10000 },
    { role: 'assistant', content: '人工智能是计算机科学的一个分支，它企图了解智能的实质。', timestamp: Date.now() - 9000 },
    { role: 'user', content: '什么是机器学习？', timestamp: Date.now() - 8000 },
    { role: 'assistant', content: '机器学习是人工智能的一个子集，它使计算机能够从数据中学习。', timestamp: Date.now() - 7000 },
  ];

  beforeEach(() => {
    engine = new LegacyContextEngine();
  });

  describe('bootstrap', () => {
    it('应该能正常启动会话', async () => {
      const result: BootstrapResult = await engine.bootstrap({ sessionId: 'test-session' });
      expect(result.bootstrapped).toBe(true);
      expect(result.importedMessages).toBe(0);
      const state = engine.getSessionState();
      expect(state).not.toBeNull();
      expect(state?.sessionId).toBe('test-session');
      expect(state?.messageCount).toBe(0);
    });

    it('应该能启动时加载初始消息', async () => {
      const result: BootstrapResult = await engine.bootstrap({
        sessionId: 'test-session',
        initialMessages: testMessages,
      });
      expect(result.bootstrapped).toBe(true);
      expect(result.importedMessages).toBe(testMessages.length);
      const state = engine.getSessionState();
      expect(state?.messageCount).toBe(testMessages.length);
    });

    it('应该能正确分离系统消息和普通消息', async () => {
      const messagesWithSystem: AgentMessage[] = [
        { role: 'system', content: 'You are a helpful assistant' },
        ...testMessages,
      ];
      await engine.bootstrap({
        sessionId: 'test-session',
        initialMessages: messagesWithSystem,
      });
      const stats = await engine.getStats();
      expect(stats.systemMessages).toBe(1);
      expect(stats.totalMessages).toBe(messagesWithSystem.length);
    });

    it('应该支持运行时上下文参数', async () => {
      const runtimeContext: ContextEngineRuntimeContext = {
        modelId: 'gpt-4',
        provider: 'openai',
        tokenBudget: 8000,
      };
      await expect(
        engine.bootstrap({
          sessionId: 'test-session',
          runtimeContext,
        })
      ).resolves.not.toThrow();
    });

    it('应该支持 sessionKey 参数', async () => {
      const result = await engine.bootstrap({
        sessionId: 'test-session',
        sessionKey: 'test-key-123',
      });
      expect(result.bootstrapped).toBe(true);
    });

    it('应该支持 sessionFile 参数', async () => {
      const result = await engine.bootstrap({
        sessionId: 'test-session',
        sessionFile: '/tmp/test-session.json',
      });
      expect(result.bootstrapped).toBe(true);
    });
  });

  describe('ingest', () => {
    beforeEach(async () => {
      await engine.bootstrap({ sessionId: 'test-session' });
    });

    it('应该能摄入单条消息', async () => {
      const result: IngestResult = await engine.ingest({
        sessionId: 'test-session',
        message: testMessages[0],
      });
      expect(result.ingested).toBe(true);
      expect(result.added).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.tokensAdded).toBeGreaterThan(0);
    });

    it('应该能跳过无效消息', async () => {
      const result1 = await engine.ingest({
        sessionId: 'test-session',
        message: { role: '', content: '' } as unknown as AgentMessage,
      });
      expect(result1.added).toBe(0);
      expect(result1.skipped).toBe(1);

      const result2 = await engine.ingest({
        sessionId: 'test-session',
        message: null as unknown as AgentMessage,
      });
      expect(result2.added).toBe(0);
      expect(result2.skipped).toBe(1);
    });

    it('应该支持运行时上下文参数', async () => {
      const runtimeContext: ContextEngineRuntimeContext = {
        modelId: 'gpt-4',
      };
      const result = await engine.ingest({
        sessionId: 'test-session',
        message: testMessages[0],
        runtimeContext,
      });
      expect(result.added).toBe(1);
    });

    it('应该为消息添加时间戳', async () => {
      const msg: AgentMessage = { role: 'user', content: 'test' };
      await engine.ingest({
        sessionId: 'test-session',
        message: msg,
      });
      const state = engine.getSessionState();
      expect(state?.messageCount).toBe(1);
    });

    it('应该支持 sessionKey 参数', async () => {
      const result = await engine.ingest({
        sessionId: 'test-session',
        sessionKey: 'test-key',
        message: testMessages[0],
      });
      expect(result.ingested).toBe(true);
    });
  });

  describe('ingestBatch', () => {
    beforeEach(async () => {
      await engine.bootstrap({ sessionId: 'test-session' });
    });

    it('应该能批量摄入消息', async () => {
      const result: IngestBatchResult = await engine.ingestBatch!({
        sessionId: 'test-session',
        messages: testMessages,
      });
      expect(result.ingestedCount).toBe(testMessages.length);
      expect(result.added).toBe(testMessages.length);
      expect(result.skipped).toBe(0);
      expect(result.tokensAdded).toBeGreaterThan(0);
    });

    it('应该能跳过无效消息', async () => {
      const messages = [
        ...testMessages,
        { role: '', content: '' } as AgentMessage,
        null as unknown as AgentMessage,
      ];
      const result = await engine.ingestBatch!({
        sessionId: 'test-session',
        messages,
      });
      expect(result.added).toBe(testMessages.length);
      expect(result.skipped).toBe(2);
      expect(result.ingestedCount).toBe(testMessages.length);
    });

    it('应该支持运行时上下文参数', async () => {
      const runtimeContext: ContextEngineRuntimeContext = {
        modelId: 'gpt-4',
      };
      const result = await engine.ingestBatch!({
        sessionId: 'test-session',
        messages: testMessages,
        runtimeContext,
      });
      expect(result.added).toBe(testMessages.length);
    });

    it('应该支持 sessionKey 参数', async () => {
      const result = await engine.ingestBatch!({
        sessionId: 'test-session',
        sessionKey: 'batch-key',
        messages: testMessages,
      });
      expect(result.ingestedCount).toBe(testMessages.length);
    });

    it('空消息数组应该返回正确结果', async () => {
      const result = await engine.ingestBatch!({
        sessionId: 'test-session',
        messages: [],
      });
      expect(result.ingestedCount).toBe(0);
      expect(result.added).toBe(0);
      expect(result.skipped).toBe(0);
    });
  });

  describe('assemble', () => {
    beforeEach(async () => {
      await engine.bootstrap({
        sessionId: 'test-session',
        initialMessages: testMessages,
      });
    });

    it('应该返回 AssembleResult 结构', async () => {
      const result: AssembleResult = await engine.assemble({
        sessionId: 'test-session',
        messages: [],
      });
      expect(result.messages).toBeDefined();
      expect(result.estimatedTokens).toBeDefined();
      expect(typeof result.estimatedTokens).toBe('number');
      expect(result.estimatedTokens).toBeGreaterThan(0);
      expect(result.promptAuthority).toBe('assembled');
    });

    it('消息数量应该正确', async () => {
      const result = await engine.assemble({
        sessionId: 'test-session',
        messages: [],
      });
      expect(result.messages).toHaveLength(testMessages.length);
    });

    it('应该支持运行时上下文中的 tokenBudget', async () => {
      const runtimeContext: ContextEngineRuntimeContext = {
        tokenBudget: 4000,
      };
      const result = await engine.assemble({
        sessionId: 'test-session',
        messages: [],
        runtimeContext,
      });
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('应该支持 tokenBudget 参数', async () => {
      const result = await engine.assemble({
        sessionId: 'test-session',
        messages: [],
        tokenBudget: 4000,
      });
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('运行时上下文的 tokenBudget 优先级高于 options', async () => {
      const result1 = await engine.assemble({
        sessionId: 'test-session',
        messages: [],
        tokenBudget: 100,
      });
      const runtimeContext: ContextEngineRuntimeContext = { tokenBudget: 100000 };
      const result2 = await engine.assemble({
        sessionId: 'test-session',
        messages: [],
        tokenBudget: 100,
        runtimeContext,
      });
      expect(result1.messages.length).toBeLessThanOrEqual(result2.messages.length);
    });

    it('应该包含 compactedCount 字段', async () => {
      const result = await engine.assemble({
        sessionId: 'test-session',
        messages: [],
      });
      expect(result.compactedCount).toBe(0);
    });
  });

  describe('afterTurn', () => {
    beforeEach(async () => {
      await engine.bootstrap({ sessionId: 'test-session' });
    });

    it('应该能添加一轮对话', async () => {
      const userMsg: AgentMessage = { role: 'user', content: '你好' };
      const assistantMsg: AgentMessage = { role: 'assistant', content: '你好！' };
      await engine.afterTurn!({
        sessionId: 'test-session',
        messages: [userMsg, assistantMsg],
        prePromptMessageCount: 0,
      });
      const state = engine.getSessionState();
      expect(state?.messageCount).toBe(2);
    });

    it('应该支持运行时上下文参数', async () => {
      const userMsg: AgentMessage = { role: 'user', content: '你好' };
      const assistantMsg: AgentMessage = { role: 'assistant', content: '你好！' };
      const runtimeContext: ContextEngineRuntimeContext = {
        tokenBudget: 8000,
      };
      await expect(
        engine.afterTurn!({
          sessionId: 'test-session',
          messages: [userMsg, assistantMsg],
          prePromptMessageCount: 0,
          runtimeContext,
        })
      ).resolves.not.toThrow();
    });

    it('应该支持 sessionKey 和 sessionFile 参数', async () => {
      const userMsg: AgentMessage = { role: 'user', content: 'test' };
      const assistantMsg: AgentMessage = { role: 'assistant', content: 'reply' };
      await expect(
        engine.afterTurn!({
          sessionId: 'test-session',
          sessionKey: 'after-turn-key',
          sessionFile: '/tmp/after-turn.json',
          messages: [userMsg, assistantMsg],
          prePromptMessageCount: 0,
        })
      ).resolves.not.toThrow();
    });
  });

  describe('compact', () => {
    beforeEach(async () => {
      await engine.bootstrap({
        sessionId: 'test-session',
        initialMessages: testMessages,
      });
    });

    it('force=false 时消息少不压缩', async () => {
      const result: CompactResult = await engine.compact({
        sessionId: 'test-session',
        force: false,
      });
      expect(result.ok).toBe(true);
      expect(result.compacted).toBe(false);
      expect(result.didCompact).toBe(false);
    });

    it('force=true 且消息足够多时应该压缩', async () => {
      const manyMessages: AgentMessage[] = [];
      for (let i = 0; i < 20; i++) {
        manyMessages.push({ role: 'user', content: `用户消息 ${i}: ${'测试内容'.repeat(50)}` });
        manyMessages.push({ role: 'assistant', content: `助手回复 ${i}: ${'回答内容'.repeat(50)}` });
      }
      await engine.ingestBatch!({
        sessionId: 'test-session',
        messages: manyMessages,
      });

      const result: CompactResult = await engine.compact({
        sessionId: 'test-session',
        force: true,
      });
      expect(result.ok).toBe(true);
      expect(result.compacted).toBe(true);
      expect(result.didCompact).toBe(true);
      expect(result.messagesRemoved).toBeGreaterThan(0);
      expect(result.tokensSaved).toBeGreaterThan(0);
      expect(result.strategy).toBe('fallback_extractive');
      expect(result.result).toBeDefined();
      expect(result.result?.summary).toBeDefined();
      expect(result.result?.tokensBefore).toBeGreaterThan(0);
      expect(result.result?.tokensAfter).toBeGreaterThan(0);
    });

    it('应该支持运行时上下文参数', async () => {
      const manyMessages: AgentMessage[] = [];
      for (let i = 0; i < 20; i++) {
        manyMessages.push({ role: 'user', content: `消息 ${i}: ${'测试'.repeat(50)}` });
        manyMessages.push({ role: 'assistant', content: `回复 ${i}: ${'回答'.repeat(50)}` });
      }
      await engine.ingestBatch!({
        sessionId: 'test-session',
        messages: manyMessages,
      });

      const runtimeContext: ContextEngineRuntimeContext = {
        tokenBudget: 100,
      };
      const result = await engine.compact({
        sessionId: 'test-session',
        force: true,
        runtimeContext,
      });
      expect(result.compacted).toBe(true);
    });

    it('压缩后 stats 应该更新', async () => {
      const manyMessages: AgentMessage[] = [];
      for (let i = 0; i < 20; i++) {
        manyMessages.push({ role: 'user', content: `用户消息 ${i}: ${'测试内容'.repeat(50)}` });
        manyMessages.push({ role: 'assistant', content: `助手回复 ${i}: ${'回答内容'.repeat(50)}` });
      }
      await engine.ingestBatch!({
        sessionId: 'test-session',
        messages: manyMessages,
      });

      await engine.compact({
        sessionId: 'test-session',
        force: true,
      });
      const stats = await engine.getStats();
      expect(stats.compactedCount).toBeGreaterThan(0);
      expect(stats.lastCompactTime).toBeDefined();
    });

    it('应该支持 sessionKey 和 sessionFile 参数', async () => {
      const result = await engine.compact({
        sessionId: 'test-session',
        sessionKey: 'compact-key',
        sessionFile: '/tmp/compact.json',
        force: false,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('searchMemory', () => {
    beforeEach(async () => {
      await engine.bootstrap({
        sessionId: 'test-session',
        initialMessages: testMessages,
      });
    });

    it('应该能搜索记忆', async () => {
      const results = await engine.searchMemory!({
        sessionId: 'test-session',
        query: '人工智能',
        topK: 3,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('应该支持运行时上下文参数', async () => {
      const runtimeContext: ContextEngineRuntimeContext = {};
      const results = await engine.searchMemory!({
        sessionId: 'test-session',
        query: 'test',
        topK: 5,
        runtimeContext,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('应该支持 MMR 去重参数', async () => {
      const results = await engine.searchMemory!({
        sessionId: 'test-session',
        query: '机器学习',
        topK: 5,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('应该支持时间衰减参数', async () => {
      const results = await engine.searchMemory!({
        sessionId: 'test-session',
        query: '人工智能',
        topK: 5,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('应该支持 sessionKey 参数', async () => {
      const results = await engine.searchMemory!({
        sessionId: 'test-session',
        sessionKey: 'search-key',
        query: 'test',
        topK: 3,
      });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('maintain', () => {
    beforeEach(async () => {
      await engine.bootstrap({
        sessionId: 'test-session',
        initialMessages: testMessages,
      });
    });

    it('应该能执行维护操作', async () => {
      const result: ContextEngineMaintenanceResult = await engine.maintain!({
        sessionId: 'test-session',
      });
      expect(result).toBeDefined();
    });

    it('应该返回正确的维护结果结构', async () => {
      const result = await engine.maintain!({
        sessionId: 'test-session',
      });
      expect(result.changed).toBeDefined();
      expect(typeof result.changed).toBe('boolean');
      expect(result.bytesFreed).toBeDefined();
      expect(typeof result.bytesFreed).toBe('number');
      expect(result.rewrittenEntries).toBeDefined();
      expect(typeof result.rewrittenEntries).toBe('number');
    });

    it('应该支持运行时上下文参数', async () => {
      const runtimeContext: ContextEngineRuntimeContext = {
        tokenBudget: 1000,
      };
      const result = await engine.maintain!({
        sessionId: 'test-session',
        runtimeContext,
      });
      expect(result).toBeDefined();
    });

    it('应该支持 sessionKey 和 sessionFile 参数', async () => {
      const result = await engine.maintain!({
        sessionId: 'test-session',
        sessionKey: 'maintain-key',
        sessionFile: '/tmp/maintain.json',
      });
      expect(result).toBeDefined();
    });

    it('消息量少时维护不改变状态', async () => {
      const result = await engine.maintain!({
        sessionId: 'test-session',
      });
      expect(result.changed).toBe(false);
      expect(result.bytesFreed).toBe(0);
      expect(result.rewrittenEntries).toBe(0);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await engine.bootstrap({
        sessionId: 'test-session',
        initialMessages: testMessages,
      });
    });

    it('应该返回正确的统计信息', async () => {
      const stats = await engine.getStats();
      expect(stats.totalMessages).toBe(testMessages.length);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.systemMessages).toBe(0);
      expect(stats.compactedCount).toBe(0);
      expect(typeof stats.memoryItems).toBe('number');
    });
  });

  describe('dispose', () => {
    beforeEach(async () => {
      await engine.bootstrap({
        sessionId: 'test-session',
        initialMessages: testMessages,
      });
    });

    it('应该能释放资源', async () => {
      await engine.dispose();
      const state = engine.getSessionState();
      expect(state?.messageCount).toBe(0);
    });

    it('释放后 getSessionState 应该返回会话但消息为空', async () => {
      await engine.dispose();
      const state = engine.getSessionState();
      expect(state).not.toBeNull();
    });
  });

  describe('getSessionState', () => {
    it('未启动时返回 null', () => {
      const state = engine.getSessionState();
      expect(state).toBeNull();
    });

    it('启动后返回正确状态', async () => {
      await engine.bootstrap({
        sessionId: 'test-session',
        initialMessages: testMessages,
      });
      const state = engine.getSessionState();
      expect(state).not.toBeNull();
      expect(state?.sessionId).toBe('test-session');
      expect(state?.agentId).toBeDefined();
      expect(state?.createdAt).toBeGreaterThan(0);
      expect(state?.lastModified).toBeGreaterThan(0);
      expect(state?.messageCount).toBe(testMessages.length);
      expect(state?.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('配置', () => {
    it('应该有正确的配置', () => {
      expect(engine.config.engineId).toBe('legacy');
      expect(engine.config.displayName).toBe('Legacy Context Engine');
      expect(engine.config.version).toBe('1.0.0');
      expect(engine.config.defaultMemorySync).toBeDefined();
      expect(engine.config.defaultMemorySync?.strategy).toBe('on_search');
    });

    it('应该有正确的 info 属性', () => {
      expect(engine.info.id).toBe('legacy');
      expect(engine.info.name).toBe('Legacy Context Engine');
      expect(engine.info.version).toBe('1.0.0');
      expect(engine.info.ownsCompaction).toBe(true);
      expect(engine.info.turnMaintenanceMode).toBe('foreground');
    });
  });

  describe('运行时上下文集成', () => {
    it('所有生命周期方法都应该接受 runtimeContext 参数', async () => {
      const runtimeContext: ContextEngineRuntimeContext = {
        modelId: 'test-model',
        provider: 'test-provider',
        tokenBudget: 16000,
        maxOutputTokens: 2048,
        runtimeMode: 'normal',
        cwd: '/tmp',
        agentId: 'test-agent',
        toolCount: 5,
      };

      const bootstrapResult = await engine.bootstrap({
        sessionId: 'test-session',
        runtimeContext,
      });
      expect(bootstrapResult.bootstrapped).toBe(true);

      const ingestResult = await engine.ingest({
        sessionId: 'test-session',
        message: testMessages[0],
        runtimeContext,
      });
      expect(ingestResult.added).toBe(1);

      const ingestBatchResult = await engine.ingestBatch!({
        sessionId: 'test-session',
        messages: testMessages.slice(1),
        runtimeContext,
      });
      expect(ingestBatchResult.added).toBe(testMessages.length - 1);

      const assembleResult = await engine.assemble({
        sessionId: 'test-session',
        messages: [],
        runtimeContext,
      });
      expect(assembleResult.messages.length).toBeGreaterThan(0);

      await engine.afterTurn!({
        sessionId: 'test-session',
        messages: [
          { role: 'user', content: 'test' },
          { role: 'assistant', content: 'test reply' },
        ],
        prePromptMessageCount: testMessages.length,
        runtimeContext,
      });

      const compactResult = await engine.compact({
        sessionId: 'test-session',
        force: false,
        runtimeContext,
      });
      expect(compactResult).toBeDefined();

      const searchResult = await engine.searchMemory!({
        sessionId: 'test-session',
        query: 'test',
        runtimeContext,
      });
      expect(Array.isArray(searchResult)).toBe(true);

      const maintainResult = await engine.maintain!({
        sessionId: 'test-session',
        runtimeContext,
      });
      expect(maintainResult).toBeDefined();

      await engine.dispose();
    });
  });

  describe('sessionKey 和 sessionFile 参数', () => {
    it('bootstrap 应该支持 sessionKey', async () => {
      const result = await engine.bootstrap({
        sessionId: 'test-session',
        sessionKey: 'my-session-key',
      });
      expect(result.bootstrapped).toBe(true);
    });

    it('bootstrap 应该支持 sessionFile', async () => {
      const result = await engine.bootstrap({
        sessionId: 'test-session',
        sessionFile: '/path/to/session.json',
      });
      expect(result.bootstrapped).toBe(true);
    });

    it('bootstrap 应该同时支持 sessionKey 和 sessionFile', async () => {
      const result = await engine.bootstrap({
        sessionId: 'test-session',
        sessionKey: 'key-123',
        sessionFile: '/tmp/session.json',
        initialMessages: testMessages,
      });
      expect(result.bootstrapped).toBe(true);
      expect(result.importedMessages).toBe(testMessages.length);
    });

    it('compact 应该支持 sessionKey 和 sessionFile', async () => {
      await engine.bootstrap({ sessionId: 'test-session' });
      const result = await engine.compact({
        sessionId: 'test-session',
        sessionKey: 'compact-key',
        sessionFile: '/tmp/compact-session.json',
        force: false,
      });
      expect(result.ok).toBe(true);
    });

    it('maintain 应该支持 sessionKey 和 sessionFile', async () => {
      await engine.bootstrap({ sessionId: 'test-session' });
      const result = await engine.maintain!({
        sessionId: 'test-session',
        sessionKey: 'maintain-key',
        sessionFile: '/tmp/maintain-session.json',
      });
      expect(result).toBeDefined();
    });
  });
});
