import type { MemoryEntry } from './types.js';

export interface Cluster {
  id: string;
  centroid: number[];
  members: MemoryEntry[];
  label: string;
  coherence: number;
  size: number;
  createdAt: number;
  // 层次聚类字段
  parent?: string;
  children?: string[];
  level: number;
  // 主题建模字段
  topics?: string[];
  topicDistribution?: number[];
}

export interface ClusteringOptions {
  numClusters?: number;
  maxIterations?: number;
  tolerance?: number;
  distanceMetric?: 'euclidean' | 'cosine' | 'manhattan';
  minClusterSize?: number;
  // 层次聚类选项
  enableHierarchical?: boolean;
  maxLevels?: number;
  linkageMethod?: 'single' | 'complete' | 'average';
  // 主题建模选项
  enableTopicModeling?: boolean;
  numTopics?: number;
  // 簇清理选项
  minClusterSizeForEviction?: number;
  enableAutoEviction?: boolean;
}

export interface ClusteringResult {
  clusters: Cluster[];
  outliers: MemoryEntry[];
  totalProcessed: number;
  iterations: number;
  converged: boolean;
  silhouetteScore?: number;
  // 层次聚类结果
  hierarchicalTree?: ClusterNode;
  // 主题建模结果
  topicModel?: TopicModelResult;
}

// 层次聚类树节点
export interface ClusterNode {
  id: string;
  members: MemoryEntry[];
  children?: ClusterNode[];
  level: number;
  centroid?: number[];
  label?: string;
}

// 主题建模结果
export interface TopicModelResult {
  topics: Topic[];
  documentTopics: Map<number, number[]>;  // entryId -> topic distribution
  coherence: number;
}

export interface Topic {
  id: number;
  words: Array<{ word: string; weight: number }>;
  label?: string;
}

/**
 * 简易 LDA 主题模型实现
 */
class SimpleLDA {
  private numTopics: number;
  private iterations: number;
  private alpha: number;
  private beta: number;
  private vocabulary: Map<string, number> = new Map();
  private documents: Array<{ words: number[]; topics: number[] }> = [];
  private topicWordCounts: number[][];
  private docTopicCounts: number[][];
  private topicCounts: number[];

  constructor(numTopics: number = 5, iterations: number = 50) {
    this.numTopics = numTopics;
    this.iterations = iterations;
    this.alpha = 0.1;
    this.beta = 0.01;
    this.topicWordCounts = [];
    this.docTopicCounts = [];
    this.topicCounts = new Array(numTopics).fill(0);
  }

  fit(entries: MemoryEntry[]): TopicModelResult {
    // 构建词汇表
    this.buildVocabulary(entries);

    if (this.vocabulary.size === 0) {
      return { topics: [], documentTopics: new Map(), coherence: 0 };
    }

    // 初始化
    this.initializeModel(entries);

    // Gibbs 采样
    this.runGibbsSampling();

    // 提取主题
    const topics = this.extractTopics();
    const documentTopics = this.extractDocumentTopics(entries);

    return {
      topics,
      documentTopics,
      coherence: this.calculateCoherence(topics),
    };
  }

  private buildVocabulary(entries: MemoryEntry[]): void {
    let wordId = 0;
    for (const entry of entries) {
      const words = this.tokenize(entry.text);
      for (const word of words) {
        if (!this.vocabulary.has(word)) {
          this.vocabulary.set(word, wordId++);
        }
      }
    }
  }

