// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContextProjectionManager,
  computeProjectionFingerprint,
  compareProjections,
  mergeProjections,
  computeProjectionDiff,
  mmrRerank,
  type ProjectionType,
} from '../context-projection.js';

interface TestMessage {
  role: string;
  content: string;
}

function makeMessages(count: number): TestMessage[] {
  const msgs: TestMessage[] = [];
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? 'user' : 'assistant';
    msgs.push({ role, content: `Message ${i + 1} content with some text` });
  }
  return msgs;
}

function buildProjection(
  manager: ContextProjectionManager,
  sessionId: string,
  messages: Array<{ role: string; content: unknown }>,
  options: { type: ProjectionType; maxTokens?: number; includeSystem?: boolean; tags?: string[]; ttlMs?: number },
) {
  return manager.buildProjection(sessionId, messages, options);
}

describe('context-projection - fingerprint', () => {
  it('should generate deterministic fingerprint', () => {
    const messages = makeMessages(3);
    const fp1 = computeProjectionFingerprint({ messages });
    const fp2 = computeProjectionFingerprint({ messages });
    expect(fp1).toBe(fp2);
    expect(fp1.length).toBeGreaterThan(0);
  });

  it('should generate different fingerprints for different messages', () => {
    const fp1 = computeProjectionFingerprint({ messages: makeMessages(2) });
    const fp2 = computeProjectionFingerprint({ messages: makeMessages(3) });
    expect(fp1).not.toBe(fp2);
  });

  it('should include system prompt in fingerprint', () => {
    const messages = makeMessages(2);
    const fp1 = computeProjectionFingerprint({ messages, systemPrompt: 'sys1' });
    const fp2 = computeProjectionFingerprint({ messages, systemPrompt: 'sys2' });
    expect(fp1).not.toBe(fp2);
  });

  it('should include tools in fingerprint', () => {
    const messages = makeMessages(2);
    const fp1 = computeProjectionFingerprint({ messages, tools: [{ name: 't1' }] });
    const fp2 = computeProjectionFingerprint({ messages, tools: [{ name: 't2' }] });
    expect(fp1).not.toBe(fp2);
  });

  it('should include agentId in fingerprint', () => {
    const messages = makeMessages(2);
    const fp1 = computeProjectionFingerprint({ messages, agentId: 'agent1' });
    const fp2 = computeProjectionFingerprint({ messages, agentId: 'agent2' });
    expect(fp1).not.toBe(fp2);
  });

  it('should include modelId in fingerprint', () => {
    const messages = makeMessages(2);
    const fp1 = computeProjectionFingerprint({ messages, modelId: 'model1' });
    const fp2 = computeProjectionFingerprint({ messages, modelId: 'model2' });
    expect(fp1).not.toBe(fp2);
  });
});

describe('context-projection - build from messages', () => {
  let manager: ContextProjectionManager;

  beforeEach(() => {
    manager = new ContextProjectionManager(5);
  });

  it('should build full projection', () => {
    const messages = makeMessages(5);
    const proj = buildProjection(manager, 'sess-1', messages, { type: 'full' });

    expect(proj.source.sessionId).toBe('sess-1');
    expect(proj.type).toBe('full');
    expect(proj.content.messages.length).toBe(5);
    expect(proj.content.tokenCount).toBeGreaterThan(0);
    expect(proj.fingerprint).toBeTruthy();
    expect(proj.epoch).toBeGreaterThan(0);
    expect(proj.tags).toContain('full');
  });

  it('should build compact projection', () => {
    const messages = makeMessages(10);
    const proj = buildProjection(manager, 'sess-1', messages, {
      type: 'compact',
      maxTokens: 50,
    });

    expect(proj.type).toBe('compact');
    expect(proj.content.tokenCount).toBeLessThanOrEqual(50);
    expect(proj.tags).toContain('compact');
  });

  it('should include custom tags', () => {
    const messages = makeMessages(3);
    const proj = buildProjection(manager, 'sess-1', messages, {
      type: 'full',
      tags: ['custom-tag'],
    });

    expect(proj.tags).toContain('full');
    expect(proj.tags).toContain('custom-tag');
  });

  it('should set TTL expiration', () => {
    const messages = makeMessages(3);
    const proj = buildProjection(manager, 'sess-1', messages, {
      type: 'full',
      ttlMs: 60000,
    });

    expect(proj.expiresAt).toBeDefined();
    expect(proj.expiresAt!).toBeGreaterThan(Date.now());
    expect(proj.expiresAt!).toBeLessThanOrEqual(Date.now() + 60000 + 100);
  });

  it('should exclude system messages when includeSystem is false', () => {
    const messages = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    const proj = buildProjection(manager, 'sess-1', messages, {
      type: 'full',
      includeSystem: false,
    });

    expect(proj.content.messages.length).toBe(2);
    expect(proj.content.messages.some(m => m.role === 'system')).toBe(false);
  });
});

