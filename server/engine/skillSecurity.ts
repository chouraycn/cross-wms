/*
 * Skill Security — 技能安全增强（P2 智能技能路由·security 块）
 *
 * 吸收 openclaw 的 skill security 方法论（sandbox-skills / opengrep 扫描危险模式），
 * 落到 cdf 已有基建上：
 *  - 每个技能在 SKILL.md 里声明 group / sandboxScope（skill-runtime.ts 已定义）；
 *  - toolCallReviewer（v11.0）已内置 DANGEROUS_COMMAND_PATTERNS 用于工具调用审查。
 *
 * 本模块在"技能层"做两件事：
 *  1) auditSkillSecurity(skillId)：在 `skill use <id>` 时静态扫描技能正文，
 *     检测危险命令 / 敏感路径 / 反弹 shell 等模式，给出风险等级与发现项，
 *     让 Agent 在按指令执行 exec_command 前先看到安全提示。
 *  2) guardSkillCommand(command)：技能触发的命令在执行前的实时护栏，
 *     命中 critical/high 模式直接拒绝（与 toolCallReviewer 的运行时审查互补）。
 *
 * 设计要点：
 *  - 模式集自包含（不依赖 toolCallReviewer 的私有常量），便于独立演进。
 *  - 所有扫描均为只读、同步、无网络，绝不阻断主链路；异常时降级为低风险放行。
 */

import { skillRegistry } from './skillRegistry.js';
import { logger } from '../logger.js';
import type { SandboxScope, SkillPermissionGroup } from '../types/skill-runtime.js';

// ===================== 危险模式 =====================

/** 破坏性 / 危险命令模式 */
const DANGEROUS_COMMAND_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//i, // rm -rf /
  /rm\s+-rf\s+~/i, // rm -rf ~
  /rm\s+-rf\s+\*/i, // rm -rf *
  /rm\s+-r[f]?\s+--no-preserve-root/i, // rm --no-preserve-root
  /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/i, // fork bomb
  /mkfs\.[a-z0-9]/i, // mkfs.*
  /dd\s+if=\/dev\/zero/i, // dd if=/dev/zero
  /dd\s+if=\/dev\/[a-z]/i, // dd if=/dev/...
  /chmod\s+(-R\s+)?777\s/i, // chmod 777
  />\s*\/dev\/sd[a-z]/i, // > /dev/sda
  /curl\s+[^|]*\|\s*(sh|bash)\b/i, // curl ... | sh
  /wget\s+[^|]*\|\s*(sh|bash)\b/i, // wget ... | sh
  /sudo\s+rm\b/i, // sudo rm
  /\b(shutdown|poweroff|halt|reboot)\b/i, // 关机/重启
];

/** 敏感路径模式 */
const DANGEROUS_PATH_PATTERNS: RegExp[] = [
  /^\/etc\//i,
  /^\/var\/log\//i,
  /^\/root\//i,
  /^\/proc\//i,
  /^\/sys\//i,
  /^~\/\.ssh\//i,
  /id_rsa/i,
  /\.env(\b|[^a-z])/i,
  /\/etc\/shadow/i,
];

/** 反弹 shell / 数据外泄模式 */
const NETWORK_EXFIL_PATTERNS: RegExp[] = [
  /nc\s+-[a-z]*e\b/i, // netcat 反弹
  /bash\s+-i\s+>&\s*/i, // bash 交互反弹
  /\/dev\/tcp\//i, // /dev/tcp 反弹
  /curl\s+[^|]*--data[^|]*\|/i, // curl 数据外泄
];

// ===================== 类型 =====================

export type SecurityRiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface SecurityFinding {
  /** 模式分类 */
  category: 'destructive_command' | 'sensitive_path' | 'network_exfil' | 'privilege' | 'scope';
  /** 严重度 */
  severity: SecurityRiskLevel;
  /** 命中片段（截断） */
  snippet: string;
  /** 说明 */
  reason: string;
}

export interface SkillSecurityReport {
  /** 技能是否存在 */
  found: boolean;
  skillId?: string;
  /** 综合风险等级 */
  riskLevel: SecurityRiskLevel;
  /** 声明的安全沙箱范围 */
  sandboxScope?: SandboxScope;
  /** 声明的权限分组 */
  group?: SkillPermissionGroup;
  /** 发现项 */
  findings: SecurityFinding[];
  /** 建议的门控模式 */
  recommendedGate: 'auto' | 'manual' | 'ask';
}

// ===================== 工具函数 =====================

function fromContent(content: string | undefined): string {
  return typeof content === 'string' ? content : '';
}