  private tokenize(text: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into', 'over', 'after']);
    return text.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w) && /^[a-z]+$/.test(w));
  }

  private initializeModel(entries: MemoryEntry[]): void {
    const vocabSize = this.vocabulary.size;

    // 初始化计数矩阵
    this.topicWordCounts = Array.from({ length: this.numTopics }, () =>
      new Array(vocabSize).fill(0)
    );
    this.docTopicCounts = [];

    for (const entry of entries) {
      const words = this.tokenize(entry.text).map(w => this.vocabulary.get(w)!);
      const topics = words.map(() => Math.floor(Math.random() * this.numTopics));

      this.documents.push({ words, topics });

      const docTopicCounts = new Array(this.numTopics).fill(0);
      for (let i = 0; i < words.length; i++) {
        const topic = topics[i];
        const word = words[i];
        this.topicWordCounts[topic][word]++;
        this.topicCounts[topic]++;
        docTopicCounts[topic]++;
      }
      this.docTopicCounts.push(docTopicCounts);
    }
  }

  private runGibbsSampling(): void {
    const vocabSize = this.vocabulary.size;

    for (let iter = 0; iter < this.iterations; iter++) {
      for (let d = 0; d < this.documents.length; d++) {
        const doc = this.documents[d];
        for (let i = 0; i < doc.words.length; i++) {
          const word = doc.words[i];
          const oldTopic = doc.topics[i];

          // 减少旧主题计数
          this.topicWordCounts[oldTopic][word]--;
          this.docTopicCounts[d][oldTopic]--;
          this.topicCounts[oldTopic]--;

          // 采样新主题
          const newTopic = this.sampleTopic(d, word, vocabSize);
          doc.topics[i] = newTopic;

          // 增加新主题计数
          this.topicWordCounts[newTopic][word]++;
          this.docTopicCounts[d][newTopic]++;
          this.topicCounts[newTopic]++;
        }
      }
    }
  }

  private sampleTopic(docIndex: number, word: number, vocabSize: number): number {
    const probabilities: number[] = [];

    for (let k = 0; k < this.numTopics; k++) {
      const pWordTopic = (this.topicWordCounts[k][word] + this.beta) /
        (this.topicCounts[k] + vocabSize * this.beta);
      const pTopicDoc = (this.docTopicCounts[docIndex][k] + this.alpha) /
        (this.documents[docIndex].words.length + this.numTopics * this.alpha);
      probabilities.push(pWordTopic * pTopicDoc);
    }

    // 归一化并采样
    const sum = probabilities.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let k = 0; k < this.numTopics; k++) {
      r -= probabilities[k];
      if (r <= 0) return k;
    }
    return this.numTopics - 1;
  }

  private extractTopics(): Topic[] {
    const topics: Topic[] = [];
    const vocabArray = Array.from(this.vocabulary.entries())
      .map(([word, id]) => ({ word, id }));

    for (let k = 0; k < this.numTopics; k++) {
      const wordWeights = vocabArray.map(({ word, id }) => ({
        word,
        weight: this.topicWordCounts[k][id] / (this.topicCounts[k] || 1),
      }));

      wordWeights.sort((a, b) => b.weight - a.weight);
      const topWords = wordWeights.slice(0, 10);

      topics.push({
        id: k,
        words: topWords,
        label: topWords.slice(0, 3).map(w => w.word).join(' '),
      });
    }

    return topics;
  }

  private extractDocumentTopics(entries: MemoryEntry[]): Map<number, number[]> {
    const documentTopics = new Map<number, number[]>();

    for (let d = 0; d < entries.length; d++) {
      const total = this.docTopicCounts[d].reduce((a, b) => a + b, 0) || 1;
      const distribution = this.docTopicCounts[d].map(c => c / total);
      documentTopics.set(entries[d].id, distribution);
    }

    return documentTopics;
  }

  private calculateCoherence(topics: Topic[]): number {
    // 简化的主题一致性计算
    let totalCoherence = 0;
    for (const topic of topics) {
      if (topic.words.length >= 2) {
        // 基于词频的一致性评分
        const avgWeight = topic.words.reduce((s, w) => s + w.weight, 0) / topic.words.length;
        totalCoherence += avgWeight;
      }
    }
    return topics.length > 0 ? totalCoherence / topics.length : 0;
  }
}

/**
 * 层次聚类器
 */
