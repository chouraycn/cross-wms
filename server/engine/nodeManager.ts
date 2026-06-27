/**
 * Node Manager
 * 节点管理器 - 管理分布式工作节点
 */

export type NodeStatus = "online" | "offline" | "busy" | "idle" | "error" | "connecting" | "disconnected";
export type NodeType = "worker" | "gateway" | "cron" | "tool-server" | "compute";

export interface NodeInfo {
  id: string;
  name: string;
  type: NodeType;
  status: NodeStatus;
  endpoint?: string;
  version?: string;
  capabilities: string[];
  tags: string[];
  maxConcurrency: number;
  currentLoad: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  cpuUsage?: number;
  memoryUsage?: number;
  memoryTotal?: number;
  connectedAt?: number;
  lastSeenAt?: number;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface NodeRegistration {
  name: string;
  type: NodeType;
  endpoint?: string;
  capabilities?: string[];
  tags?: string[];
  maxConcurrency?: number;
  version?: string;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface NodeJob {
  id: string;
  nodeId: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
  priority: number;
}

class NodeManager {
  private readonly nodes = new Map<string, NodeInfo>();
  private readonly jobs = new Map<string, NodeJob>();
  private readonly nodeJobs = new Map<string, Set<string>>();
  private heartbeatTimeoutMs = 30000;

  constructor() {
    this.initializeLocalNode();
  }

  private initializeLocalNode(): void {
    const localNode: NodeInfo = {
      id: "local-main",
      name: "Local Main Node",
      type: "gateway",
      status: "online",
      version: "1.0.0",
      capabilities: ["chat", "agents", "tools", "memory", "cron"],
      tags: ["local", "main", "primary"],
      maxConcurrency: 10,
      currentLoad: 0,
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.nodes.set("local-main", localNode);
  }

  // ========== Node Registration ==========

  registerNode(registration: NodeRegistration): NodeInfo {
    const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const node: NodeInfo = {
      id,
      name: registration.name,
      type: registration.type,
      status: "connecting",
      endpoint: registration.endpoint,
      version: registration.version,
      capabilities: registration.capabilities ?? [],
      tags: registration.tags ?? [],
      maxConcurrency: registration.maxConcurrency ?? 5,
      currentLoad: 0,
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      createdAt: now,
      updatedAt: now,
      config: registration.config,
      metadata: registration.metadata,
    };

    this.nodes.set(id, node);
    this.nodeJobs.set(id, new Set());
    return node;
  }

  unregisterNode(nodeId: string): boolean {
    this.nodeJobs.delete(nodeId);
    // 清理该节点的所有任务
    for (const [jobId, job] of this.jobs) {
      if (job.nodeId === nodeId && job.status === "running") {
        job.status = "failed";
        job.error = "Node disconnected";
      }
    }
    return this.nodes.delete(nodeId);
  }

  getNode(nodeId: string): NodeInfo | undefined {
    return this.nodes.get(nodeId);
  }

  listNodes(options?: {
    type?: NodeType;
    status?: NodeStatus;
    tag?: string;
    capability?: string;
  }): NodeInfo[] {
    let nodes = Array.from(this.nodes.values());

    if (options?.type) {
      nodes = nodes.filter((n) => n.type === options.type);
    }
    if (options?.status) {
      nodes = nodes.filter((n) => n.status === options.status);
    }
    if (options?.tag) {
      nodes = nodes.filter((n) => n.tags.includes(options.tag!));
    }
    if (options?.capability) {
      nodes = nodes.filter((n) => n.capabilities.includes(options.capability!));
    }

    return nodes.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ========== Heartbeat ==========

  heartbeat(nodeId: string, stats?: {
    cpuUsage?: number;
    memoryUsage?: number;
    memoryTotal?: number;
    currentLoad?: number;
  }): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    node.lastSeenAt = Date.now();
    node.status = "online";
    node.updatedAt = Date.now();

    if (stats?.cpuUsage !== undefined) node.cpuUsage = stats.cpuUsage;
    if (stats?.memoryUsage !== undefined) node.memoryUsage = stats.memoryUsage;
    if (stats?.memoryTotal !== undefined) node.memoryTotal = stats.memoryTotal;
    if (stats?.currentLoad !== undefined) node.currentLoad = stats.currentLoad;

    this.nodes.set(nodeId, node);
    return true;
  }

  checkNodeHealth(): void {
    const now = Date.now();
    for (const [nodeId, node] of this.nodes) {
      if (node.status === "online" && node.lastSeenAt) {
        if (now - node.lastSeenAt > this.heartbeatTimeoutMs) {
          node.status = "disconnected";
          node.updatedAt = now;
          this.nodes.set(nodeId, node);
        }
      }
    }
  }

  // ========== Job Management ==========

  assignJob(nodeId: string, jobType: string, priority = 0): NodeJob | null {
    const node = this.nodes.get(nodeId);
    if (!node || node.status !== "online") return null;

    if (node.currentLoad >= node.maxConcurrency) {
      return null;
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: NodeJob = {
      id: jobId,
      nodeId,
      type: jobType,
      status: "queued",
      priority,
    };

    this.jobs.set(jobId, job);
    const nodeJobSet = this.nodeJobs.get(nodeId);
    if (nodeJobSet) {
      nodeJobSet.add(jobId);
    }

    // 立即开始
    job.status = "running";
    job.startedAt = Date.now();
    node.currentLoad++;
    node.totalJobs++;
    node.updatedAt = Date.now();

    return job;
  }

  completeJob(jobId: string, result?: unknown): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = "completed";
    job.completedAt = Date.now();
    job.result = result;

    const node = this.nodes.get(job.nodeId);
    if (node) {
      node.currentLoad = Math.max(0, node.currentLoad - 1);
      node.completedJobs++;
      node.updatedAt = Date.now();
      this.nodes.set(job.nodeId, node);
    }

    return true;
  }

  failJob(jobId: string, error: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = "failed";
    job.completedAt = Date.now();
    job.error = error;

    const node = this.nodes.get(job.nodeId);
    if (node) {
      node.currentLoad = Math.max(0, node.currentLoad - 1);
      node.failedJobs++;
      node.updatedAt = Date.now();
      this.nodes.set(job.nodeId, node);
    }

    return true;
  }

  getJob(jobId: string): NodeJob | undefined {
    return this.jobs.get(jobId);
  }

  listNodeJobs(nodeId: string, status?: NodeJob["status"]): NodeJob[] {
    const jobIds = this.nodeJobs.get(nodeId);
    if (!jobIds) return [];

    let jobs = Array.from(jobIds)
      .map((id) => this.jobs.get(id))
      .filter((j): j is NodeJob => j !== undefined);

    if (status) {
      jobs = jobs.filter((j) => j.status === status);
    }

    return jobs.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  }

  // ========== Load Balancing ==========

  findBestNode(capability: string, type?: NodeType): NodeInfo | null {
    const candidates = this.listNodes({
      type,
      status: "online",
      capability,
    });

    if (candidates.length === 0) return null;

    // 选择负载最低的节点
    candidates.sort((a, b) => {
      const loadA = a.currentLoad / Math.max(1, a.maxConcurrency);
      const loadB = b.currentLoad / Math.max(1, b.maxConcurrency);
      return loadA - loadB;
    });

    return candidates[0];
  }

  // ========== Stats ==========

  getStats(): {
    totalNodes: number;
    onlineNodes: number;
    offlineNodes: number;
    totalJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
    byType: Record<NodeType, number>;
  } {
    const nodes = Array.from(this.nodes.values());
    const byType = {} as Record<NodeType, number>;

    for (const node of nodes) {
      byType[node.type] = (byType[node.type] ?? 0) + 1;
    }

    return {
      totalNodes: nodes.length,
      onlineNodes: nodes.filter((n) => n.status === "online" || n.status === "idle" || n.status === "busy").length,
      offlineNodes: nodes.filter((n) => n.status === "offline" || n.status === "disconnected" || n.status === "error").length,
      totalJobs: nodes.reduce((sum, n) => sum + n.totalJobs, 0),
      runningJobs: nodes.reduce((sum, n) => sum + n.currentLoad, 0),
      completedJobs: nodes.reduce((sum, n) => sum + n.completedJobs, 0),
      failedJobs: nodes.reduce((sum, n) => sum + n.failedJobs, 0),
      byType,
    };
  }

  clear(): void {
    this.nodes.clear();
    this.jobs.clear();
    this.nodeJobs.clear();
  }
}

const NODE_MANAGER_INSTANCE = new NodeManager();

export function getNodeManager(): NodeManager {
  return NODE_MANAGER_INSTANCE;
}

export function registerNode(registration: NodeRegistration): NodeInfo {
  return NODE_MANAGER_INSTANCE.registerNode(registration);
}

export function unregisterNode(nodeId: string): boolean {
  return NODE_MANAGER_INSTANCE.unregisterNode(nodeId);
}

export function findBestNode(capability: string, type?: NodeType): NodeInfo | null {
  return NODE_MANAGER_INSTANCE.findBestNode(capability, type);
}

export function resetNodeManagerForTests(): void {
  NODE_MANAGER_INSTANCE.clear();
}

export type { NodeManager };