function highestLevel(a: SecurityRiskLevel, b: SecurityRiskLevel): SecurityRiskLevel {
  const order: SecurityRiskLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function matchAny(patterns: RegExp[], text: string): RegExp | null {
  for (const p of patterns) {
    if (p.test(text)) return p;
  }
  return null;
}

// ===================== 核心 API =====================

/**
 * 审计单个技能的安全性。
 *
 * @param skillId 技能 ID
 * @returns 安全报告（found=false 表示技能未注册）
 */
export function auditSkillSecurity(skillId: string): SkillSecurityReport {
  const skill = skillRegistry.getSkill(skillId);
  if (!skill) {
    return {
      found: false,
      riskLevel: 'safe',
      findings: [],
      recommendedGate: 'auto',
    };
  }

  const def = skill.definition;
  const content = fromContent(def.skillMdContent);
  const blocks = Array.isArray(def.instructionBlocks) ? def.instructionBlocks.join('\n') : '';
  const text = `${content}\n${blocks}`;

  const findings: SecurityFinding[] = [];
  let risk: SecurityRiskLevel = 'safe';

  const destructive = matchAny(DANGEROUS_COMMAND_PATTERNS, text);
  if (destructive) {
    findings.push({
      category: 'destructive_command',
      severity: 'critical',
      snippet: destructive.source.slice(0, 60),
      reason: '技能正文包含破坏性命令模式（如 rm -rf /、mkfs、dd），执行可能不可逆地损坏系统',
    });
    risk = highestLevel(risk, 'critical');
  }

  const exfil = matchAny(NETWORK_EXFIL_PATTERNS, text);
  if (exfil) {
    findings.push({
      category: 'network_exfil',
      severity: 'critical',
      snippet: exfil.source.slice(0, 60),
      reason: '技能正文包含反弹 shell / 数据外泄模式，存在被滥用为 C2 通道的风险',
    });
    risk = highestLevel(risk, 'critical');
  }

  const pathHit = matchAny(DANGEROUS_PATH_PATTERNS, text);
  if (pathHit) {
    findings.push({
      category: 'sensitive_path',
      severity: 'high',
      snippet: pathHit.source.slice(0, 60),
      reason: '技能正文涉及敏感路径（/etc、/root、.ssh、.env 等），可能读取密钥或系统配置',
    });
    risk = highestLevel(risk, 'high');
  }

  // 声明层面的风险评估
  const scope = def.sandboxScope;
  if (scope === 'system' || scope === 'none') {
    findings.push({
      category: 'scope',
      severity: 'high',
      snippet: `sandboxScope=${scope}`,
      reason: `技能声明沙箱范围为 '${scope}'，执行不受工作区限制，风险较高`,
    });
    risk = highestLevel(risk, 'high');
  } else if (scope === 'user') {
    findings.push({
      category: 'scope',
      severity: 'medium',
      snippet: `sandboxScope=${scope}`,
      reason: "技能声明沙箱范围为 'user'，可访问用户主目录，需谨慎",
    });
    risk = highestLevel(risk, 'medium');
  }

  const group = def.group;
  if (group === 'system' || group === 'runtime_exec') {
    findings.push({
      category: 'privilege',
      severity: highestLevel(risk, 'medium'),
      snippet: `group=${group}`,
      reason: `技能权限分组为 '${group}'，涉及系统/命令执行，建议人工确认后使用`,
    });
    risk = highestLevel(risk, 'medium');
  }

  // 建议门控：高风险人工确认
  const recommendedGate: 'auto' | 'manual' | 'ask' =
    risk === 'critical' || risk === 'high' ? 'manual' : risk === 'medium' ? 'ask' : 'auto';

  return {
    found: true,
    skillId: def.id,
    riskLevel: risk,
    sandboxScope: scope,
    group,
    findings,
    recommendedGate,
  };
}

/**
 * 实时护栏：检查技能触发的命令是否安全。
 *
 * @param command 即将执行的命令字符串
 * @param skillId 可选，用于日志关联
 * @returns { allowed, riskLevel, reason }
 */
export function guardSkillCommand(
  command: string,
  skillId?: string,
): { allowed: boolean; riskLevel: SecurityRiskLevel; reason?: string; matched?: string } {
  if (typeof command !== 'string' || !command.trim()) {
    return { allowed: true, riskLevel: 'safe' };
  }

  const destructive = matchAny(DANGEROUS_COMMAND_PATTERNS, command);
  if (destructive) {
    const reason = `命令命中破坏性模式 ${destructive.source}，已被技能安全护栏拒绝`;
    logger.warn(`[SkillSecurity] 拒绝危险命令${skillId ? ` (skill=${skillId})` : ''}: ${command.slice(0, 80)}`);
    return { allowed: false, riskLevel: 'critical', reason, matched: destructive.source };
  }

  const exfil = matchAny(NETWORK_EXFIL_PATTERNS, command);
  if (exfil) {
    const reason = `命令命中反弹 shell / 外泄模式 ${exfil.source}，已被技能安全护栏拒绝`;
    logger.warn(`[SkillSecurity] 拒绝外泄命令${skillId ? ` (skill=${skillId})` : ''}: ${command.slice(0, 80)}`);
    return { allowed: false, riskLevel: 'critical', reason, matched: exfil.source };
  }

  const pathHit = matchAny(DANGEROUS_PATH_PATTERNS, command);
  if (pathHit) {
    const reason = `命令涉及敏感路径 ${pathHit.source}，已被技能安全护栏拒绝`;
    logger.warn(`[SkillSecurity] 拒绝敏感路径命令${skillId ? ` (skill=${skillId})` : ''}: ${command.slice(0, 80)}`);
    return { allowed: false, riskLevel: 'high', reason, matched: pathHit.source };
  }

  return { allowed: true, riskLevel: 'safe' };
}