class HierarchicalClustering {
  private linkageMethod: 'single' | 'complete' | 'average';

  constructor(linkageMethod: 'single' | 'complete' | 'average' = 'average') {
    this.linkageMethod = linkageMethod;
  }

  // 凝聚型层次聚类
  agglomerative(entries: MemoryEntry[], maxLevels: number = 3): ClusterNode {
    if (entries.length === 0) {
      return { id: 'root', members: [], level: 0 };
    }

    // 初始时每个条目是一个簇
    let clusters: ClusterNode[] = entries.map((entry, i) => ({
      id: `leaf-${i}`,
      members: [entry],
      level: 0,
      centroid: entry.embedding,
    }));

    // 逐步合并
    let level = 0;
    while (clusters.length > 1 && level < maxLevels) {
      level++;
      const newClusters: ClusterNode[] = [];
      const used = new Set<string>();

      for (let i = 0; i < clusters.length; i++) {
        if (used.has(clusters[i].id)) continue;

        let bestMatch = -1;
        let bestDistance = Infinity;

        for (let j = i + 1; j < clusters.length; j++) {
          if (used.has(clusters[j].id)) continue;

          const distance = this.clusterDistance(clusters[i], clusters[j]);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = j;
          }
        }

        if (bestMatch !== -1 && bestDistance < 1.5) {  // 距离阈值
          const merged: ClusterNode = {
            id: `cluster-${level}-${i}`,
            members: [...clusters[i].members, ...clusters[bestMatch].members],
            children: [clusters[i], clusters[bestMatch]],
            level,
            centroid: this.computeCentroid([...clusters[i].members, ...clusters[bestMatch].members]),
          };
          newClusters.push(merged);
          used.add(clusters[i].id);
          used.add(clusters[bestMatch].id);
        } else if (!used.has(clusters[i].id)) {
          newClusters.push({ ...clusters[i], level });
        }
      }

      clusters = newClusters;
    }

    // 构建根节点
    const root: ClusterNode = {
      id: 'root',
      members: entries,
      children: clusters,
      level,
      centroid: this.computeCentroid(entries),
    };

    return root;
  }

  private clusterDistance(a: ClusterNode, b: ClusterNode): number {
    if (!a.centroid || !b.centroid) return Infinity;

    const distances: number[] = [];
    for (const memberA of a.members) {
      for (const memberB of b.members) {
        if (memberA.embedding && memberB.embedding) {
          distances.push(this.euclideanDistance(memberA.embedding, memberB.embedding));
        }
      }
    }

    if (distances.length === 0) return Infinity;

    switch (this.linkageMethod) {
      case 'single':
        return Math.min(...distances);
      case 'complete':
        return Math.max(...distances);
      case 'average':
      default:
        return distances.reduce((s, d) => s + d, 0) / distances.length;
    }
  }

  private computeCentroid(entries: MemoryEntry[]): number[] | undefined {
    const validEntries = entries.filter(e => e.embedding && e.embedding.length > 0);
    if (validEntries.length === 0) return undefined;

    const dim = validEntries[0].embedding!.length;
    const centroid = new Array(dim).fill(0);
    for (const entry of validEntries) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += entry.embedding![i];
      }
    }
    for (let i = 0; i < dim; i++) {
      centroid[i] /= validEntries.length;
    }
    return centroid;
  }

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }
}

/**
 * Memory 聚类器
 * 支持 K-Means、层次聚类、主题建模、自动标签生成和簇清理
 */
export class MemoryClustering {
  private options: Required<Omit<ClusteringOptions, 'linkageMethod' | 'numTopics' | 'minClusterSizeForEviction'>> & {
    linkageMethod?: 'single' | 'complete' | 'average';
    numTopics?: number;
    minClusterSizeForEviction?: number;
  };
  private lda: SimpleLDA;
  private hierarchical: HierarchicalClustering;

