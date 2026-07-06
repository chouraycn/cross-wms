import type { MemoryEntry } from './types.js';

export interface Cluster {
  id: string;
  centroid: number[];
  members: MemoryEntry[];
  label: string;
  coherence: number;
  size: number;
  createdAt: number;
}

export interface ClusteringOptions {
  numClusters?: number;
  maxIterations?: number;
  tolerance?: number;
  distanceMetric?: 'euclidean' | 'cosine' | 'manhattan';
  minClusterSize?: number;
}

export interface ClusteringResult {
  clusters: Cluster[];
  outliers: MemoryEntry[];
  totalProcessed: number;
  iterations: number;
  converged: boolean;
  silhouetteScore?: number;
}

export class MemoryClustering {
  private options: Required<ClusteringOptions>;

  constructor(options: ClusteringOptions = {}) {
    this.options = {
      numClusters: options.numClusters ?? 5,
      maxIterations: options.maxIterations ?? 100,
      tolerance: options.tolerance ?? 0.001,
      distanceMetric: options.distanceMetric ?? 'cosine',
      minClusterSize: options.minClusterSize ?? 1,
    };
  }

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

    let centroids = this.initializeCentroids(validEntries);
    let assignments = new Array<number>(validEntries.length).fill(0);
    let iterations = 0;
    let converged = false;

    for (let iter = 0; iter < this.options.maxIterations; iter++) {
      iterations++;
      const newAssignments = validEntries.map((entry) =>
        this.findNearestCentroid(entry.embedding!, centroids),
      );

      const changed = newAssignments.some((a, i) => a !== assignments[i]);
      assignments = newAssignments;

      const newCentroids = this.recomputeCentroids(validEntries, assignments, centroids);

      const shift = this.calculateTotalShift(centroids, newCentroids);
      centroids = newCentroids;

      if (!changed || shift < this.options.tolerance) {
        converged = true;
        break;
      }
    }

    const clusters = this.buildClusters(validEntries, assignments, centroids);
    const outliers = validEntries.filter(
      (_, i) => !clusters.some((c) => c.members.some((m) => m.id === validEntries[i].id)),
    );

    return {
      clusters,
      outliers,
      totalProcessed: validEntries.length,
      iterations,
      converged,
    };
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
        label: this.generateClusterLabel(members),
        coherence,
        size: members.length,
        createdAt: Date.now(),
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

  private generateClusterLabel(members: MemoryEntry[]): string {
    const wordFreq = new Map<string, number>();
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were']);

    for (const member of members) {
      const words = member.text.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length < 3 || stopWords.has(word)) continue;
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    const topWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word]) => word);

    return topWords.length > 0 ? topWords.join(' ') : 'unnamed';
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