import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenBudgetManager, calculateTokenEstimate } from '../token-budget.js';
import { RelevanceScorer } from '../relevance-scorer.js';
import { MemoryLayers } from '../memory-layers.js';
import { Summarizer } from '../summarizer.js';
import { ContextCompactor } from '../compaction.js';
import { MessageFilter } from '../message-filter.js';
import { VectorRetrieval } from '../retrieval.js';
import { ArtifactStore } from '../artifact-store.js';
import { WorkspaceContext } from '../workspace-context.js';
import { ToolContext } from '../tool-context.js';
import { ContextBuilder } from '../context-builder.js';
import { EnhancedContextEngine } from '../context-engine.js';

vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('TokenBudgetManager', () => {
  let budget: TokenBudgetManager;

  beforeEach(() => {
    budget = new TokenBudgetManager({ totalBudget: 100000 });
  });

  it('should initialize with correct default values', () => {
    const stats = budget.getStats();
    expect(stats.totalBudget).toBe(100000);
    expect(stats.status).toBe('normal');
  });

  it('should estimate tokens correctly', () => {
    const estimate = budget.estimateTokens('Hello world', 'user');
    expect(estimate.totalTokens).toBeGreaterThan(0);
    expect(estimate.contentTokens).toBe(Math.ceil(11 * 0.25));
  });

  it('should add tokens to categories', () => {
    const result = budget.addTokens('conversation', 1000);
    expect(result).toBe(true);
    const stats = budget.getStats();
    expect(stats.conversationTokens).toBe(1000);
  });

  it('should return false when budget exceeded', () => {
    const result = budget.addTokens('conversation', 200000);
    expect(result).toBe(false);
  });

  it('should detect compaction need', () => {
    budget.addTokens('conversation', 80000);
    expect(budget.needsCompaction()).toBe(true);
  });

  it('should reset budget correctly', () => {
    budget.addTokens('conversation', 5000);
    budget.reset();
    const stats = budget.getStats();
    expect(stats.conversationTokens).toBe(0);
  });

  it('calculateTokenEstimate should work standalone', () => {
    const tokens = calculateTokenEstimate('test');
    expect(tokens).toBe(Math.ceil(4 * 0.25));
  });
});

