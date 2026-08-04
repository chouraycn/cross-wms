/**
 * Skills Domain Gateway Methods — 技能域 WS RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/skills.ts 的 skills.* 方法
 * - 精简版：复用 engine/skills/discovery 与 engine/skills/lifecycle 的能力
 * - 补齐 skills.status / search / detail / securityVerdicts /
 *   skillCard / bins 六个方法
 *
 * 注意：
 * - cross-wms 的 GatewayMethodContext 不携带 getRuntimeConfig()，
 *   因此使用 DEFAULT_AGENT_WORKSPACE_DIR 作为默认工作区
 *   （与 server/engine/agents/workspace-dirs.ts 的降级策略一致）
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { logger } from '../logger.js';
import { DEFAULT_AGENT_WORKSPACE_DIR } from '../engine/agents/workspace-default.js';
import { listAgentWorkspaceDirs } from '../engine/agents/workspace-dirs.js';
import { collectSkillBins } from '../engine/skills/discovery/bins.js';
import {
  buildWorkspaceSkillStatus,
  resolveSkillStatusEntry,
  type SkillStatusReport,
} from '../engine/skills/discovery/status.js';
import { loadWorkspaceSkillEntries } from '../engine/skills/loading/workspace.js';
import {
  readLocalSkillCardContentSync,
  searchSkillsFromClawHub,
} from '../engine/skills/lifecycle/clawhub.js';
import { fetchClawHubSkillDetail } from '../engine/infra/clawhub.js';
import {
  collectClawHubVerdictTargets,
  fetchOpenClawSkillSecurityVerdicts,
} from '../engine/skills/security/clawhub-verdicts.js';

type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

/** 最小配置对象（OpenClawConfig 的降级子集，仅供 resolve* 函数使用） */
const FALLBACK_CONFIG = {} as Record<string, unknown>;

/**
 * 解析 params 中的 agentId（可选）。
 * cross-wms 不做多 agent 路由校验，直接返回归一化后的 agentId 或 'default'。
 */
function resolveAgentIdFromParams(params: unknown): string {
  const raw = (params as { agentId?: unknown })?.agentId;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }
  return 'default';
}

/**
 * 解析 params 中的 workspaceDir（可选）。
 * 若未指定，使用 DEFAULT_AGENT_WORKSPACE_DIR。
 */
function resolveWorkspaceDirFromParams(params: unknown): string {
  const raw = (params as { workspaceDir?: unknown })?.workspaceDir;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }
  return DEFAULT_AGENT_WORKSPACE_DIR;
}

// ========== skills.status ==========

async function skillsStatus(params: unknown, _ctx: GatewayMethodContext): Promise<SkillStatusReport> {
  const workspaceDir = resolveWorkspaceDirFromParams(params);
  const agentId = resolveAgentIdFromParams(params);

  const report = buildWorkspaceSkillStatus(workspaceDir, {
    config: FALLBACK_CONFIG as never,
    agentId,
  });

  return report;
}

// ========== skills.search ==========

async function skillsSearch(params: unknown, _ctx: GatewayMethodContext) {
  const { query, limit } = params as { query?: string; limit?: number };

  // 优先走 ClawHub 远端搜索；失败时降级为本地工作区技能名匹配
  try {
    const results = await searchSkillsFromClawHub({
      query: typeof query === 'string' ? query : undefined,
      limit: typeof limit === 'number' && Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : undefined,
    });
    return {
      ok: true,
      source: 'clawhub',
      results,
      total: Array.isArray(results) ? results.length : 0,
    };
  } catch (err) {
    logger.warn('[gateway] skills.search: ClawHub unavailable, falling back to local workspace:', err);
  }

  // 本地降级：在工作区技能中按 name/description 模糊匹配
  const workspaceDir = resolveWorkspaceDirFromParams(params);
  const entries = loadWorkspaceSkillEntries(workspaceDir, {
    config: FALLBACK_CONFIG as never,
  });

  const q = typeof query === 'string' ? query.toLowerCase().trim() : '';
  const max = typeof limit === 'number' && Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 50;

  const matched = entries
    .filter((entry) => {
      if (!q) return true;
      const name = entry.skill.name.toLowerCase();
      const desc = entry.skill.description.toLowerCase();
      const key = (entry.metadata?.skillKey ?? '').toLowerCase();
      return name.includes(q) || desc.includes(q) || key.includes(q);
    })
    .slice(0, max)
    .map((entry) => ({
      name: entry.skill.name,
      description: entry.skill.description,
      skillKey: entry.metadata?.skillKey ?? entry.skill.name,
      source: entry.skill.source,
      filePath: entry.skill.filePath,
    }));

  return {
    ok: true,
    source: 'local',
    results: matched,
    total: matched.length,
  };
}

