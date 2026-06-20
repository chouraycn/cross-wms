/**
 * OnnxEmbedding 单元测试
 *
 * P0: embedText LRU 缓存
 * - 同一文本命中缓存返回相同引用
 * - 不同文本不命中缓存
 * - 缓存上限 256 条，超过后淘汰最旧条目
 * - LRU 语义：最近访问的条目不应被淘汰
 *
 * P1: embedBatch 批量推理
 * - 空数组返回空数组
 * - 单条文本委托给 embedText
 * - 多条文本返回正确数量和维度
 * - 批量结果与逐条 embedText 一致
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from 'vitest';

// ===================== Mock: onnxruntime-node =====================

vi.mock('onnxruntime-node', () => {
  /**
   * Mock inference session — produces deterministic output based on input_ids.
   * Same input_ids always yield same output; different input_ids yield different output.
   */
  function createMockRun() {
    return vi.fn().mockImplementation(async (feeds: Record<string, unknown>) => {
      const feedValues = Object.values(feeds) as Array<{
        data: BigInt64Array;
        dims: number[];
      }>;
      const inputIdsTensor = feedValues[0];
      const dims = inputIdsTensor.dims;
      const batchSize = dims[0];
      const seqLen = dims[1]; // 256
      const dim = 384;

      const outputData = new Float32Array(batchSize * seqLen * dim);
      const inputData = inputIdsTensor.data as BigInt64Array;

      for (let b = 0; b < batchSize; b++) {
        // Deterministic hash from input_ids for this batch item
        let hash = 0;
        for (let i = 0; i < seqLen; i++) {
          hash = (hash * 31 + Number(inputData[b * seqLen + i])) | 0;
        }
        // Fill output with hash-based deterministic values
        for (let i = 0; i < seqLen; i++) {
          for (let j = 0; j < dim; j++) {
            outputData[(b * seqLen + i) * dim + j] = Math.sin(hash + i * 0.1 + j * 0.01) * 0.01;
          }
        }
      }

      return {
        last_hidden_state: {
          data: outputData,
          dims: [batchSize, seqLen, dim],
        },
      };
    });
  }

  return {
    InferenceSession: {
      create: vi.fn().mockImplementation(async () => ({
        inputNames: ['input_ids', 'attention_mask'],
        outputNames: ['last_hidden_state'],
        run: createMockRun(),
      })),
    },
    Tensor: class MockTensor {
      type: string;
      data: unknown;
      dims: number[];
      constructor(type: string, data: unknown, dims: number[]) {
        this.type = type;
        this.data = data;
        this.dims = dims;
      }
    },
  };
});

// ===================== Mock: fs =====================

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn((p: string) => {
    const filepath = String(p);
    if (filepath.endsWith('vocab.txt')) {
      // Minimal BERT vocab — enough for deterministic tokenization
      return [
        '[CLS]', '[SEP]', '[UNK]', '[PAD]', 'hello', 'world', 'test',
        'cache', 'button', 'submit', 'cancel', 'search', 'input',
        'click', 'smart', 'desktop', 'the', 'a', 'is', 'to', 'foo',
        'bar', 'baz', 'consistency', 'eviction', 'lru', 'batch',
        ...Array.from({ length: 200 }, (_, i) => `tok${i}`),
      ].join('\n');
    }
    if (filepath.endsWith('config.json')) {
      return JSON.stringify({ max_position_embeddings: 256, hidden_size: 384 });
    }
    if (filepath.endsWith('tokenizer.json')) {
      return JSON.stringify({
        model: {
          vocab: {
            '[CLS]': 0, '[SEP]': 1, '[UNK]': 2, '[PAD]': 3,
            hello: 4, world: 5, test: 6, cache: 7, button: 8,
            submit: 9, cancel: 10, search: 11, input: 12,
            click: 13, smart: 14, desktop: 15,
          },
        },
        normalizer: { type: 'BertNormalizer' },
        pre_tokenizer: { type: 'BertPreTokenizer' },
      });
    }
    return '';
  }),
}));

// ===================== Mock: logger =====================

vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ===================== Tests =====================

