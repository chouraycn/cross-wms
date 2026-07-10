/**
 * ToolRegistry 单元测试 — desktop_click_smart 批量调用 (P1)
 *
 * 验证：
 * - embedBatch 被调用（而非多次 embedText）
 * - 候选元素相似度排序正确
 * - 无候选时降级逻辑正常
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Platform Guard =====================

// desktop_snapshot 仅支持 macOS，在非 macOS 平台上跳过相关测试
const describeIfMac = process.platform === 'darwin' ? describe : describe.skip;

// ===================== Hoisted Mocks =====================

const mocks = vi.hoisted(() => ({
  embedBatch: vi.fn(),
  embedText: vi.fn(),
  execSync: vi.fn(),
}));

// ===================== Mock: onnxEmbedding =====================

vi.mock('../onnxEmbedding.js', () => ({
  embedBatch: mocks.embedBatch,
  embedText: mocks.embedText,
  initOnnxEmbedding: vi.fn().mockResolvedValue(undefined),
  getOnnxStatus: vi.fn().mockReturnValue({ status: 'ready', error: '' }),
  ONNX_EMBEDDING_DIMENSIONS: 384,
}));

// ===================== Mock: child_process =====================

vi.mock('child_process', () => ({
  execSync: mocks.execSync,
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    stdin: { write: vi.fn(), end: vi.fn() },
  })),
}));

// ===================== Mock: fs =====================

vi.mock('fs', () => {
  const fsMock = {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readdir: vi.fn(),
      mkdir: vi.fn(),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  };
  // 同时提供 default 导出：产品代码使用 `import fs from 'fs'` 默认导入
  return { ...fsMock, default: fsMock };
});

// ===================== Mock: logger =====================

vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ===================== Mock: mcpTypes =====================

vi.mock('../mcpTypes.js', () => ({
  isMcpToolName: vi.fn(() => false),
}));

// ===================== Mock: webTools =====================

vi.mock('../webTools.js', () => ({
  handleWebSearch: vi.fn(),
  handleWebFetch: vi.fn(),
  handleWebApiCall: vi.fn(),
}));

// ===================== Mock: browserTools / webhookTools =====================

vi.mock('../browserTools.js', () => ({
  getBrowserToolDefinitions: () => [],
  getBrowserToolHandlers: () => new Map(),
}));

vi.mock('../webhookTools.js', () => ({
  getWebhookToolDefinitions: () => [],
  getWebhookToolHandlers: () => new Map(),
}));

// ===================== Helpers =====================

/** Create a 384-dim L2-normalized Float32Array from first N values */
function makeVec(values: number[]): Float32Array {
  const vec = new Float32Array(384);
  for (let i = 0; i < Math.min(values.length, 384); i++) {
    vec[i] = values[i];
  }
  let norm = 0;
  for (let i = 0; i < 384; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < 384; i++) vec[i] /= norm;
  return vec;
}

/** Mock JXA snapshot result with UI elements */
function mockSnapshotResult(elements: Array<Record<string, unknown>>): string {
  return JSON.stringify({
    app: 'TestApp',
    elements,
    count: elements.length,
  });
}

// ===================== Tests =====================