// ========== skills.detail ==========

async function skillsDetail(params: unknown, _ctx: GatewayMethodContext) {
  const { slug, ownerHandle } = params as { slug?: string; ownerHandle?: string };

  if (typeof slug !== 'string' || !slug.trim()) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'slug is required' } };
  }

  try {
    const detail = await fetchClawHubSkillDetail({
      slug: slug.trim(),
      ...(typeof ownerHandle === 'string' && ownerHandle.trim() ? { ownerHandle: ownerHandle.trim() } : {}),
    });
    return {
      ok: true,
      detail,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[gateway] skills.detail: fetchClawHubSkillDetail failed for slug=${slug}:`, message);
    return {
      ok: false,
      error: { code: 'UNAVAILABLE', message: `skill detail unavailable: ${message}` },
    };
  }
}

// ========== skills.securityVerdicts ==========

async function skillsSecurityVerdicts(params: unknown, _ctx: GatewayMethodContext) {
  const workspaceDir = resolveWorkspaceDirFromParams(params);
  const agentId = resolveAgentIdFromParams(params);

  try {
    const report = buildWorkspaceSkillStatus(workspaceDir, {
      config: FALLBACK_CONFIG as never,
      agentId,
    });
    const targets = collectClawHubVerdictTargets(report);

    if (targets.length === 0) {
      return {
        ok: true,
        schema: 'openclaw.skills.security-verdicts.v1',
        items: [],
      };
    }

    const items = await fetchOpenClawSkillSecurityVerdicts(targets);
    return {
      ok: true,
      schema: 'openclaw.skills.security-verdicts.v1',
      items,
      total: items.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[gateway] skills.securityVerdicts failed:', message);
    return {
      ok: false,
      error: { code: 'UNAVAILABLE', message: `security verdicts unavailable: ${message}` },
    };
  }
}

// ========== skills.skillCard ==========

async function skillsSkillCard(params: unknown, _ctx: GatewayMethodContext) {
  const { skillKey } = params as { skillKey?: string };

  if (typeof skillKey !== 'string' || !skillKey.trim()) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'skillKey is required' } };
  }

  const workspaceDir = resolveWorkspaceDirFromParams(params);
  const report = buildWorkspaceSkillStatus(workspaceDir, {
    config: FALLBACK_CONFIG as never,
  });

  const skill = report.skills.find((candidate) => candidate.skillKey === skillKey.trim());
  if (!skill?.skillCard) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: `skill card not found for ${skillKey}` },
    };
  }

  const content = readLocalSkillCardContentSync(skill.baseDir);
  if (content === undefined) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: `skill card content missing for ${skillKey}` },
    };
  }

  return {
    ok: true,
    skillKey: skill.skillKey,
    name: skill.name,
    baseDir: skill.baseDir,
    content,
    sizeBytes: skill.skillCard.sizeBytes,
    path: skill.skillCard.path,
  };
}

// ========== skills.bins ==========

async function skillsBins(_params: unknown, _ctx: GatewayMethodContext) {
  // 枚举所有 agent 工作区目录并合并所需 bins
  const workspaceDirs = listAgentWorkspaceDirs(FALLBACK_CONFIG as never);
  const bins = new Set<string>();

  for (const dir of workspaceDirs) {
    try {
      const entries = loadWorkspaceSkillEntries(dir, {
        config: FALLBACK_CONFIG as never,
      });
      for (const bin of collectSkillBins(entries)) {
        bins.add(bin);
      }
    } catch (err) {
      logger.warn(`[gateway] skills.bins: failed to load workspace ${dir}:`, err);
    }
  }

  return {
    ok: true,
    bins: [...bins].sort(),
    total: bins.size,
  };
}

/**
 * 注册所有 Skills 域 WS 方法
 */
export function registerSkillsMethods(registry: GatewayMethodRegistry): void {
  registry.register('skills.status', skillsStatus);
  registry.register('skills.search', skillsSearch);
  registry.register('skills.detail', skillsDetail);
  registry.register('skills.securityVerdicts', skillsSecurityVerdicts);
  registry.register('skills.skillCard', skillsSkillCard);
  registry.register('skills.bins', skillsBins);

  logger.info('[gateway] Skills 域 WS 方法已注册 (status/search/detail/securityVerdicts/skillCard/bins)');
}
