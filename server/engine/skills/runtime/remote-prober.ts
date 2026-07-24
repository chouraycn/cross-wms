/**
 * 远程节点二进制探测系统
 *
 * 参考 OpenClaw 的远程节点二进制探测：
 * - Gateway 运行在 Linux 时，可探测 macOS 节点
 * - macOS 专属技能在远程节点存在时才激活
 */

import { spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger({ module: "remote-prober" });

// ============================================================================
// 类型定义
// ============================================================================

/** 远程节点配置 */
export interface RemoteNodeConfig {
  /** 节点 ID */
  id: string;
  /** 节点名称 */
  name?: string;
  /** 主机地址 */
  host: string;
  /** SSH 端口 */
  port?: number;
  /** 用户名 */
  user?: string;
  /** 平台类型 */
  platform: "darwin" | "linux" | "win32";
  /** SSH 密钥路径 */
  privateKeyPath?: string;
  /** 连接超时（毫秒） */
  timeout?: number;
}

/** 二进制探测结果 */
export interface BinProbeResult {
  /** 节点 ID */
  nodeId: string;
  /** 二进制名称 */
  bin: string;
  /** 是否存在 */
  exists: boolean;
  /** 版本信息 */
  version?: string;
  /** 路径 */
  path?: string;
  /** 错误信息 */
  error?: string;
}

/** 节点状态 */
export interface NodeStatus {
  /** 节点 ID */
  nodeId: string;
  /** 是否在线 */
  online: boolean;
  /** 平台 */
  platform: string;
  /** 最后检查时间 */
  lastChecked: number;
  /** 可用二进制列表 */
  availableBins: string[];
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// 远程节点探测管理器
// ============================================================================

/** 远程节点探测管理器 */
export class RemoteNodeProber {
  private nodes: Map<string, RemoteNodeConfig> = new Map();
  private statusCache: Map<string, NodeStatus> = new Map();
  private cacheTimeout: number = 60000; // 1 分钟缓存

  constructor(nodes?: RemoteNodeConfig[]) {
    if (nodes) {
      for (const node of nodes) {
        this.addNode(node);
      }
    }
  }

  /** 添加节点 */
  addNode(node: RemoteNodeConfig): void {
    this.nodes.set(node.id, node);
    logger.info(`[RemoteProber] Added node: ${node.id} (${node.platform})`);
  }

  /** 移除节点 */
  removeNode(nodeId: string): boolean {
    const removed = this.nodes.delete(nodeId);
    this.statusCache.delete(nodeId);
    return removed;
  }

  /** 获取节点配置 */
  getNode(nodeId: string): RemoteNodeConfig | undefined {
    return this.nodes.get(nodeId);
  }

  /** 获取所有节点 */
  getAllNodes(): RemoteNodeConfig[] {
    return Array.from(this.nodes.values());
  }

  /** 检查节点是否在线 */
  async checkNodeOnline(nodeId: string): Promise<boolean> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return false;
    }

    try {
      // 使用 SSH 检查连接
      const result = await this.sshExecute(node, "echo ok", 5000);
      return result.includes("ok");
    } catch {
      return false;
    }
  }

  /** 探测二进制是否存在 */
  async probeBin(nodeId: string, bin: string): Promise<BinProbeResult> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return {
        nodeId,
        bin,
        exists: false,
        error: `Node not found: ${nodeId}`,
      };
    }

    try {
      // 构建检查命令
      const command = node.platform === "win32"
        ? `where ${bin}`
        : `which ${bin}`;

      const result = await this.sshExecute(node, command, node.timeout || 10000);

      if (result.includes(bin) || result.includes("/")) {
        // 获取版本
        let version: string | undefined;
        try {
          const versionResult = await this.sshExecute(
            node,
            `${bin} --version 2>&1 | head -1`,
            5000
          );
          version = versionResult.trim();
        } catch {
          // 忽略版本获取失败
        }

        return {
          nodeId,
          bin,
          exists: true,
          path: result.trim(),
          version,
        };
      }

      return {
        nodeId,
        bin,
        exists: false,
      };
    } catch (err) {
      return {
        nodeId,
        bin,
        exists: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** 批量探测二进制 */
  async probeBins(
    nodeId: string,
    bins: string[]
  ): Promise<BinProbeResult[]> {
    const results: BinProbeResult[] = [];

    await Promise.all(
      bins.map(async (bin) => {
        const result = await this.probeBin(nodeId, bin);
        results.push(result);
      })
    );

    return results;
  }

  /** 获取节点状态 */
  async getNodeStatus(nodeId: string): Promise<NodeStatus> {
    // 检查缓存
    const cached = this.statusCache.get(nodeId);
    if (cached && Date.now() - cached.lastChecked < this.cacheTimeout) {
      return cached;
    }

    const node = this.nodes.get(nodeId);
    if (!node) {
      return {
        nodeId,
        online: false,
        platform: "unknown",
        lastChecked: Date.now(),
        availableBins: [],
        error: `Node not found: ${nodeId}`,
      };
    }

    try {
      const online = await this.checkNodeOnline(nodeId);

      let availableBins: string[] = [];
      if (online) {
        // 获取常用二进制列表
        const commonBins = ["node", "npm", "git", "docker"];
        const results = await this.probeBins(nodeId, commonBins);
        availableBins = results.filter((r) => r.exists).map((r) => r.bin);
      }

      const status: NodeStatus = {
        nodeId,
        online,
        platform: node.platform,
        lastChecked: Date.now(),
        availableBins,
      };

      this.statusCache.set(nodeId, status);
      return status;
    } catch (err) {
      const status: NodeStatus = {
        nodeId,
        online: false,
        platform: node.platform,
        lastChecked: Date.now(),
        availableBins: [],
        error: err instanceof Error ? err.message : String(err),
      };

      this.statusCache.set(nodeId, status);
      return status;
    }
  }

  /** 获取所有节点状态 */
  async getAllNodeStatus(): Promise<Map<string, NodeStatus>> {
    const results = new Map<string, NodeStatus>();

    await Promise.all(
      Array.from(this.nodes.keys()).map(async (nodeId) => {
        const status = await this.getNodeStatus(nodeId);
        results.set(nodeId, status);
      })
    );

    return results;
  }

  /** 检查是否存在支持指定平台的节点 */
  async hasNodeWithPlatform(platform: string): Promise<boolean> {
    for (const node of this.nodes.values()) {
      if (node.platform === platform) {
        const online = await this.checkNodeOnline(node.id);
        if (online) {
          return true;
        }
      }
    }
    return false;
  }

  /** 执行 SSH 命令 */
  private async sshExecute(
    node: RemoteNodeConfig,
    command: string,
    timeout: number
  ): Promise<string> {
    const sshArgs = this.buildSshArgs(node, command);

    return new Promise((resolve, reject) => {
      const proc = spawn("ssh", sshArgs, {
        timeout,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`SSH command failed: ${stderr}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });

      setTimeout(() => {
        proc.kill();
        reject(new Error(`SSH command timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /** 构建 SSH 参数 */
  private buildSshArgs(node: RemoteNodeConfig, command: string): string[] {
    const args: string[] = [];

    if (node.port) {
      args.push("-p", String(node.port));
    }

    if (node.privateKeyPath) {
      args.push("-i", node.privateKeyPath);
    }

    // 禁用严格主机密钥检查（开发环境）
    args.push("-o", "StrictHostKeyChecking=no");
    args.push("-o", "UserKnownHostsFile=/dev/null");

    // 连接目标
    const target = node.user ? `${node.user}@${node.host}` : node.host;
    args.push(target);
    args.push(command);

    return args;
  }

  /** 清除缓存 */
  clearCache(): void {
    this.statusCache.clear();
  }

  /** 设置缓存超时 */
  setCacheTimeout(timeout: number): void {
    this.cacheTimeout = timeout;
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalProber: RemoteNodeProber | null = null;

/** 获取全局远程节点探测器 */
export function getRemoteNodeProber(): RemoteNodeProber {
  if (!globalProber) {
    globalProber = new RemoteNodeProber();
  }
  return globalProber;
}

/** 初始化全局远程节点探测器 */
export function initRemoteNodeProber(nodes?: RemoteNodeConfig[]): RemoteNodeProber {
  globalProber = new RemoteNodeProber(nodes);
  return globalProber;
}

/** 重置全局探测器 */
export function resetRemoteNodeProber(): void {
  globalProber = null;
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 检查当前平台 */
export function getCurrentPlatform(): string {
  return process.platform;
}

/** 检查是否为 macOS */
export function isMacOS(): boolean {
  return process.platform === "darwin";
}

/** 检查是否为 Linux */
export function isLinux(): boolean {
  return process.platform === "linux";
}

/** 检查是否为 Windows */
export function isWindows(): boolean {
  return process.platform === "win32";
}