describeIfMac('ToolRegistry — desktop_click_smart 批量调用 (P1)', () => {
  let toolRegistry: typeof import('../toolRegistry.js');

  beforeEach(async () => {
    vi.resetModules();
    mocks.embedBatch.mockReset();
    mocks.embedText.mockReset();
    mocks.execSync.mockReset();

    toolRegistry = await import('../toolRegistry.js');
    await toolRegistry.initDefaultTools();
  });

  it('embedBatch 被调用（而非多次 embedText）', async () => {
    // Arrange: mock snapshot returns 2 button elements
    mocks.execSync.mockImplementation((cmd: string) => {
      if (cmd.includes('osascript -l JavaScript')) {
        return mockSnapshotResult([
          { role: 'button', name: 'Submit', x: 100, y: 200, w: 80, h: 30, description: 'Submit button' },
          { role: 'button', name: 'Cancel', x: 200, y: 200, w: 80, h: 30, description: 'Cancel button' },
        ]);
      }
      if (cmd.includes('python3')) return 'OK';
      if (cmd.includes('which')) return '/usr/bin/test';
      return '';
    });

    // Mock embedBatch to return 3 vectors: query + 2 candidates
    mocks.embedBatch.mockResolvedValue([
      makeVec([1, 0, 0]), // query
      makeVec([1, 0, 0]), // candidate 1 (similar)
      makeVec([0, 1, 0]), // candidate 2 (dissimilar)
    ]);

    // Act
    const result = await toolRegistry.executeToolCall({
      id: 'test-call',
      type: 'function' as const,
      function: {
        name: 'desktop_click_smart',
        arguments: JSON.stringify({ description: 'submit button' }),
      },
    });

    // Assert: embedBatch was called once with all texts
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mocks.embedBatch).toHaveBeenCalledTimes(1);

    // embedBatch should receive [description, ...candidateTexts]
    const callArgs = mocks.embedBatch.mock.calls[0][0] as string[];
    expect(callArgs[0]).toBe('submit button');
    expect(callArgs.length).toBe(3); // 1 query + 2 candidates

    // embedText should NOT have been called during semantic matching
    expect(mocks.embedText).not.toHaveBeenCalled();
  });

  it('候选元素相似度排序正确（选择最相似的）', async () => {
    // Arrange
    mocks.execSync.mockImplementation((cmd: string) => {
      if (cmd.includes('osascript -l JavaScript')) {
        return mockSnapshotResult([
          { role: 'button', name: 'Submit', x: 100, y: 200, w: 80, h: 30, description: 'Submit button' },
          { role: 'button', name: 'Cancel', x: 300, y: 200, w: 80, h: 30, description: 'Cancel button' },
        ]);
      }
      if (cmd.includes('python3')) return 'OK';
      return '';
    });

    // Query is similar to "Cancel" (candidate 2), not "Submit" (candidate 1)
    mocks.embedBatch.mockResolvedValue([
      makeVec([0, 1, 0]), // query — similar to Cancel
      makeVec([1, 0, 0]), // candidate 1 (Submit) — dissimilar
      makeVec([0, 1, 0]), // candidate 2 (Cancel) — similar
    ]);

    // Act
    const result = await toolRegistry.executeToolCall({
      id: 'test-call',
      type: 'function' as const,
      function: {
        name: 'desktop_click_smart',
        arguments: JSON.stringify({ description: 'cancel' }),
      },
    });

    // Assert: should match "Cancel" button (higher similarity)
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.matchedElement.name).toBe('Cancel');
    expect(parsed.matchMethod).toBe('onnx_embedding');
    expect(parsed.similarity).toBeGreaterThan(0.3);
  });

  it('无候选元素时返回错误（降级逻辑）', async () => {
    // Arrange: snapshot returns elements with no valid bounds (w=0, h=0)
    mocks.execSync.mockImplementation((cmd: string) => {
      if (cmd.includes('osascript -l JavaScript')) {
        return mockSnapshotResult([
          { role: 'text', name: 'Label', x: 100, y: 200, w: 0, h: 0 },
        ]);
      }
      return '';
    });

    // Act
    const result = await toolRegistry.executeToolCall({
      id: 'test-call',
      type: 'function' as const,
      function: {
        name: 'desktop_click_smart',
        arguments: JSON.stringify({ description: 'submit button' }),
      },
    });

    // Assert: no matchable elements
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('没有可匹配的元素');
    // embedBatch should NOT be called (no candidates to embed)
    expect(mocks.embedBatch).not.toHaveBeenCalled();
  });

  it('ONNX 不可用时降级为关键词匹配', async () => {
    // Arrange: ONNX throws, should fall back to keyword matching
    mocks.execSync.mockImplementation((cmd: string) => {
      if (cmd.includes('osascript -l JavaScript')) {
        return mockSnapshotResult([
          { role: 'button', name: 'Submit', x: 100, y: 200, w: 80, h: 30, description: 'Submit form' },
          { role: 'button', name: 'Cancel', x: 300, y: 200, w: 80, h: 30, description: 'Cancel operation' },
        ]);
      }
      if (cmd.includes('python3')) return 'OK';
      return '';
    });

    // embedBatch throws → ONNX unavailable
    mocks.embedBatch.mockRejectedValue(new Error('ONNX model not loaded'));

    // Act
    const result = await toolRegistry.executeToolCall({
      id: 'test-call',
      type: 'function' as const,
      function: {
        name: 'desktop_click_smart',
        arguments: JSON.stringify({ description: 'submit' }),
      },
    });

    // Assert: falls back to keyword matching, finds "Submit"
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.matchedElement.name).toBe('Submit');
    expect(parsed.matchMethod).toBe('keyword_fallback');
  });

  it('无 description 参数时返回错误', async () => {
    const result = await toolRegistry.executeToolCall({
      id: 'test-call',
      type: 'function' as const,
      function: {
        name: 'desktop_click_smart',
        arguments: JSON.stringify({}),
      },
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('description');
  });
});