describe('context-projection - manager', () => {
  let manager: ContextProjectionManager;

  beforeEach(() => {
    manager = new ContextProjectionManager(5);
  });

  it('should add projection', () => {
    const messages = makeMessages(3);
    const proj = buildProjection(manager, 'sess-1', messages, { type: 'full' });
    manager.addProjection(proj);
    expect(manager.getProjection(proj.id)).toBe(proj);
  });

  it('should find by fingerprint', () => {
    const messages = makeMessages(3);
    const proj = buildProjection(manager, 'sess-1', messages, { type: 'full' });
    manager.addProjection(proj);

    const found = manager.findByFingerprint(proj.fingerprint, 'sess-1', 'full');
    expect(found).toBe(proj);
  });

  it('should return null for non-existent fingerprint', () => {
    const found = manager.findByFingerprint('nonexistent', 'sess-1', 'full');
    expect(found).toBeNull();
  });

  it('should bump epoch when adding with same fingerprint', () => {
    const messages = makeMessages(3);
    const proj1 = buildProjection(manager, 'sess-1', messages, { type: 'full' });
    manager.addProjection(proj1);

    const proj2 = buildProjection(manager, 'sess-1', messages, { type: 'full' });
    manager.addProjection(proj2);

    expect(proj2.epoch).toBe(proj1.epoch + 1);
  });

  it('should list projections by session', () => {
    for (let i = 0; i < 3; i++) {
      const messages = makeMessages(i + 1);
      const proj = buildProjection(manager, 'sess-1', messages, { type: 'full' });
      manager.addProjection(proj);
    }

    const list = manager.listBySession('sess-1');
    expect(list.length).toBe(3);
  });

  it('should delete projection', () => {
    const messages = makeMessages(3);
    const proj = buildProjection(manager, 'sess-1', messages, { type: 'full' });
    manager.addProjection(proj);

    expect(manager.delete(proj.id)).toBe(true);
    expect(manager.getProjection(proj.id)).toBeNull();
  });

  it('should evict oldest when max exceeded', () => {
    for (let i = 0; i < 10; i++) {
      const messages = makeMessages(i + 1);
      const proj = buildProjection(manager, `sess-${i}`, messages, { type: 'full' });
      manager.addProjection(proj);
    }

    expect(manager.size).toBe(5);
  });

  it('should clear all projections', () => {
    for (let i = 0; i < 3; i++) {
      const messages = makeMessages(i + 1);
      const proj = buildProjection(manager, 'sess-1', messages, { type: 'full' });
      manager.addProjection(proj);
    }

    manager.clear();
    expect(manager.size).toBe(0);
  });

  it('should return stats', () => {
    for (let i = 0; i < 3; i++) {
      const messages = makeMessages(i + 1);
      const proj = buildProjection(manager, 'sess-1', messages, { type: 'full' });
      manager.addProjection(proj);
    }

    const stats = manager.getStats();
    expect(stats.totalProjections).toBe(3);
    expect(stats.sessionsWithProjections).toBe(1);
    expect(stats.maxProjections).toBe(5);
  });
});

describe('context-projection - compare', () => {
  let manager: ContextProjectionManager;

  beforeEach(() => {
    manager = new ContextProjectionManager(5);
  });

  it('should detect identical projections', () => {
    const messages = makeMessages(5);
    const proj1 = buildProjection(manager, 'sess-1', messages, { type: 'full' });
    const proj2 = buildProjection(manager, 'sess-1', messages, { type: 'full' });

    const result = compareProjections(proj1, proj2);
    expect(result.areIdentical).toBe(true);
    expect(result.messageCountDiff).toBe(0);
    expect(result.addedMessages).toBe(0);
    expect(result.removedMessages).toBe(0);
  });

  it('should detect added messages', () => {
    const proj1 = buildProjection(manager, 'sess-1', makeMessages(3), { type: 'full' });
    const proj2 = buildProjection(manager, 'sess-1', makeMessages(5), { type: 'full' });

    const result = compareProjections(proj1, proj2);
    expect(result.areIdentical).toBe(false);
    expect(result.messageCountDiff).toBe(2);
    expect(result.addedMessages).toBeGreaterThan(0);
  });

  it('should compute epoch difference', () => {
    const messages = makeMessages(3);
    const proj1 = buildProjection(manager, 'sess-1', messages, { type: 'full' });
    const proj2 = buildProjection(manager, 'sess-1', messages, { type: 'full' });
    proj2.epoch = proj1.epoch + 5;

    const result = compareProjections(proj1, proj2);
    expect(result.epochDiff).toBe(5);
  });
});

