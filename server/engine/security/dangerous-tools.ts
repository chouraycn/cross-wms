import { logger } from '../../logger.js';
import type { SecurityFinding, ToolSecurityClassification, ToolSecurityInfo } from './types.js';

const TOOL_SECURITY_CLASSIFICATIONS: ToolSecurityInfo[] = [
  {
    name: 'exec',
    classification: 'critical',
    description: 'Direct command execution - immediate RCE surface',
    requiresApproval: true,
    categories: ['command', 'rce'],
  },
  {
    name: 'spawn',
    classification: 'critical',
    description: 'Arbitrary child process creation - immediate RCE surface',
    requiresApproval: true,
    categories: ['command', 'rce'],
  },
  {
    name: 'shell',
    classification: 'critical',
    description: 'Shell command execution - immediate RCE surface',
    requiresApproval: true,
    categories: ['command', 'rce'],
  },
  {
    name: 'fs_write',
    classification: 'dangerous',
    description: 'Arbitrary file mutation on the host',
    requiresApproval: true,
    categories: ['filesystem', 'write'],
  },
  {
    name: 'fs_delete',
    classification: 'dangerous',
    description: 'Arbitrary file deletion on the host',
    requiresApproval: true,
    categories: ['filesystem', 'delete'],
  },
  {
    name: 'fs_move',
    classification: 'dangerous',
    description: 'Arbitrary file move/rename on the host',
    requiresApproval: true,
    categories: ['filesystem', 'write'],
  },
  {
    name: 'apply_patch',
    classification: 'dangerous',
    description: 'Patch application can rewrite arbitrary files',
    requiresApproval: true,
    categories: ['filesystem', 'write'],
  },
  {
    name: 'sessions_spawn',
    classification: 'critical',
    description: 'Session orchestration - spawning agents remotely is RCE',
    requiresApproval: true,
    categories: ['session', 'rce'],
  },
  {
    name: 'sessions_send',
    classification: 'dangerous',
    description: 'Cross-session injection - message injection across sessions',
    requiresApproval: true,
    categories: ['session', 'injection'],
  },
  {
    name: 'cron',
    classification: 'dangerous',
    description: 'Persistent automation control plane - can create/update/remove scheduled runs',
    requiresApproval: true,
    categories: ['automation', 'control-plane'],
  },
  {
    name: 'gateway',
    classification: 'dangerous',
    description: 'Gateway control plane - prevents gateway reconfiguration via HTTP',
    requiresApproval: true,
    categories: ['control-plane'],
  },
  {
    name: 'nodes',
    classification: 'dangerous',
    description: 'Node command relay can reach system.run on paired hosts',
    requiresApproval: true,
    categories: ['network', 'rce'],
  },
  {
    name: 'fs_read',
    classification: 'caution',
    description: 'File system read access - can access sensitive files',
    requiresApproval: false,
    categories: ['filesystem', 'read'],
  },
  {
    name: 'web_fetch',
    classification: 'caution',
    description: 'Web content fetching - potential SSRF risk',
    requiresApproval: false,
    categories: ['network', 'ssrf'],
  },
  {
    name: 'web_search',
    classification: 'safe',
    description: 'Web search - typically safe, goes through search engines',
    requiresApproval: false,
    categories: ['network', 'search'],
  },
  {
    name: 'git',
    classification: 'caution',
    description: 'Git operations - can modify repositories',
    requiresApproval: false,
    categories: ['vcs', 'filesystem'],
  },
  {
    name: 'memory_read',
    classification: 'safe',
    description: 'Memory read operations - safe read-only access',
    requiresApproval: false,
    categories: ['memory', 'read'],
  },
  {
    name: 'memory_write',
    classification: 'caution',
    description: 'Memory write operations - can modify stored data',
    requiresApproval: false,
    categories: ['memory', 'write'],
  },
];

export const DEFAULT_GATEWAY_HTTP_TOOL_DENY = [
  'exec',
  'spawn',
  'shell',
  'fs_write',
  'fs_delete',
  'fs_move',
  'apply_patch',
  'sessions_spawn',
  'sessions_send',
  'cron',
  'gateway',
  'nodes',
] as const;

export const GATEWAY_OWNER_ONLY_CORE_TOOLS = ['cron', 'gateway', 'nodes'] as const;

