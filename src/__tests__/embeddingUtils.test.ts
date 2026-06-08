/**
 * embeddingUtils 单元测试
 * 覆盖：cosineSimilarity、float32ArrayToBlob/blobToFloat32Array、l2NormalizeCopy、
 *       bruteForceSearch、mergeHybridResults、contentHash
 */

import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  cosineSimilarityUnnormalized,
  l2NormalizeCopy,
  l2Normalize,
  float32ArrayToBlob,
  blobToFloat32Array,
  bruteForceSearch,
  mergeHybridResults,
  contentHash,
  generateMockEmbedding,
  generateDeterministicMockEmbedding,
} from '../services/skill/embeddingUtils';

// ===================== cosineSimilarity =====================

describe('cosineSimilarity', () => {
  it('相同归一化向量的余弦相似度应为 1', () => {
    const vec = l2NormalizeCopy(new Float32Array([1, 2, 3]));
    const sim = cosineSimilarity(vec, vec);
    expect(sim).toBeCloseTo(1, 5);
  });

  it('正交归一化向量的余弦相似度应为 0', () => {
    const a = l2NormalizeCopy(new Float32Array([1, 0, 0]));
    const b = l2NormalizeCopy(new Float32Array([0, 1, 0]));
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(0, 5);
  });

  it('方向相反的归一化向量余弦相似度应为 -1', () => {
    const a = l2NormalizeCopy(new Float32Array([1, 2, 3]));
    const b = l2NormalizeCopy(new Float32Array([-1, -2, -3]));
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(-1, 5);
  });

  it('相似向量的余弦相似度应接近 1', () => {
    const a = l2NormalizeCopy(new Float32Array([1, 2, 3]));
    const b = l2NormalizeCopy(new Float32Array([1.1, 2.1, 3.1]));
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.99);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('维度不同时应抛出异常', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2]);
    expect(() => cosineSimilarity(a, b)).toThrow('Vector dimension mismatch');
  });
});

// ===================== cosineSimilarityUnnormalized =====================

describe('cosineSimilarityUnnormalized', () => {
  it('未归一化向量应正确计算余弦相似度', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    const sim = cosineSimilarityUnnormalized(a, b);
    expect(sim).toBeCloseTo(0, 5);
  });

  it('相同未归一化向量应返回 1', () => {
    const a = new Float32Array([3, 4, 5]);
    const sim = cosineSimilarityUnnormalized(a, a);
    expect(sim).toBeCloseTo(1, 5);
  });

  it('零向量应返回 0（避免除零）', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    const sim = cosineSimilarityUnnormalized(a, b);
    expect(sim).toBe(0);
  });

  it('维度不同时应抛出异常', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2]);
    expect(() => cosineSimilarityUnnormalized(a, b)).toThrow('Vector dimension mismatch');
  });
});

// ===================== l2Normalize / l2NormalizeCopy =====================

describe('l2NormalizeCopy', () => {
  it('归一化后 L2 范数应为 1', () => {
    const vec = new Float32Array([3, 4, 0]);
    const normalized = l2NormalizeCopy(vec);
    // L2 范数 = sqrt(9 + 16) = 5, 归一化后 [0.6, 0.8, 0]
    const norm = Math.sqrt(normalized.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('不应修改原向量', () => {
    const vec = new Float32Array([3, 4, 0]);
    const original = new Float32Array(vec);
    l2NormalizeCopy(vec);
    expect(vec[0]).toBe(original[0]);
    expect(vec[1]).toBe(original[1]);
    expect(vec[2]).toBe(original[2]);
  });
});

describe('l2Normalize', () => {
  it('零向量应直接返回不产生 NaN', () => {
    const vec = new Float32Array([0, 0, 0]);
    const result = l2Normalize(vec);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
    expect(Number.isNaN(result[0])).toBe(false);
  });

  it('归一化应 in-place 修改', () => {
    const vec = new Float32Array([3, 4, 0]);
    const result = l2Normalize(vec);
    expect(result).toBe(vec); // 同一引用
  });
});

// ===================== float32ArrayToBlob / blobToFloat32Array =====================

describe('float32ArrayToBlob / blobToFloat32Array 双向转换', () => {
  it('Float32Array → Blob → Float32Array 应保持数据一致', () => {
    const original = new Float32Array([1.5, -2.3, 0, 100.001, -999.99]);
    const blob = float32ArrayToBlob(original);
    const restored = blobToFloat32Array(blob);
    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i], 7);
    }
  });

  it('高维向量双向转换应保持数据一致', () => {
    const original = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      original[i] = Math.sin(i) * Math.cos(i * 0.5);
    }
    const blob = float32ArrayToBlob(original);
    const restored = blobToFloat32Array(blob);
    expect(restored.length).toBe(384);
    for (let i = 0; i < 384; i++) {
      expect(restored[i]).toBeCloseTo(original[i], 7);
    }
  });

  it('空 Float32Array 双向转换应正确', () => {
    const original = new Float32Array(0);
    const blob = float32ArrayToBlob(original);
    const restored = blobToFloat32Array(blob);
    expect(restored.length).toBe(0);
  });
});