  constructor(options: ClusteringOptions = {}) {
    this.options = {
      numClusters: options.numClusters ?? 5,
      maxIterations: options.maxIterations ?? 100,
      tolerance: options.tolerance ?? 0.001,
      distanceMetric: options.distanceMetric ?? 'cosine',
      minClusterSize: options.minClusterSize ?? 1,
      enableHierarchical: options.enableHierarchical ?? false,
      maxLevels: options.maxLevels ?? 3,
      linkageMethod: options.linkageMethod ?? 'average',
      enableTopicModeling: options.enableTopicModeling ?? false,
      numTopics: options.numTopics ?? 5,
      minClusterSizeForEviction: options.minClusterSizeForEviction ?? 2,
      enableAutoEviction: options.enableAutoEviction ?? false,
    };
    this.lda = new SimpleLDA(this.options.numTopics);
    this.hierarchical = new HierarchicalClustering(this.options.linkageMethod);
  }

  /**
   * 执行聚类分析
   */
  cluster(entries: MemoryEntry[]): ClusteringResult {
    const validEntries = entries.filter((e) => e.embedding && e.embedding.length > 0);

    if (validEntries.length < this.options.numClusters) {
      return {
        clusters: [],
        outliers: validEntries,
        totalProcessed: validEntries.length,
        iterations: 0,
        converged: true,
      };
    }

    // K-Means 聚类
    const kmeansResult = this.kmeansCluster(validEntries);
    let clusters = kmeansResult.clusters;

    // 层次聚类
    let hierarchicalTree: ClusterNode | undefined;
    if (this.options.enableHierarchical) {
      hierarchicalTree = this.hierarchical.agglomerative(validEntries, this.options.maxLevels);
    }

    // 主题建模
    let topicModel: TopicModelResult | undefined;
    if (this.options.enableTopicModeling) {
      topicModel = this.lda.fit(validEntries);
      // 为簇添加主题标签
      clusters = this.assignTopicLabels(clusters, topicModel);
    }

    // 自动标签生成
    clusters = clusters.map(c => ({
      ...c,
      label: this.generateEnhancedLabel(c),
    }));

    // 簇清理
    if (this.options.enableAutoEviction) {
      const { clusters: filtered, outliers: evicted } = this.evictSmallClusters(clusters);
      clusters = filtered;
      kmeansResult.outliers.push(...evicted);
    }

    return {
      clusters,
      outliers: kmeansResult.outliers,
      totalProcessed: validEntries.length,
      iterations: kmeansResult.iterations,
      converged: kmeansResult.converged,
      silhouetteScore: this.calculateSilhouetteScore(validEntries, clusters),
      hierarchicalTree,
      topicModel,
    };
  }

  /**
   * K-Means 聚类核心算法
   */
  private kmeansCluster(entries: MemoryEntry[]): {
    clusters: Cluster[];
    outliers: MemoryEntry[];
    iterations: number;
    converged: boolean;
  } {
    let centroids = this.initializeCentroids(entries);
    let assignments = new Array<number>(entries.length).fill(0);
    let iterations = 0;
    let converged = false;

    for (let iter = 0; iter < this.options.maxIterations; iter++) {
      iterations++;
      const newAssignments = entries.map((entry) =>
        this.findNearestCentroid(entry.embedding!, centroids),
      );

      const changed = newAssignments.some((a, i) => a !== assignments[i]);
      assignments = newAssignments;

      const newCentroids = this.recomputeCentroids(entries, assignments, centroids);

      const shift = this.calculateTotalShift(centroids, newCentroids);
      centroids = newCentroids;

      if (!changed || shift < this.options.tolerance) {
        converged = true;
        break;
      }
    }

    const clusters = this.buildClusters(entries, assignments, centroids);
    const outliers = entries.filter(
      (_, i) => !clusters.some((c) => c.members.some((m) => m.id === entries[i].id)),
    );

    return { clusters, outliers, iterations, converged };
  }

