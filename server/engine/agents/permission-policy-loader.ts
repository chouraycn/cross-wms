/**
 * 权限策略加载器
 *
 * 把外部配置（agent-settings.json / config.json 中的 agentPolicies 字段）
 * 加载到 permissionPolicyEngine，让权限策略引擎从孤岛变为运行时可用。
 *
 * 支持的策略来源：
 *   1. 内联配置（per-agent allowed / denied / requireApproval）
 *   2. 模板（preset: "strict" / "permissive" / "readonly"）
 *   3. 文件路径（JSON / YAML）
 *
 * 设计目标：让 permission-policy-engine 不再是孤岛。
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../logger.js';
import { permissionPolicyEngine } from './permission-policy-engine.js';
import { agentAuditTrail } from './agent-audit-trail.js';
import type { AgentPermission, AgentPermissionPolicy } from './permissions.js';

/** 策略模板 */
export type PolicyTemplate = 'strict' | 'permissive' | 'readonly' | 'standard';

/** 单个策略配置（外部输入） */
export interface PolicyConfigInput {
  /** Agent ID */
  agentId: string;
  /** 直接列出的允许权限 */
  allowed?: AgentPermission[];
  /** 直接列出的拒绝权限 */
  denied?: AgentPermission[];
  /** 直接列出的需审批权限 */
  requireApproval?: AgentPermission[];
  /** 引用模板 */
  template?: PolicyTemplate;
  /** 覆盖文件路径 */
  file?: string;
}

/** 加载结果 */
export interface PolicyLoadResult {
  /** 加载的策略数 */
  loaded: number;
  /** 跳过的策略数（如格式错误） */
  skipped: number;
  /** 错误列表 */
  errors: Array<{ agentId: string; error: string }>;
  /** 已加载的策略列表 */
  policies: AgentPermissionPolicy[];
}

/** 模板定义 */
export const POLICY_TEMPLATES: Record<PolicyTemplate, Omit<AgentPermissionPolicy, 'agentId'>> = {
  strict: {
    allowed: ['file.read', 'memory.read'],
    denied: ['exec.shell', 'file.write', 'network.write', 'subagent.spawn'],
    requireApproval: ['tool.use', 'memory.write', 'network.read'],
  },
  permissive: {
    allowed: ['file.read', 'file.write', 'memory.read', 'memory.write', 'tool.use', 'network.read', 'network.write'],
    denied: [],
    requireApproval: ['exec.shell', 'subagent.spawn'],
  },
  readonly: {
    allowed: ['file.read', 'memory.read'],
    denied: ['file.write', 'exec.shell', 'network.write', 'subagent.spawn', 'memory.write'],
    requireApproval: ['tool.use'],
  },
  standard: {
    allowed: ['file.read', 'tool.use', 'memory.read', 'memory.write'],
    denied: ['exec.shell'],
    requireApproval: ['file.write', 'network.write', 'subagent.spawn'],
  },
};

/** 应用模板到策略（未知模板时返回空 base，不抛错） */
export function applyTemplate(template: PolicyTemplate): Omit<AgentPermissionPolicy, 'agentId'> {
  const def = POLICY_TEMPLATES[template];
  if (!def) {
    return { allowed: [], denied: [], requireApproval: [] };
  }
  return {
    allowed: [...def.allowed],
    denied: [...def.denied],
    requireApproval: [...def.requireApproval],
  };
}

/** 解析单个配置输入为完整策略 */
export function resolvePolicy(input: PolicyConfigInput): AgentPermissionPolicy | undefined {
  if (!input.agentId) {
    return undefined;
  }

  let base: Omit<AgentPermissionPolicy, 'agentId'>;

  if (input.template && POLICY_TEMPLATES[input.template]) {
    base = applyTemplate(input.template);
  } else {
    base = { allowed: [], denied: [], requireApproval: [] };
  }

  // 合并显式声明的权限（去重）
  if (input.allowed) {
    for (const p of input.allowed) {
      if (!base.allowed.includes(p)) base.allowed.push(p);
    }
  }
  if (input.denied) {
    for (const p of input.denied) {
      if (!base.denied.includes(p)) base.denied.push(p);
      // 从 allowed 中移除
      base.allowed = base.allowed.filter((x) => x !== p);
      base.requireApproval = base.requireApproval.filter((x) => x !== p);
    }
  }
  if (input.requireApproval) {
    for (const p of input.requireApproval) {
      if (!base.requireApproval.includes(p)) base.requireApproval.push(p);
      base.allowed = base.allowed.filter((x) => x !== p);
      base.denied = base.denied.filter((x) => x !== p);
    }
  }

  return {
    agentId: input.agentId,
    ...base,
  };
}

/** 加载策略文件（JSON） */
export function loadPolicyFile(filePath: string): PolicyConfigInput[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed as PolicyConfigInput[];
    }
    if (parsed && typeof parsed === 'object' && parsed.policies && Array.isArray(parsed.policies)) {
      return parsed.policies as PolicyConfigInput[];
    }
    return [];
  } catch (err) {
    logger.warn(`[PermissionPolicyLoader] Failed to load ${filePath}: ${err}`);
    return [];
  }
}

/**
 * 批量加载策略到 permissionPolicyEngine
 *
 * @param inputs 策略配置列表
 * @param options.audit 是否记录到审计日志（默认 true）
 */