// ===================== bruteForceSearch =====================

describe('bruteForceSearch', () => {
  it('应返回 Top-K 结果按相似度降序排列', () => {
    const queryVec = l2NormalizeCopy(new Float32Array([1, 0, 0]));
    const candidates = new Map<string, Float32Array>();
    candidates.set('skill-a', l2NormalizeCopy(new Float32Array([0.9, 0.1, 0])));
    candidates.set('skill-b', l2NormalizeCopy(new Float32Array([0.1, 0.9, 0])));
    candidates.set('skill-c', l2NormalizeCopy(new Float32Array([0.95, 0.05, 0])));

    const results = bruteForceSearch(queryVec, candidates, 3, 0);
    expect(results.length).toBe(3);
    // 降序排列
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
    }
  });

  it('应过滤低于阈值的结果', () => {
    const queryVec = l2NormalizeCopy(new Float32Array([1, 0, 0]));
    const candidates = new Map<string, Float32Array>();
    candidates.set('skill-a', l2NormalizeCopy(new Float32Array([0.9, 0.1, 0]))); // sim ~0.99
    candidates.set('skill-b', l2NormalizeCopy(new Float32Array([0.1, 0.9, 0]))); // sim ~0.11

    const results = bruteForceSearch(queryVec, candidates, 10, 0.5);
    expect(results.length).toBe(1);
    expect(results[0].skillId).toBe('skill-a');
  });

  it('空候选集应返回空结果', () => {
    const queryVec = l2NormalizeCopy(new Float32Array([1, 0, 0]));
    const candidates = new Map<string, Float32Array>();
    const results = bruteForceSearch(queryVec, candidates, 10, 0);
    expect(results.length).toBe(0);
  });

  it('Top-K 应正确限制返回数量', () => {
    const queryVec = l2NormalizeCopy(new Float32Array([1, 0, 0]));
    const candidates = new Map<string, Float32Array>();
    for (let i = 0; i < 20; i++) {
      candidates.set(`skill-${i}`, l2NormalizeCopy(new Float32Array([1, i * 0.01, 0])));
    }

    const results = bruteForceSearch(queryVec, candidates, 5, 0);
    expect(results.length).toBe(5);
  });
});

// ===================== mergeHybridResults =====================