describe('RelevanceScorer', () => {
  let scorer: RelevanceScorer;

  beforeEach(() => {
    scorer = new RelevanceScorer();
  });

  it('should score items with keyword match', () => {
    const items = [
      { id: '1', content: 'JavaScript is great', source: 'docs' },
      { id: '2', content: 'Python is cool', source: 'docs' },
    ];
    const results = scorer.scoreItems('JavaScript', items);
    expect(results[0].id).toBe('1');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should respect topK option', () => {
    const items = [
      { id: '1', content: 'apple pie recipe' },
      { id: '2', content: 'banana bread' },
      { id: '3', content: 'cherry pie' },
    ];
    const results = scorer.scoreItems('apple', items, { topK: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should calculate score breakdown', () => {
    const items = [{ id: '1', content: 'test keyword here', timestamp: Date.now() }];
    const results = scorer.scoreItems('keyword', items);
    expect(results[0].scoreBreakdown).toBeDefined();
    expect(results[0].scoreBreakdown.keywordScore).toBeGreaterThanOrEqual(0);
  });
});

describe('MemoryLayers', () => {
  let memory: MemoryLayers;

  beforeEach(() => {
    memory = new MemoryLayers();
  });

  it('should add item to short-term memory', () => {
    const item = memory.addItem('test content', { layer: 'short-term', source: 'test' });
    expect(item.id).toBeDefined();
    expect(item.layer).toBe('short-term');
  });

  it('should search memory by content', () => {
    memory.addItem('apple pie recipe', { layer: 'short-term', source: 'test' });
    memory.addItem('chicken soup recipe', { layer: 'short-term', source: 'test' });
    const results = memory.search({ query: 'apple', topK: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('apple');
  });

  it('should get memory stats', () => {
    memory.addItem('test1', { layer: 'working', source: 'test' });
    memory.addItem('test2', { layer: 'short-term', source: 'test' });
    const stats = memory.getStats();
    expect(stats.totalItems).toBe(2);
    expect(stats.workingMemory.itemCount).toBe(1);
    expect(stats.shortTermMemory.itemCount).toBe(1);
  });

  it('should clear all memory', () => {
    memory.addItem('test', { layer: 'short-term', source: 'test' });
    memory.clearAll();
    const stats = memory.getStats();
    expect(stats.totalItems).toBe(0);
  });
});

describe('Summarizer', () => {
  let summarizer: Summarizer;

  beforeEach(() => {
    summarizer = new Summarizer();
  });

  it('should summarize short text as-is', () => {
    const text = 'Short text.';
    const result = summarizer.summarize(text);
    expect(result.summary).toBe(text);
    expect(result.compressionRatio).toBe(1);
  });

  it('should use extractive strategy', () => {
    const text = '这是第一句话，内容比较普通。这是第二句话，非常重要，包含了关键的核心信息。这是第三句话。这是第四句话。这是第五句话。这是第六句话。这是第七句话。这是第八句话。';
    const result = summarizer.summarize(text, { strategy: 'extractive', sentenceCount: 2 });
    expect(result.summary.length).toBeLessThan(text.length);
    expect(result.strategy).toBe('extractive');
  });

  it('should extract key points', () => {
    const text = '重要结论：测试成功。这是第一点。这是第二点。TODO: 完成任务。';
    const keyPoints = summarizer.extractKeyPoints(text, 3);
    expect(Array.isArray(keyPoints)).toBe(true);
    expect(keyPoints.length).toBeGreaterThan(0);
  });

  it('should find important keywords', () => {
    const text = '这是一个 IMPORTANT 的任务，有 BUG 需要修复。';
    const keywords = summarizer.findImportantKeywords(text);
    expect(keywords).toContain('IMPORTANT');
    expect(keywords).toContain('BUG');
  });

  it('should create conversation summary', () => {
    const messages = [
      { role: 'user', content: '你好，请帮我写代码' },
      { role: 'assistant', content: '好的，请问什么类型的代码？' },
    ];
    const result = summarizer.createConversationSummary(messages);
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

describe('ContextCompactor', () => {
  let compactor: ContextCompactor;

  beforeEach(() => {
    compactor = new ContextCompactor();
  });

  it('should compact messages using truncate strategy', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      id: `msg_${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `消息内容 ${i}`,
    }));
    const result = compactor.compact(messages, 100, { strategy: 'truncate' });
    expect(result.success).toBe(true);
    expect(result.compactedMessageCount).toBeLessThan(messages.length);
  });

  it('should compact using importance strategy', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      id: `msg_${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `消息内容 ${i}`,
      importance: i / 20,
    }));
    const result = compactor.compact(messages, 100, { strategy: 'importance' });
    expect(result.success).toBe(true);
  });

  it('should preserve system messages', () => {
    const messages = [
      { id: 'sys1', role: 'system', content: '系统提示词' },
      { id: 'u1', role: 'user', content: '用户消息1' },
      { id: 'u2', role: 'user', content: '用户消息2' },
    ];
    const result = compactor.compact(messages, 50, { preserveSystemMessages: true });
    const keptIds = new Set(
      messages.filter(m => !result.removedMessageIds.includes(m.id)).map(m => m.id)
    );
    expect(keptIds.has('sys1')).toBe(true);
  });
});

describe('MessageFilter', () => {
  let filter: MessageFilter;

  beforeEach(() => {
    filter = new MessageFilter();
  });

  it('should remove empty messages', () => {
    const result = filter.filter({ id: '1', role: 'user', content: '   ' });
    expect(result.action).toBe('remove');
    expect(result.matchedRules).toContain('empty-message');
  });

  it('should apply keyword filter rule', () => {
    filter.addRule({
      type: 'keyword',
      pattern: 'badword',
      enabled: true,
      action: 'remove',
      priority: 10,
    });
    const result = filter.filter({ id: '1', role: 'user', content: 'this has badword in it' });
    expect(result.action).toBe('remove');
  });

  it('should apply length truncation rule', () => {
    filter.addRule({
      type: 'length',
      maxLength: 10,
      enabled: true,
      action: 'truncate',
      priority: 10,
    });
    const result = filter.filter({ id: '1', role: 'user', content: 'this is a very long message' });
    expect(result.action).toBe('truncate');
    expect(result.truncatedContent?.length).toBeLessThanOrEqual(10);
  });

  it('should filter by role', () => {
    filter.addRule({
      type: 'role',
      role: 'system',
      enabled: true,
      action: 'flag',
      priority: 10,
    });
    const result = filter.filter({ id: '1', role: 'system', content: 'system message' });
    expect(result.action).toBe('flag');
  });

  it('should deduplicate messages', () => {
    const msg = { id: '1', role: 'user', content: 'same content' };
    filter.filter(msg);
    const result = filter.filter({ ...msg, id: '2' });
    expect(result.action).toBe('remove');
    expect(result.matchedRules).toContain('duplicate');
  });

  it('should batch filter messages', () => {
    const messages = [
      { id: '1', role: 'user', content: 'hello' },
      { id: '2', role: 'user', content: '' },
      { id: '3', role: 'user', content: 'world' },
    ];
    const result = filter.filterBatch(messages);
    expect(result.kept.length).toBe(2);
    expect(result.removed.length).toBe(1);
  });
});

describe('VectorRetrieval', () => {
  let retrieval: VectorRetrieval;

  beforeEach(() => {
    retrieval = new VectorRetrieval({ type: 'in-memory' });
  });

  it('should insert and search vectors', async () => {
    await retrieval.insert({
      id: '1',
      content: 'JavaScript programming language',
      source: 'docs',
    });
    await retrieval.insert({
      id: '2',
      content: 'Python programming language',
      source: 'docs',
    });

    const results = await retrieval.search('JavaScript', { topK: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('1');
  });

  it('should support hybrid search', async () => {
    await retrieval.insert({ id: '1', content: 'apple banana cherry' });
    const results = await retrieval.search('apple', { hybridSearch: true });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should delete records', async () => {
    await retrieval.insert({ id: '1', content: 'test' });
    const deleted = await retrieval.delete('1');
    expect(deleted).toBe(true);
    const results = await retrieval.search('test');
    expect(results.find(r => r.id === '1')).toBeUndefined();
  });

  it('should get stats', async () => {
    await retrieval.insert({ id: '1', content: 'test1' });
    await retrieval.insert({ id: '2', content: 'test2' });
    await retrieval.search('test');
    const stats = retrieval.getStats();
    expect(stats.totalRecords).toBe(2);
    expect(stats.insertCount).toBe(2);
    expect(stats.searchCount).toBe(1);
  });

  it('should clear all records', async () => {
    await retrieval.insert({ id: '1', content: 'test' });
    await retrieval.clear();
    const stats = retrieval.getStats();
    expect(stats.totalRecords).toBe(0);
  });

  it('should support milvus type config', () => {
    const milvusRetrieval = new VectorRetrieval({ type: 'milvus', endpoint: 'http://localhost:19530' });
    expect(milvusRetrieval.getConfig().type).toBe('milvus');
  });

  it('should support qdrant type config', () => {
    const qdrantRetrieval = new VectorRetrieval({ type: 'qdrant', endpoint: 'http://localhost:6333' });
    expect(qdrantRetrieval.getConfig().type).toBe('qdrant');
  });
});

describe('ArtifactStore', () => {
  let store: ArtifactStore;

  beforeEach(() => {
    store = new ArtifactStore();
  });

  it('should add artifact', () => {
    const artifact = store.add({
      type: 'code',
      name: 'test.ts',
      content: 'console.log("hello")',
      contentType: 'text/typescript',
      source: 'test',
    });
    expect(artifact.id).toBeDefined();
    expect(artifact.type).toBe('code');
    expect(artifact.sizeBytes).toBeGreaterThan(0);
  });

  it('should get artifact by id', () => {
    const added = store.add({
      type: 'file',
      name: 'readme.txt',
      content: 'hello world',
      contentType: 'text/plain',
      source: 'test',
    });
    const found = store.get(added.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('readme.txt');
  });

  it('should search artifacts by type', () => {
    store.add({ type: 'code', name: 'a.ts', content: 'a', contentType: 'text/ts', source: 'test' });
    store.add({ type: 'document', name: 'b.md', content: 'b', contentType: 'text/md', source: 'test' });
    const results = store.search({ type: 'code' });
    expect(results.length).toBe(1);
    expect(results[0].type).toBe('code');
  });

  it('should update artifact', () => {
    const added = store.add({
      type: 'code',
      name: 'old.ts',
      content: 'old',
      contentType: 'text/ts',
      source: 'test',
    });
    const updated = store.update(added.id, { name: 'new.ts', content: 'new content' });
    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('new.ts');
  });

  it('should remove artifact', () => {
    const added = store.add({
      type: 'code',
      name: 'test.ts',
      content: 'test',
      contentType: 'text/ts',
      source: 'test',
    });
    const removed = store.remove(added.id);
    expect(removed).toBe(true);
    expect(store.get(added.id)).toBeNull();
  });

  it('should get stats', () => {
    store.add({ type: 'code', name: 'a.ts', content: 'aaa', contentType: 'text/ts', source: 'test' });
    store.add({ type: 'code', name: 'b.ts', content: 'bbb', contentType: 'text/ts', source: 'test' });
    const stats = store.getStats();
    expect(stats.totalArtifacts).toBe(2);
    expect(stats.byType['code']?.count).toBe(2);
  });

  it('should clear all artifacts', () => {
    store.add({ type: 'code', name: 'a.ts', content: 'a', contentType: 'text/ts', source: 'test' });
    const count = store.clear();
    expect(count).toBe(1);
    expect(store.getStats().totalArtifacts).toBe(0);
  });
});

describe('WorkspaceContext', () => {
  let workspace: WorkspaceContext;

  beforeEach(() => {
    workspace = new WorkspaceContext();
  });

  it('should add and get files', () => {
    const result = workspace.addFile({
      path: '/src/index.ts',
      name: 'index.ts',
      extension: '.ts',
      size: 1024,
      modifiedAt: Date.now(),
      createdAt: Date.now(),
      isDirectory: false,
      language: 'typescript',
    });
    expect(result).toBe(true);
    const file = workspace.getFile('/src/index.ts');
    expect(file).not.toBeNull();
    expect(file?.name).toBe('index.ts');
  });

  it('should search files by query', () => {
    workspace.addFile({
      path: '/src/user.ts',
      name: 'user.ts',
      extension: '.ts',
      size: 100,
      modifiedAt: Date.now(),
      createdAt: Date.now(),
      isDirectory: false,
    });
    workspace.addFile({
      path: '/src/product.ts',
      name: 'product.ts',
      extension: '.ts',
      size: 200,
      modifiedAt: Date.now(),
      createdAt: Date.now(),
      isDirectory: false,
    });
    const results = workspace.search({ query: 'user', maxResults: 10 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('user.ts');
  });

  it('should filter by extension', () => {
    workspace.addFile({
      path: '/a.ts', name: 'a.ts', extension: '.ts', size: 100,
      modifiedAt: Date.now(), createdAt: Date.now(), isDirectory: false,
    });
    workspace.addFile({
      path: '/b.py', name: 'b.py', extension: '.py', size: 100,
      modifiedAt: Date.now(), createdAt: Date.now(), isDirectory: false,
    });
    const results = workspace.search({ extension: '.ts' });
    expect(results.length).toBe(1);
    expect(results[0].extension).toBe('.ts');
  });

  it('should get stats', () => {
    workspace.addFile({
      path: '/a.ts', name: 'a.ts', extension: '.ts', size: 100,
      modifiedAt: Date.now(), createdAt: Date.now(), isDirectory: false,
    });
    const stats = workspace.getStats();
    expect(stats.totalFiles).toBe(1);
    expect(stats.byExtension['.ts']).toBe(1);
  });

  it('should check supported extension', () => {
    expect(workspace.isSupportedExtension('.ts')).toBe(true);
    expect(workspace.isSupportedExtension('.xyz')).toBe(false);
  });

  it('should check excluded path', () => {
    expect(workspace.isExcludedPath('/node_modules/test.ts')).toBe(true);
    expect(workspace.isExcludedPath('/src/test.ts')).toBe(false);
  });
});

describe('ToolContext', () => {
  let toolCtx: ToolContext;

  beforeEach(() => {
    toolCtx = new ToolContext();
  });

  it('should start and complete tool call', () => {
    const call = toolCtx.startToolCall('readFile', { path: '/test.ts' });
    expect(call.status).toBe('running');
    expect(call.toolName).toBe('readFile');

    const completed = toolCtx.completeToolCall(call.id, 'file content');
    expect(completed?.status).toBe('completed');
    expect(completed?.success).toBe(true);
  });

  it('should handle failed tool call', () => {
    const call = toolCtx.startToolCall('writeFile', { path: '/test.ts' });
    const failed = toolCtx.failToolCall(call.id, 'permission denied');
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toBe('permission denied');
  });

  it('should get recent calls', () => {
    const c1 = toolCtx.startToolCall('toolA', {});
    toolCtx.completeToolCall(c1.id, 'resultA');
    const c2 = toolCtx.startToolCall('toolB', {});
    toolCtx.completeToolCall(c2.id, 'resultB');

    const recent = toolCtx.getRecentCalls(10);
    expect(recent.length).toBe(2);
  });

  it('should get tool stats', () => {
    const c1 = toolCtx.startToolCall('toolA', {});
    toolCtx.completeToolCall(c1.id, 'ok');

    const stats = toolCtx.getToolStats();
    expect(stats.totalCalls).toBe(1);
    expect(stats.successfulCalls).toBe(1);
    expect(stats.byTool['toolA']?.calls).toBe(1);
  });

  it('should get most used tools', () => {
    for (let i = 0; i < 3; i++) {
      const call = toolCtx.startToolCall('readFile', {});
      toolCtx.completeToolCall(call.id, 'result');
    }
    const mostUsed = toolCtx.getMostUsedTools(5);
    expect(mostUsed[0].toolName).toBe('readFile');
    expect(mostUsed[0].calls).toBe(3);
  });

  it('should clear history', () => {
    const call = toolCtx.startToolCall('test', {});
    toolCtx.completeToolCall(call.id, 'result');
    const count = toolCtx.clearHistory();
    expect(count).toBe(1);
    expect(toolCtx.getToolStats().totalCalls).toBe(0);
  });
});

describe('ContextBuilder', () => {
  let builder: ContextBuilder;

  beforeEach(() => {
    builder = new ContextBuilder();
  });

  it('should build context from messages', () => {
    const messages = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];
    const result = builder.build(messages);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it('should include memory items when enabled', () => {
    const messages = [{ role: 'user', content: 'test' }];
    const result = builder.build(messages, { includeMemory: true });
    expect(result.memoryItems).toBeDefined();
  });

  it('should respect maxTokens option', () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `消息内容 ${i}，这是一段比较长的内容用于测试 token 预算。`.repeat(5),
    }));
    const result = builder.build(messages, { maxTokens: 500 });
    expect(result.totalTokens).toBeLessThanOrEqual(1000);
  });
});

describe('EnhancedContextEngine', () => {
  let engine: EnhancedContextEngine;

  beforeEach(() => {
    engine = new EnhancedContextEngine('test-session', { tokenBudget: 50000 });
  });

  it('should initialize correctly', () => {
    expect(engine.info.id).toBe('enhanced');
    expect(engine.getSessionState()?.sessionId).toBe('test-session');
  });

  it('should bootstrap with initial messages', async () => {
    const result = await engine.bootstrap({
      sessionId: 'test-session',
      initialMessages: [
        { role: 'system', content: '系统提示' },
        { role: 'user', content: '你好' },
      ],
    });
    expect(result.bootstrapped).toBe(true);
    expect(result.importedMessages).toBe(2);
  });

  it('should ingest messages', async () => {
    await engine.bootstrap({ sessionId: 'test-session' });
    const result = await engine.ingest({
      sessionId: 'test-session',
      message: { role: 'user', content: 'Hello world' },
    });
    expect(result.ingested).toBe(true);
    expect(result.added).toBe(1);
  });

  it('should assemble context', async () => {
    await engine.bootstrap({
      sessionId: 'test-session',
      initialMessages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
    });
    const result = await engine.assemble({
      sessionId: 'test-session',
      messages: engine.getMessages(),
      prompt: 'test query',
    });
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });

  it('should compact when needed', async () => {
    await engine.bootstrap({ sessionId: 'test-session' });
    for (let i = 0; i < 100; i++) {
      await engine.ingest({
        sessionId: 'test-session',
        message: {
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `长消息内容 ${i}，这是一段用于测试压缩功能的长文本。`.repeat(10),
        },
      });
    }
    const compactResult = await engine.compact({
      sessionId: 'test-session',
      force: true,
      tokenBudget: 1000,
    });
    expect(compactResult.compacted).toBe(true);
    expect(compactResult.messagesRemoved).toBeGreaterThan(0);
  });

  it('should search memory', async () => {
    await engine.bootstrap({ sessionId: 'test-session' });
    await engine.ingest({
      sessionId: 'test-session',
      message: { role: 'user', content: 'JavaScript is a programming language' },
    });
    const results = await engine.searchMemory({
      sessionId: 'test-session',
      query: 'JavaScript',
      topK: 5,
    });
    expect(Array.isArray(results)).toBe(true);
  });

  it('should get stats', async () => {
    await engine.bootstrap({
      sessionId: 'test-session',
      initialMessages: [
        { role: 'user', content: 'Hello' },
      ],
    });
    const stats = await engine.getStats();
    expect(stats.totalMessages).toBe(1);
    expect(stats.totalTokens).toBeGreaterThan(0);
  });

  it('should dispose properly', async () => {
    await engine.bootstrap({ sessionId: 'test-session' });
    await engine.dispose();
    const stats = await engine.getStats();
    expect(stats.memoryItems).toBe(0);
  });

  it('should provide access to sub-modules', () => {
    expect(engine.getTokenBudget()).toBeDefined();
    expect(engine.getMemoryLayers()).toBeDefined();
    expect(engine.getRelevanceScorer()).toBeDefined();
    expect(engine.getSummarizer()).toBeDefined();
    expect(engine.getCompactor()).toBeDefined();
    expect(engine.getMessageFilter()).toBeDefined();
    expect(engine.getArtifactStore()).toBeDefined();
    expect(engine.getWorkspaceContext()).toBeDefined();
    expect(engine.getToolContext()).toBeDefined();
    expect(engine.getVectorRetrieval()).toBeDefined();
    expect(engine.getContextBuilder()).toBeDefined();
  });
});