describe('OnnxEmbedding', () => {
  let onnx: typeof import('../onnxEmbedding.js');

  beforeAll(async () => {
    onnx = await import('../onnxEmbedding.js');
    await onnx.initOnnxEmbedding();
  });

  // ================ P0: embedText LRU 缓存 ================

  describe('P0: embedText LRU 缓存', () => {
    it('同一文本第二次调用返回相同引用（缓存命中）', async () => {
      const r1 = await onnx.embedText('cache_hit_test');
      const r2 = await onnx.embedText('cache_hit_test');
      // Cache hit — same object reference
      expect(r1).toBe(r2);
    });

    it('不同文本返回不同引用（缓存未命中）', async () => {
      // Use vocab words that tokenize to different tokens
      const r1 = await onnx.embedText('hello');
      const r2 = await onnx.embedText('world');
      expect(r1).not.toBe(r2);
      // Values should also differ (different input → different hash → different output)
      let diff = 0;
      for (let i = 0; i < r1.length; i++) {
        if (Math.abs(r1[i] - r2[i]) > 1e-7) diff++;
      }
      expect(diff).toBeGreaterThan(0);
    });

    it('缓存返回的向量维度为 384', async () => {
      const r = await onnx.embedText('dimension_check');
      expect(r).toBeInstanceOf(Float32Array);
      expect(r.length).toBe(384);
    });

    it('缓存返回的向量是 L2 归一化的', async () => {
      const r = await onnx.embedText('l2_norm_check');
      let norm = 0;
      for (let i = 0; i < r.length; i++) {
        norm += r[i] * r[i];
      }
      norm = Math.sqrt(norm);
      expect(norm).toBeCloseTo(1.0, 4);
    });
  });

  // ================ P0: LRU 淘汰机制 ================

  describe('P0: 缓存淘汰机制 (需独立模块状态)', () => {
    let embed: typeof import('../onnxEmbedding.js');

    beforeAll(async () => {
      vi.resetModules();
      embed = await import('../onnxEmbedding.js');
      await embed.initOnnxEmbedding();
    });

    it('超过 256 条后淘汰最旧条目', async () => {
      // Fill cache with exactly 256 entries
      const firstResult = await embed.embedText('eviction_item_0');
      for (let i = 1; i < 256; i++) {
        await embed.embedText(`eviction_item_${i}`);
      }

      // Cache is full (256 entries). Add one more → triggers eviction.
      await embed.embedText('eviction_item_256');

      // The first entry should have been evicted → re-access is a cache miss (new reference)
      const reResult = await embed.embedText('eviction_item_0');
      expect(reResult).not.toBe(firstResult);
    });
  });

  describe('P0: LRU 语义（最近访问不应被淘汰）', () => {
    let embed: typeof import('../onnxEmbedding.js');

    beforeAll(async () => {
      vi.resetModules();
      embed = await import('../onnxEmbedding.js');
      await embed.initOnnxEmbedding();
    });

    it('最近访问的条目在缓存满时不应被淘汰', async () => {
      // Fill cache with 256 entries
      const firstResult = await embed.embedText('lru_item_0');
      for (let i = 1; i < 256; i++) {
        await embed.embedText(`lru_item_${i}`);
      }

      // Access the first entry (cache hit) — in LRU this makes it most-recently-used
      const cachedResult = await embed.embedText('lru_item_0');
      expect(cachedResult).toBe(firstResult); // Confirms cache hit

      // Add one more → should evict the LEAST recently used (lru_item_1), NOT lru_item_0
      await embed.embedText('lru_item_256');

      // lru_item_0 was recently accessed — in true LRU it should still be cached
      const reResult = await embed.embedText('lru_item_0');
      // NOTE: This test verifies LRU semantics. If the implementation is FIFO (not true LRU),
      // this assertion will FAIL because lru_item_0 gets evicted despite being recently accessed.
      expect(reResult).toBe(firstResult);
    });
  });

  // ================ P0: 长文本缓存键截断 ================

  describe('P0: 长文本缓存键截断', () => {
    let embed: typeof import('../onnxEmbedding.js');

    beforeAll(async () => {
      vi.resetModules();
      embed = await import('../onnxEmbedding.js');
      await embed.initOnnxEmbedding();
    });

    it('超过 200 字符的文本使用前 200 字符作为缓存键', async () => {
      // Two different texts with same first 200 chars
      const prefix = 'x'.repeat(200);
      const text1 = prefix + 'A';
      const text2 = prefix + 'B';

      const r1 = await embed.embedText(text1);
      const r2 = await embed.embedText(text2);

      // CORRECT behavior: different texts should produce different embeddings
      // If cache key truncation causes a false cache hit, r2 === r1 (BUG)
      expect(r1).not.toBe(r2);
    });
  });

  // ================ P1: embedBatch 批量推理 ================

  describe('P1: embedBatch 批量推理', () => {
    it('空数组返回空数组', async () => {
      const result = await onnx.embedBatch([]);
      expect(result).toEqual([]);
    });

    it('单条文本委托给 embedText（返回 1 个向量）', async () => {
      const result = await onnx.embedBatch(['single_batch_test']);
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Float32Array);
      expect(result[0].length).toBe(384);
    });

    it('单条文本批量结果与 embedText 一致', async () => {
      // Use a fresh module to avoid cache interference
      vi.resetModules();
      const embed = await import('../onnxEmbedding.js');
      await embed.initOnnxEmbedding();

      const batchResult = await embed.embedBatch(['consistency_single']);
      const singleResult = await embed.embedText('consistency_single');

      // embedBatch with 1 item delegates to embedText, so same reference (cache hit)
      expect(batchResult[0]).toBe(singleResult);
    });

    it('多条文本返回正确数量和维度', async () => {
      const result = await onnx.embedBatch(['hello', 'world', 'test']);
      expect(result).toHaveLength(3);
      for (const vec of result) {
        expect(vec).toBeInstanceOf(Float32Array);
        expect(vec.length).toBe(384);
      }
    });

    it('批量结果与逐条 embedText 一致（浮点误差 < 1e-5）', async () => {
      vi.resetModules();
      const embed = await import('../onnxEmbedding.js');
      await embed.initOnnxEmbedding();

      const texts = ['batch_consistency_a', 'batch_consistency_b'];
      const batchResults = await embed.embedBatch(texts);

      // Now call embedText for each — first call is cache miss (new inference),
      // but since embedBatch doesn't use the cache, embedText will run its own inference
      const singleResults: Float32Array[] = [];
      for (const text of texts) {
        singleResults.push(await embed.embedText(text));
      }

      // Compare values (allow float error < 1e-5)
      for (let i = 0; i < texts.length; i++) {
        const batch = batchResults[i];
        const single = singleResults[i];
        let maxDiff = 0;
        for (let j = 0; j < 384; j++) {
          maxDiff = Math.max(maxDiff, Math.abs(batch[j] - single[j]));
        }
        expect(maxDiff).toBeLessThan(1e-5);
      }
    });

    it('批量结果每条向量都是 L2 归一化的', async () => {
      const result = await onnx.embedBatch(['norm_check_1', 'norm_check_2']);
      for (const vec of result) {
        let norm = 0;
        for (let i = 0; i < vec.length; i++) {
          norm += vec[i] * vec[i];
        }
        norm = Math.sqrt(norm);
        expect(norm).toBeCloseTo(1.0, 4);
      }
    });

    it('不同输入产生不同的批量结果', async () => {
      // Use vocab words that tokenize to different tokens
      const result = await onnx.embedBatch(['foo', 'bar']);
      let diff = 0;
      for (let i = 0; i < 384; i++) {
        if (Math.abs(result[0][i] - result[1][i]) > 1e-7) diff++;
      }
      expect(diff).toBeGreaterThan(0);
    });
  });

  // ================ 状态检查 ================

  describe('getOnnxStatus', () => {
    it('初始化后状态为 ready', async () => {
      const status = onnx.getOnnxStatus();
      expect(status.status).toBe('ready');
      expect(status.error).toBe('');
    });
  });
});