  /**
   * 层次聚类
   */
  hierarchicalClustering(entries: MemoryEntry[], maxLevels?: number): ClusterNode {
    return this.hierarchical.agglomerate(entries, maxLevels ?? this.options.maxLevels);
  }

  /**
   * 主题建模
   */
  topicModeling(entries: MemoryEntry[]): TopicModelResult {
    return this.lda.fit(entries);
  }

  /**
   * 自动生成增强版簇标签
   */
  generateEnhancedLabel(cluster: Cluster): string {
    const members = cluster.members;
    if (members.length === 0) return 'empty';

    // 提取高频词
    const wordFreq = new Map<string, number>();
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used']);

    for (const member of members) {
      const words = member.text.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length < 3 || stopWords.has(word)) continue;
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    // 提取元数据标签
    const tagFreq = new Map<string, number>();
    for (const member of members) {
      const tags = (member.metadata?.tags as string[]) || [];
      for (const tag of tags) {
        tagFreq.set(tag, (tagFreq.get(tag) || 0) + 1);
      }
    }

    // 组合标签
    const topWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([word]) => word);

    const topTags = Array.from(tagFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([tag]) => `#${tag}`);

    const labelParts = [...topTags, ...topWords].slice(0, 3);
    return labelParts.length > 0 ? labelParts.join(' ') : 'unnamed';
  }

  /**
   * 清理小簇
   */
  evictSmallClusters(clusters: Cluster[]): { clusters: Cluster[]; outliers: MemoryEntry[] } {
    const minSize = this.options.minClusterSizeForEviction;
    const validClusters: Cluster[] = [];
    const evictedMembers: MemoryEntry[] = [];

    for (const cluster of clusters) {
      if (cluster.size >= minSize) {
        validClusters.push(cluster);
      } else {
        evictedMembers.push(...cluster.members);
      }
    }

    return { clusters: validClusters, outliers: evictedMembers };
  }

  /**
   * 为簇分配主题标签
   */
  private assignTopicLabels(clusters: Cluster[], topicModel: TopicModelResult): Cluster[] {
    return clusters.map(cluster => {
      // 计算簇的主题分布
      const topicScores = new Array(topicModel.topics.length).fill(0);
      for (const member of cluster.members) {
        const docTopics = topicModel.documentTopics.get(member.id);
        if (docTopics) {
          for (let i = 0; i < docTopics.length; i++) {
            topicScores[i] += docTopics[i];
          }
        }
      }

      // 归一化
      const memberCount = cluster.members.length || 1;
      for (let i = 0; i < topicScores.length; i++) {
        topicScores[i] /= memberCount;
      }

      // 找到主要主题
      const topTopicIndices = topicScores
        .map((score, index) => ({ score, index }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(t => t.index);

      const topics = topTopicIndices.map(i => topicModel.topics[i]?.label || `topic-${i}`);

      return {
        ...cluster,
        topics,
        topicDistribution: topicScores,
      };
    });
  }

  private initializeCentroids(entries: MemoryEntry[]): number[][] {
    const dimension = entries[0].embedding!.length;
    const centroids: number[][] = [];
    const usedIndices = new Set<number>();

    for (let i = 0; i < this.options.numClusters; i++) {
      let randomIndex: number;
      do {
        randomIndex = Math.floor(Math.random() * entries.length);
      } while (usedIndices.has(randomIndex));
      usedIndices.add(randomIndex);
      centroids.push([...entries[randomIndex].embedding!]);
    }

    return centroids;
  }

  private findNearestCentroid(embedding: number[], centroids: number[][]): number {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < centroids.length; i++) {
      const distance = this.calculateDistance(embedding, centroids[i]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    return nearestIndex;
  }

  private recomputeCentroids(entries: MemoryEntry[], assignments: number[], oldCentroids: number[][]): number[][] {
    const dimension = oldCentroids[0].length;
    const newCentroids: number[][] = oldCentroids.map((c) => [...c]);

    for (let i = 0; i < this.options.numClusters; i++) {
      const clusterMembers = entries.filter((_, index) => assignments[index] === i);
      if (clusterMembers.length === 0) continue;

      const centroid = new Array(dimension).fill(0);
      for (const member of clusterMembers) {
        for (let j = 0; j < dimension; j++) {
          centroid[j] += member.embedding![j];
        }
      }
      for (let j = 0; j < dimension; j++) {
        centroid[j] /= clusterMembers.length;
      }
      newCentroids[i] = centroid;
    }

    return newCentroids;
  }

  private calculateTotalShift(oldCentroids: number[][], newCentroids: number[][]): number {
    let totalShift = 0;
    for (let i = 0; i < oldCentroids.length; i++) {
      totalShift += this.calculateDistance(oldCentroids[i], newCentroids[i]);
    }
    return totalShift;
  }

  private calculateDistance(a: number[], b: number[]): number {
    switch (this.options.distanceMetric) {
      case 'cosine':
        return 1 - this.cosineSimilarity(a, b);
      case 'manhattan':
        return this.manhattanDistance(a, b);
      case 'euclidean':
      default:
        return this.euclideanDistance(a, b);
    }
  }

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }

  private manhattanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.abs(a[i] - b[i]);
    }
    return sum;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  private buildClusters(entries: MemoryEntry[], assignments: number[], centroids: number[][]): Cluster[] {
    const clusterMap = new Map<number, MemoryEntry[]>();

    for (let i = 0; i < entries.length; i++) {
      const clusterIndex = assignments[i];
      if (!clusterMap.has(clusterIndex)) {
        clusterMap.set(clusterIndex, []);
      }
      clusterMap.get(clusterIndex)!.push(entries[i]);
    }

    const clusters: Cluster[] = [];
    for (const [index, members] of clusterMap) {
      if (members.length < this.options.minClusterSize) continue;

      const coherence = this.calculateCoherence(members, centroids[index]);
      clusters.push({
        id: `cluster-${index}-${Date.now()}`,
        centroid: centroids[index],
        members,
        label: this.generateEnhancedLabel({ members, label: '' } as Cluster),
        coherence,
        size: members.length,
        createdAt: Date.now(),
        level: 0,
      });
    }

    return clusters.sort((a, b) => b.size - a.size);
  }

  private calculateCoherence(members: MemoryEntry[], centroid: number[]): number {
    if (members.length === 0) return 0;
    const distances = members.map((m) => this.calculateDistance(m.embedding!, centroid));
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    return 1 / (1 + avgDistance);
  }

  calculateSilhouetteScore(entries: MemoryEntry[], clusters: Cluster[]): number {
    if (clusters.length < 2) return 0;

    let totalScore = 0;
    let count = 0;

    for (const entry of entries) {
      if (!entry.embedding) continue;

      const ownCluster = clusters.find((c) => c.members.some((m) => m.id === entry.id));
      if (!ownCluster) continue;

      const a = this.averageDistanceToCluster(entry, ownCluster);
      const b = Math.min(
        ...clusters
          .filter((c) => c.id !== ownCluster.id)
          .map((c) => this.averageDistanceToCluster(entry, c)),
      );

      if (a === 0 && b === 0) continue;

      const silhouette = (b - a) / Math.max(a, b);
      totalScore += silhouette;
      count++;
    }

    return count > 0 ? totalScore / count : 0;
  }

  private averageDistanceToCluster(entry: MemoryEntry, cluster: Cluster): number {
    const otherMembers = cluster.members.filter((m) => m.id !== entry.id);
    if (otherMembers.length === 0) return 0;

    const total = otherMembers.reduce(
      (sum, m) => sum + this.calculateDistance(entry.embedding!, m.embedding!),
      0,
    );
    return total / otherMembers.length;
  }
}

export const memoryClustering = new MemoryClustering();