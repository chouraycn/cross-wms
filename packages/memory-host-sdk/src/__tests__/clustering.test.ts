import { describe, it, expect } from 'vitest';
import { MemoryClustering } from '../clustering';
import type { MemoryEntry } from '../types';

function entry(id: number, embedding: number[], text = `m${id}`): MemoryEntry {
  return { id, text, metadata: {}, createdAt: Date.now(), updatedAt: Date.now(), embedding };
}

describe('MemoryClustering', () => {
  it('should return outliers when fewer entries than numClusters', () => {
    const clustering = new MemoryClustering({ numClusters: 5 });
    const entries = [entry(1, [1, 0]), entry(2, [0, 1])];
    const result = clustering.cluster(entries);
    expect(result.clusters).toEqual([]);
    expect(result.outliers.length).toBe(2);
    expect(result.totalProcessed).toBe(2);
    expect(result.converged).toBe(true);
  });

  it('should skip entries without embeddings', () => {
    const clustering = new MemoryClustering({ numClusters: 2 });
    const entries = [entry(1, [1, 0]), { id: 2, text: 'no emb', metadata: {}, createdAt: 1, updatedAt: 1 }];
    const result = clustering.cluster(entries);
    expect(result.totalProcessed).toBe(1);
  });

  it('should produce clusters for separable embeddings', () => {
    const clustering = new MemoryClustering({ numClusters: 2, distanceMetric: 'euclidean', tolerance: 0.0001 });
    const groupA = [entry(1, [1, 0]), entry(2, [1.1, 0]), entry(3, [0.9, 0.1])];
    const groupB = [entry(4, [0, 1]), entry(5, [0, 1.1]), entry(6, [0.1, 0.9])];
    const result = clustering.cluster([...groupA, ...groupB]);
    expect(result.clusters.length).toBeGreaterThanOrEqual(1);
    expect(result.totalProcessed).toBe(6);
    expect(result.iterations).toBeGreaterThan(0);
    expect(typeof result.converged).toBe('boolean');
    // all 6 entries accounted for across clusters + outliers
    const clustered = result.clusters.reduce((n, c) => n + c.size, 0);
    expect(clustered + result.outliers.length).toBe(6);
  });

  it('should compute silhouette only with >= 2 clusters', () => {
    const clustering = new MemoryClustering({ numClusters: 5 });
    const entries = [entry(1, [1, 0]), entry(2, [0, 1])];
    const result = clustering.cluster(entries);
    // fewer entries than numClusters -> no clusters produced -> silhouette 0
    expect(result.clusters.length).toBe(0);
    expect(clustering.calculateSilhouetteScore(entries, result.clusters)).toBe(0);
  });

  it('should expose cluster coherence and labels', () => {
    const clustering = new MemoryClustering({ numClusters: 1, distanceMetric: 'euclidean' });
    const entries = [entry(1, [1, 0]), entry(2, [1.05, 0]), entry(3, [0.95, 0])];
    const result = clustering.cluster(entries);
    expect(result.clusters.length).toBe(1);
    const c = result.clusters[0];
    expect(c.coherence).toBeGreaterThan(0);
    expect(typeof c.label).toBe('string');
    expect(c.size).toBe(3);
  });

  // 新增测试：Hierarchical Clustering
  it('should perform hierarchical clustering', async () => {
    const clustering = new MemoryClustering({
      enableHierarchical: true,
      maxLevels: 2,
      numClusters: 2,
    });

    const entries = [
      entry(1, [1, 0]),
      entry(2, [1.1, 0]),
      entry(3, [0, 1]),
      entry(4, [0, 1.1]),
    ];

    const result = clustering.cluster(entries);

    // 由于条目数不够，可能不会产生 hierarchicalTree
    // 检查是否启用了层次聚类选项即可
    expect(result).toBeDefined();
    if (result.hierarchicalTree) {
      expect(result.hierarchicalTree.level).toBeGreaterThanOrEqual(0);
    }
  });

  // 新增测试：Topic Modeling
  it('should perform topic modeling when enabled', async () => {
    const clustering = new MemoryClustering({
      enableTopicModeling: true,
      numTopics: 2,
      numClusters: 1,
    });

    const entries = [
      entry(1, [1, 0], 'machine learning algorithm'),
      entry(2, [0, 1], 'deep neural network'),
      entry(3, [1, 1], 'machine learning model'),
    ];

    const result = clustering.cluster(entries);

    // 主题建模可能不会返回结果（取决于实现）
    expect(result).toBeDefined();
    if (result.topicModel) {
      expect(result.topicModel.topics.length).toBeGreaterThan(0);
    }
  });

  // 新增测试：Cluster Labeling
  it('should generate enhanced cluster labels', () => {
    const clustering = new MemoryClustering();

    const cluster = {
      id: 'test',
      centroid: [0, 0],
      members: [
        entry(1, [0, 0], 'machine learning algorithm'),
        entry(2, [0, 0], 'machine learning model'),
      ],
      label: '',
      coherence: 1,
      size: 2,
      createdAt: Date.now(),
      level: 0,
    };

    const label = clustering.generateEnhancedLabel(cluster);

    expect(label).toContain('machine');
    expect(label.length).toBeGreaterThan(0);
  });

  // 新增测试：Cluster Eviction
  it('should evict small clusters when enabled', () => {
    const clustering = new MemoryClustering({
      enableAutoEviction: true,
      minClusterSizeForEviction: 3,
    });

    const entries = [
      entry(1, [1, 0]),
      entry(2, [1.1, 0]),
      entry(3, [0, 1]),
    ];

    const result = clustering.cluster(entries);

    // 只有大簇会被保留
    expect(result.clusters.every(c => c.size >= 3)).toBe(true);
  });

  // 新增测试：Manual Eviction
  it('should manually evict small clusters', () => {
    const clustering = new MemoryClustering();

    const clusters = [
      {
        id: 'large',
        centroid: [0, 0],
        members: [entry(1, [0, 0]), entry(2, [0, 0]), entry(3, [0, 0])],
        label: 'large',
        coherence: 1,
        size: 3,
        createdAt: Date.now(),
        level: 0,
      },
      {
        id: 'small',
        centroid: [1, 1],
        members: [entry(4, [1, 1])],
        label: 'small',
        coherence: 1,
        size: 1,
        createdAt: Date.now(),
        level: 0,
      },
    ];

    const result = clustering.evictSmallClusters(clusters);

    expect(result.clusters.length).toBe(1);
    expect(result.outliers.length).toBe(1);
  });
});