export function getToolSecurityInfo(toolName: string): ToolSecurityInfo | undefined {
  return TOOL_SECURITY_CLASSIFICATIONS.find(
    (t) => t.name.toLowerCase() === toolName.toLowerCase(),
  );
}

export function classifyTool(toolName: string): ToolSecurityClassification {
  const info = getToolSecurityInfo(toolName);
  return info?.classification ?? 'caution';
}

export function isToolCritical(toolName: string): boolean {
  return classifyTool(toolName) === 'critical';
}

export function isToolDangerous(toolName: string): boolean {
  const classification = classifyTool(toolName);
  return classification === 'critical' || classification === 'dangerous';
}

export function requiresToolApproval(toolName: string): boolean {
  const info = getToolSecurityInfo(toolName);
  return info?.requiresApproval ?? false;
}

export function getDangerousTools(toolNames: string[]): string[] {
  return toolNames.filter(isToolDangerous);
}

export function getCriticalTools(toolNames: string[]): string[] {
  return toolNames.filter(isToolCritical);
}

export function auditToolUsage(
  toolName: string,
  context: {
    source?: string;
    userId?: string;
    sessionId?: string;
  } = {},
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const info = getToolSecurityInfo(toolName);

  if (!info) {
    findings.push({
      id: `tool-unknown-${toolName}`,
      title: `Unknown tool: ${toolName}`,
      severity: 'low',
      category: 'command',
      description: `Tool ${toolName} is not in the security classification registry.`,
      recommendation: 'Review the tool and add it to the security classification list.',
      metadata: { toolName, ...context },
    });
    return findings;
  }

  if (info.classification === 'critical') {
    findings.push({
      id: `tool-critical-${toolName}`,
      title: `Critical tool usage: ${toolName}`,
      severity: 'critical',
      category: 'command',
      description: `Usage of critical tool detected: ${info.description}`,
      recommendation: 'Ensure proper authorization and auditing for critical tool usage.',
      metadata: { toolName, ...context, categories: info.categories },
    });
  } else if (info.classification === 'dangerous') {
    findings.push({
      id: `tool-dangerous-${toolName}`,
      title: `Dangerous tool usage: ${toolName}`,
      severity: 'high',
      category: 'command',
      description: `Usage of dangerous tool detected: ${info.description}`,
      recommendation: 'Review and approve dangerous tool usage before execution.',
      metadata: { toolName, ...context, categories: info.categories },
    });
  }

  logger.debug(`[Security:DangerousTools] Audited tool ${toolName}: ${info.classification}`);

  return findings;
}

export function filterAllowedTools(
  toolNames: string[],
  options: {
    allowDangerous?: boolean;
    allowCritical?: boolean;
    additionalAllowed?: string[];
    denyList?: string[];
  } = {},
): { allowed: string[]; denied: string[] } {
  const { allowDangerous = false, allowCritical = false, additionalAllowed = [], denyList = [] } = options;
  const allowed: string[] = [];
  const denied: string[] = [];

  const allowedSet = new Set(additionalAllowed.map((t) => t.toLowerCase()));
  const denySet = new Set(denyList.map((t) => t.toLowerCase()));

  for (const toolName of toolNames) {
    const lowerName = toolName.toLowerCase();

    if (denySet.has(lowerName)) {
      denied.push(toolName);
      continue;
    }

    if (allowedSet.has(lowerName)) {
      allowed.push(toolName);
      continue;
    }

    const classification = classifyTool(toolName);

    if (classification === 'critical' && !allowCritical) {
      denied.push(toolName);
      continue;
    }

    if (classification === 'dangerous' && !allowDangerous) {
      denied.push(toolName);
      continue;
    }

    allowed.push(toolName);
  }

  logger.debug(`[Security:DangerousTools] Filtered tools: ${allowed.length} allowed, ${denied.length} denied`);

  return { allowed, denied };
}

export function listAllTools(): ToolSecurityInfo[] {
  return [...TOOL_SECURITY_CLASSIFICATIONS];
}

export function listToolsByClassification(
  classification: ToolSecurityClassification,
): ToolSecurityInfo[] {
  return TOOL_SECURITY_CLASSIFICATIONS.filter((t) => t.classification === classification);
}