describe('mergeHybridResults', () => {
  it('语义和关键词均匹配的技能应有最高综合分', () => {
    const semanticResults = [
      { skillId: 'skill-a', similarity: 0.9 },
      { skillId: 'skill-b', similarity: 0.3 },
    ];
    const keywordResults = [
      { skillId: 'skill-a', score: 8 },
      { skillId: 'skill-c', score: 6 },
    ];

    const merged = mergeHybridResults(semanticResults, keywordResults, 0.6, 0.4);
    expect(merged[0].skillId).toBe('skill-a');
    expect(merged[0].semanticScore).toBeCloseTo(0.9, 3);
    expect(merged[0].keywordScore).toBeCloseTo(1, 3); // 归一化后 8/8=1
    // finalScore = 0.6 * 0.9 + 0.4 * 1 = 0.94
    expect(merged[0].finalScore).toBeCloseTo(0.94, 3);
  });

  it('仅语义匹配的技能应有正确的综合分', () => {
    const semanticResults = [{ skillId: 'skill-x', similarity: 0.8 }];
    const keywordResults: Array<{ skillId: string; score: number }> = [];

    const merged = mergeHybridResults(semanticResults, keywordResults, 0.6, 0.4);
    const item = merged.find(r => r.skillId === 'skill-x');
    expect(item).toBeDefined();
    expect(item!.semanticScore).toBeCloseTo(0.8, 3);
    expect(item!.keywordScore).toBe(0);
    expect(item!.finalScore).toBeCloseTo(0.6 * 0.8, 3);
  });

  it('仅关键词匹配的技能应有正确的综合分', () => {
    const semanticResults: Array<{ skillId: string; similarity: number }> = [];
    const keywordResults = [{ skillId: 'skill-y', score: 5 }];

    const merged = mergeHybridResults(semanticResults, keywordResults, 0.6, 0.4);
    const item = merged.find(r => r.skillId === 'skill-y');
    expect(item).toBeDefined();
    expect(item!.semanticScore).toBe(0);
    expect(item!.keywordScore).toBeCloseTo(1, 3); // 5/5=1
    expect(item!.finalScore).toBeCloseTo(0.4, 3); // 0.6*0 + 0.4*1
  });

  it('结果应按 finalScore 降序排列', () => {
    const semanticResults = [
      { skillId: 'low', similarity: 0.2 },
      { skillId: 'high', similarity: 0.95 },
    ];
    const keywordResults = [
      { skillId: 'low', score: 2 },
      { skillId: 'high', score: 9 },
    ];

    const merged = mergeHybridResults(semanticResults, keywordResults, 0.6, 0.4);
    for (let i = 1; i < merged.length; i++) {
      expect(merged[i - 1].finalScore).toBeGreaterThanOrEqual(merged[i].finalScore);
    }
  });

  it('负的语义相似度应被归零', () => {
    const semanticResults = [{ skillId: 'neg', similarity: -0.5 }];
    const keywordResults: Array<{ skillId: string; score: number }> = [];

    const merged = mergeHybridResults(semanticResults, keywordResults, 0.6, 0.4);
    const item = merged.find(r => r.skillId === 'neg');
    expect(item).toBeDefined();
    expect(item!.semanticScore).toBe(0); // Math.max(0, -0.5) = 0
  });

  it('默认权重应正确', () => {
    const semanticResults = [{ skillId: 's', similarity: 0.8 }];
    const keywordResults = [{ skillId: 's', score: 10 }];

    const merged = mergeHybridResults(semanticResults, keywordResults);
    const item = merged.find(r => r.skillId === 's');
    expect(item).toBeDefined();
    // 默认 0.6 * 0.8 + 0.4 * 1 = 0.88
    expect(item!.finalScore).toBeCloseTo(0.88, 3);
  });
});

// ===================== contentHash =====================

describe('contentHash', () => {
  it('相同内容应产生相同哈希', () => {
    const content = '测试内容哈希生成';
    const hash1 = contentHash(content);
    const hash2 = contentHash(content);
    expect(hash1).toBe(hash2);
  });

  it('不同内容应产生不同哈希', () => {
    const hash1 = contentHash('内容A');
    const hash2 = contentHash('内容B');
    expect(hash1).not.toBe(hash2);
  });

  it('哈希应为 16 字符的十六进制字符串', () => {
    const hash = contentHash('test');
    expect(hash.length).toBe(16);
    expect(/^[0-9a-f]{16}$/.test(hash)).toBe(true);
  });

  it('空字符串应返回有效的哈希', () => {
    const hash = contentHash('');
    expect(hash.length).toBe(16);
    expect(/^[0-9a-f]{16}$/.test(hash)).toBe(true);
  });
});

// ===================== generateMockEmbedding =====================

describe('generateMockEmbedding', () => {
  it('默认应生成 384 维向量', () => {
    const emb = generateMockEmbedding();
    expect(emb.length).toBe(384);
  });

  it('自定义维度应正确', () => {
    const emb = generateMockEmbedding(128);
    expect(emb.length).toBe(128);
  });

  it('生成的向量应已 L2 归一化', () => {
    const emb = generateMockEmbedding(64);
    const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 4);
  });
});

// ===================== generateDeterministicMockEmbedding =====================

describe('generateDeterministicMockEmbedding', () => {
  it('相同种子应生成相同向量', () => {
    const a = generateDeterministicMockEmbedding('test-seed', 64);
    const b = generateDeterministicMockEmbedding('test-seed', 64);
    expect(a).toEqual(b);
  });

  it('不同种子应生成不同向量', () => {
    const a = generateDeterministicMockEmbedding('seed-a', 64);
    const b = generateDeterministicMockEmbedding('seed-b', 64);
    // 不完全相等的概率极高
    let allEqual = true;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { allEqual = false; break; }
    }
    expect(allEqual).toBe(false);
  });

  it('生成的向量应已 L2 归一化', () => {
    const emb = generateDeterministicMockEmbedding('norm-test', 64);
    const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 4);
  });
});