export function loadPolicies(
  inputs: PolicyConfigInput[],
  options: { audit?: boolean } = {},
): PolicyLoadResult {
  const { audit = true } = options;
  const policies: AgentPermissionPolicy[] = [];
  const errors: Array<{ agentId: string; error: string }> = [];
  let loaded = 0;
  let skipped = 0;

  for (const input of inputs) {
    if (!input.agentId) {
      skipped++;
      errors.push({ agentId: '(unknown)', error: 'Missing agentId' });
      continue;
    }

    // 合并 file 引用
    let combinedInput = input;
    if (input.file) {
      const fromFile = loadPolicyFile(input.file);
      if (fromFile.length > 0) {
        const matched = fromFile.find((f) => f.agentId === input.agentId);
        if (matched) {
          combinedInput = { ...matched, ...input };
        }
      }
    }

    const policy = resolvePolicy(combinedInput);
    if (!policy) {
      skipped++;
      errors.push({ agentId: input.agentId, error: 'Failed to resolve policy' });
      continue;
    }

    permissionPolicyEngine.setPolicy(policy);
    policies.push(policy);
    loaded++;

    if (audit) {
      agentAuditTrail.record(
        {
          agentId: policy.agentId,
          category: 'permission',
          level: 'info',
          type: 'policy.loaded',
          message: `Permission policy loaded for ${policy.agentId}`,
          payload: {
            allowed: policy.allowed,
            denied: policy.denied,
            requireApproval: policy.requireApproval,
            template: combinedInput.template,
          },
        },
      );
    }
  }

  logger.info(
    `[PermissionPolicyLoader] Loaded ${loaded} policies, skipped ${skipped}`,
  );

  return { loaded, skipped, errors, policies };
}

/**
 * 从配置文件加载并应用策略
 *
 * @param configPath 配置文件路径
 */
export function loadPoliciesFromFile(configPath: string): PolicyLoadResult {
  if (!fs.existsSync(configPath)) {
    logger.debug(`[PermissionPolicyLoader] Config file not found: ${configPath}`);
    return { loaded: 0, skipped: 0, errors: [], policies: [] };
  }

  const inputs = loadPolicyFile(configPath);
  return loadPolicies(inputs);
}

/**
 * 验证策略配置（不应用）
 *
 * 用于启动时 dry-run，检查配置格式是否正确。
 */
export function validatePolicyInputs(inputs: PolicyConfigInput[]): {
  valid: boolean;
  errors: string[];
  resolved: Array<{ agentId: string; policy: AgentPermissionPolicy | undefined }>;
} {
  const errors: string[] = [];
  const resolved: Array<{ agentId: string; policy: AgentPermissionPolicy | undefined }> = [];

  const knownPermissions: AgentPermission[] = [
    'file.read',
    'file.write',
    'network.read',
    'network.write',
    'exec.shell',
    'tool.use',
    'memory.read',
    'memory.write',
    'subagent.spawn',
  ];

  for (const input of inputs) {
    if (!input.agentId) {
      errors.push('Missing agentId');
      continue;
    }

    if (input.template && !POLICY_TEMPLATES[input.template]) {
      errors.push(`Unknown template "${input.template}" for ${input.agentId}`);
    }

    const allPerms = [...(input.allowed ?? []), ...(input.denied ?? []), ...(input.requireApproval ?? [])];
    for (const p of allPerms) {
      if (!knownPermissions.includes(p)) {
        errors.push(`Unknown permission "${p}" for ${input.agentId}`);
      }
    }

    // 检查同一权限是否同时出现在多个分类
    const allowedSet = new Set(input.allowed ?? []);
    const deniedSet = new Set(input.denied ?? []);
    const requireApprovalSet = new Set(input.requireApproval ?? []);
    for (const p of allowedSet) {
      if (deniedSet.has(p)) {
        errors.push(`Permission "${p}" in ${input.agentId} appears in both allowed and denied`);
      }
      if (requireApprovalSet.has(p)) {
        errors.push(`Permission "${p}" in ${input.agentId} appears in both allowed and requireApproval`);
      }
    }
    for (const p of deniedSet) {
      if (requireApprovalSet.has(p)) {
        errors.push(`Permission "${p}" in ${input.agentId} appears in both denied and requireApproval`);
      }
    }

    resolved.push({ agentId: input.agentId, policy: resolvePolicy(input) });
  }

  return {
    valid: errors.length === 0,
    errors,
    resolved,
  };
}

/** 列出所有已加载策略 */
export function listLoadedPolicies(): Array<{ agentId: string; policy: AgentPermissionPolicy }> {
  return permissionPolicyEngine.getAllPolicies().map((p) => ({
    agentId: p.agentId,
    policy: p.policy,
  }));
}

/** 列出所有可用模板 */
export function listTemplates(): Array<{ name: PolicyTemplate; definition: Omit<AgentPermissionPolicy, 'agentId'> }> {
  return (Object.entries(POLICY_TEMPLATES) as Array<[PolicyTemplate, Omit<AgentPermissionPolicy, 'agentId'>]>).map(
    ([name, definition]) => ({ name, definition }),
  );
}

/** 单例便捷 API */
export const permissionPolicyLoader = {
  loadPolicies,
  loadPoliciesFromFile,
  validatePolicyInputs,
  resolvePolicy,
  applyTemplate,
  listLoadedPolicies,
  listTemplates,
};