describe('context-projection - merge', () => {
  let manager: ContextProjectionManager;

  beforeEach(() => {
    manager = new ContextProjectionManager(5);
  });

  it('should merge with newest strategy', () => {
    const proj1 = buildProjection(manager, 'sess-1', makeMessages(3), { type: 'full' });
    const proj2 = buildProjection(manager, 'sess-1', makeMessages(5), { type: 'full' });

    const merged = mergeProjections([proj1, proj2], { strategy: 'newest' });
    expect(merged.content.messages.length).toBe(5);
  });

  it('should merge with union strategy', () => {
    const proj1 = buildProjection(manager, 'sess-1', makeMessages(3), { type: 'full' });
    const proj2 = buildProjection(manager, 'sess-1', makeMessages(5), { type: 'full' });

    const merged = mergeProjections([proj1, proj2], { strategy: 'union' });
    expect(merged.content.messages.length).toBe(5);
  });

  it('should merge with intersection strategy', () => {
    const proj1 = buildProjection(manager, 'sess-1', makeMessages(5), { type: 'full' });
    const proj2 = buildProjection(manager, 'sess-1', makeMessages(5), { type: 'full' });

    const merged = mergeProjections([proj1, proj2], { strategy: 'intersection' });
    expect(merged.content.messages.length).toBe(5);
  });

  it('should merge with longest strategy', () => {
    const proj1 = buildProjection(manager, 'sess-1', makeMessages(3), { type: 'full' });
    const proj2 = buildProjection(manager, 'sess-1', makeMessages(5), { type: 'full' });

    const merged = mergeProjections([proj1, proj2], { strategy: 'longest' });
    expect(merged.content.messages.length).toBe(5);
  });

  it('should respect maxTokens option', () => {
    const proj = buildProjection(manager, 'sess-1', makeMessages(10), { type: 'full' });

    const merged = mergeProjections([proj], { strategy: 'newest', maxTokens: 10 });
    expect(merged.content.tokenCount).toBeLessThanOrEqual(10);
  });

  it('should throw for empty array', () => {
    expect(() => mergeProjections([], { strategy: 'newest' })).toThrow();
  });

  it('should return single projection as-is', () => {
    const proj = buildProjection(manager, 'sess-1', makeMessages(3), { type: 'full' });
    const merged = mergeProjections([proj], { strategy: 'newest' });
    expect(merged).toBe(proj);
  });
});

describe('context-projection - diff', () => {
  let manager: ContextProjectionManager;

  beforeEach(() => {
    manager = new ContextProjectionManager(5);
  });

  it('should detect added messages', () => {
    const before = buildProjection(manager, 'sess-1', makeMessages(2), { type: 'full' });
    const after = buildProjection(manager, 'sess-1', makeMessages(4), { type: 'full' });

    const diff = computeProjectionDiff(before, after);
    expect(diff.added.length).toBe(2);
    expect(diff.removed.length).toBe(0);
  });

  it('should detect removed messages', () => {
    const before = buildProjection(manager, 'sess-1', makeMessages(5), { type: 'full' });
    const after = buildProjection(manager, 'sess-1', makeMessages(2), { type: 'full' });

    const diff = computeProjectionDiff(before, after);
    expect(diff.removed.length).toBe(3);
    expect(diff.added.length).toBe(0);
  });

  it('should return empty diff for identical projections', () => {
    const messages = makeMessages(3);
    const before = buildProjection(manager, 'sess-1', messages, { type: 'full' });
    const after = buildProjection(manager, 'sess-1', messages, { type: 'full' });

    const diff = computeProjectionDiff(before, after);
    expect(diff.added.length).toBe(0);
    expect(diff.removed.length).toBe(0);
  });
});

describe('context-projection - MMR rerank', () => {
  interface TestItem {
    id: number;
    content: string;
    embedding: number[];
  }

  it('should rerank items with MMR', () => {
    const queryEmbedding = [1, 0, 0];
    const items: TestItem[] = [
      { id: 1, content: 'a', embedding: [1, 0, 0] },
      { id: 2, content: 'b', embedding: [0.9, 0.1, 0] },
      { id: 3, content: 'c', embedding: [0, 1, 0] },
      { id: 4, content: 'd', embedding: [0, 0, 1] },
    ];

    const result = mmrRerank(
      items,
      queryEmbedding,
      (item) => item.embedding,
      { lambda: 0.5, k: 4 },
    );

    expect(result.items.length).toBe(4);
    expect(result.diversityScores.length).toBe(4);
    expect(result.relevanceScores.length).toBe(4);
    expect(result.finalScores.length).toBe(4);
    expect(result.items[0].id).toBe(1);
  });

  it('should respect k parameter', () => {
    const queryEmbedding = [1, 0, 0];
    const items = [
      { id: 1, content: 'a', embedding: [1, 0, 0] },
      { id: 2, content: 'b', embedding: [0, 1, 0] },
      { id: 3, content: 'c', embedding: [0, 0, 1] },
    ];

    const result = mmrRerank(
      items,
      queryEmbedding,
      (item) => item.embedding,
      { k: 2 },
    );

    expect(result.items.length).toBe(2);
  });

  it('should handle empty items', () => {
    const result = mmrRerank<{ content: unknown; embedding: number[] }>(
      [],
      [1, 0, 0],
      (item) => item.embedding,
    );
    expect(result.items.length).toBe(0);
  });
});

describe('context-projection - projection types', () => {
  let manager: ContextProjectionManager;

  beforeEach(() => {
    manager = new ContextProjectionManager(5);
  });

  const types: ProjectionType[] = ['full', 'compact', 'partial', 'thread-bootstrap', 'epoch'];

  it.each(types)('should build %s projection', (type) => {
    const proj = buildProjection(manager, 'sess-1', makeMessages(3), { type });
    expect(proj.type).toBe(type);
    expect(proj.tags).toContain(type);
  });
});
