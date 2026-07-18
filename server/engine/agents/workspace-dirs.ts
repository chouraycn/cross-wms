/**
 * Agent workspace directory collection.
 *
 * File sync and cleanup paths use this to enumerate configured agent workspaces
 * plus the default agent workspace without duplicating agent-scope logic.
 *
 * 移植自 openclaw/src/agents/workspace-dirs.ts
 * 降级策略：
 *  - OpenClawConfig 降级为本地最小类型（仅 agents.list 字段）
 *  - resolveAgentWorkspaceDir/resolveDefaultAgentId 在 cross-wms 的 agent-scope 中不存在，
 *    使用本地降级实现：基于 DEFAULT_AGENT_WORKSPACE_DIR 和 agent id 拼接路径
 */

import path from "node:path";

import { DEFAULT_AGENT_WORKSPACE_DIR } from "./workspace-default.js";

// 降级类型：OpenClawConfig 的最小子集
type OpenClawConfigLike = {
  agents?: {
    list?: Array<{
      id: string;
      workspaceDir?: string;
    }>;
  };
};

// 降级实现：resolveDefaultAgentId（openclaw 的 ./agent-scope.js 中导出）
function resolveDefaultAgentId(_cfg: OpenClawConfigLike): string {
  return "default";
}

// 降级实现：resolveAgentWorkspaceDir（openclaw 的 ./agent-scope.js 中导出）
// 优先使用 agent 配置中的 workspaceDir，否则使用默认目录 + agent id 子目录
function resolveAgentWorkspaceDir(cfg: OpenClawConfigLike, agentId: string): string {
  const list = cfg.agents?.list;
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (entry && typeof entry === "object" && entry.id === agentId) {
        if (typeof entry.workspaceDir === "string" && entry.workspaceDir.trim()) {
          return path.resolve(entry.workspaceDir);
        }
        break;
      }
    }
  }
  if (agentId === resolveDefaultAgentId(cfg)) {
    return DEFAULT_AGENT_WORKSPACE_DIR;
  }
  return path.join(DEFAULT_AGENT_WORKSPACE_DIR, agentId);
}

/** Lists unique workspace directories for configured agents and the default agent. */
export function listAgentWorkspaceDirs(cfg: OpenClawConfigLike): string[] {
  const dirs = new Set<string>();
  const list = cfg.agents?.list;
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (entry && typeof entry === "object" && typeof entry.id === "string") {
        dirs.add(resolveAgentWorkspaceDir(cfg, entry.id));
      }
    }
  }
  dirs.add(resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg)));
  return [...dirs];
}
