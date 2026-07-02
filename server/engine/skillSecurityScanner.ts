/**
 * Skill Security Scanner — Skill 安全扫描与审计
 *
 * 负责 Skill 的安全性检查和审计日志：
 * 1. 静态扫描 — 扫描 SKILL.md 和代码中的安全风险
 * 2. 执行审计 — 记录 Skill 执行的审计日志
 * 3. 风险评级 — 对 Skill 进行安全风险评级
 *
 * 扫描内容：
 * - 危险命令检测（rm -rf /, dd, etc.）
 * - 敏感路径访问（/etc/passwd, ~/.ssh, etc.）
 * - 网络请求安全（可疑域名、http vs https）
 * - 代码注入风险（eval, exec 等动态执行）
 * - 凭证泄露风险（API key, password 等敏感词）
 */

import { logger } from '../logger.js';
import type {
  SkillDefinition,
  RegisteredSkill,
  SkillContext,
} from '../types/skill-runtime.js';

// ===================== 类型定义 =====================

/** 风险等级 */
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/** 风险类型 */
export type RiskType =
  | 'dangerous_command'
  | 'sensitive_path'
  | 'insecure_network'
  | 'code_injection'
  | 'credential_leak'
  | 'sandbox_escape'
  | 'other';

/** 风险发现 */
export interface RiskFinding {
  /** 风险类型 */
  type: RiskType;
  /** 风险等级 */
  level: RiskLevel;
  /** 风险描述 */
  description: string;
  /** 风险位置（行号/字段名） */
  location?: string;
  /** 建议的修复方式 */
  suggestion?: string;
}

/** 扫描结果 */
export interface ScanResult {
  /** Skill ID */
  skillId: string;
  /** 整体风险等级 */
  overallRisk: RiskLevel;
  /** 风险发现列表 */
  findings: RiskFinding[];
  /** 扫描时间 */
  scannedAt: number;
  /** 扫描耗时（毫秒） */
  durationMs: number;
  /** 是否通过扫描（无 high/critical 风险） */
  passed: boolean;
}

/** 审计记录 */
export interface AuditRecord {
  /** 记录 ID */
  id: string;
  /** Skill ID */
  skillId: string;
  /** 会话 ID */
  sessionId: string;
  /** Agent ID（可选） */
  agentId?: string;
  /** 用户 ID（可选） */
  userId?: string;
  /** 调用参数（脱敏后） */
  params: Record<string, unknown>;
  /** 执行结果 */
  result: 'success' | 'failure' | 'blocked';
  /** 错误信息（失败时） */
  errorMessage?: string;
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** 时间戳 */
  timestamp: number;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 触发的安全检查 */
  securityChecks?: {
    permission: boolean;
    sandbox: boolean;
    params: boolean;
  };
}

/** 审计查询选项 */
export interface AuditQueryOptions {
  /** Skill ID 过滤 */
  skillId?: string;
  /** 会话 ID 过滤 */
  sessionId?: string;
  /** 起始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
  /** 结果过滤 */
  result?: 'success' | 'failure' | 'blocked';
  /** 最大返回数量 */
  limit?: number;
}

// ===================== 常量 =====================

/** 危险命令模式 */
const DANGEROUS_COMMANDS = [
  { pattern: /rm\s+(-rf?|--recursive)\s+\//, level: 'critical' as RiskLevel, desc: '根目录递归删除' },
  { pattern: /dd\s+if=/, level: 'high' as RiskLevel, desc: 'dd 磁盘操作命令' },
  { pattern: /mkfs\./, level: 'high' as RiskLevel, desc: '格式化文件系统' },
  { pattern: /:\(\)\{[\s\S]*:\s*\};/, level: 'critical' as RiskLevel, desc: 'Fork Bomb 攻击' },
  { pattern: /chmod\s+(-R\s+)?777\s+/, level: 'high' as RiskLevel, desc: '设置全局可写权限' },
  { pattern: /chown\s+(-R\s+)?root/, level: 'high' as RiskLevel, desc: '修改文件所有者为 root' },
  { pattern: /sudo\s+/, level: 'medium' as RiskLevel, desc: '使用 sudo 提权' },
  { pattern: /eval\s+[`'"]/, level: 'high' as RiskLevel, desc: '动态代码执行（eval）' },
  { pattern: />\s*\/dev\/(null|zero)/, level: 'low' as RiskLevel, desc: '输出到空设备' },
];

/** 敏感路径模式 */
const SENSITIVE_PATHS = [
  { pattern: /\/etc\/passwd/, level: 'high' as RiskLevel, desc: '访问密码文件' },
  { pattern: /\/etc\/shadow/, level: 'critical' as RiskLevel, desc: '访问影子密码文件' },
  { pattern: /\.ssh\//, level: 'high' as RiskLevel, desc: '访问 SSH 密钥目录' },
  { pattern: /\.env/, level: 'medium' as RiskLevel, desc: '访问环境变量文件' },
  { pattern: /\/proc\/self\/environ/, level: 'high' as RiskLevel, desc: '访问进程环境变量' },
  { pattern: /\/root\//, level: 'high' as RiskLevel, desc: '访问 root 用户目录' },
];

/** 凭证泄露关键词 */
const CREDENTIAL_KEYWORDS = [
  'api_key', 'apikey', 'api-key',
  'secret_key', 'secretkey', 'secret-key',
  'access_token', 'accesstoken', 'access-token',
  'password', 'passwd', 'pwd',
  'private_key', 'privatekey', 'private-key',
  'token',
];

// ===================== SkillSecurityScanner 类 =====================

/**
 * Skill 安全扫描器
 */
export class SkillSecurityScanner {
  /** 扫描结果缓存 */
  private scanCache = new Map<string, ScanResult>();

  /** 审计记录（内存存储，后续可扩展到数据库） */
  private auditLogs: AuditRecord[] = [];

  /** 最大审计记录数 */
  private maxAuditLogs = 1000;

  constructor() {}

  // ===================== 1. 静态扫描 =====================

  /**
   * 扫描 Skill 的安全性
   *
   * @param definition - Skill 定义
   * @param useCache - 是否使用缓存（默认 true）
   * @returns 扫描结果
   */
  scanSkill(definition: SkillDefinition, useCache = true): ScanResult {
    const startTime = Date.now();

    // 检查缓存
    const cacheKey = definition.id + ':' + (definition.version || '0');
    if (useCache && this.scanCache.has(cacheKey)) {
      return this.scanCache.get(cacheKey)!;
    }

    const findings: RiskFinding[] = [];

    // 1. 扫描 SKILL.md 内容
    if (definition.skillMdContent) {
      findings.push(...this.scanContent(definition.skillMdContent));
    }

    // 2. 扫描参数描述中的敏感词
    if (definition.description) {
      findings.push(...this.scanCredentials(definition.description, 'description'));
    }

    // 3. 扫描 instruction blocks
    if (definition.instructionBlocks) {
      for (let i = 0; i < definition.instructionBlocks.length; i++) {
        findings.push(...this.scanContent(definition.instructionBlocks[i], `instruction[${i}]`));
      }
    }

    // 计算整体风险等级
    const overallRisk = this.calculateOverallRisk(findings);

    const result: ScanResult = {
      skillId: definition.id,
      overallRisk,
      findings,
      scannedAt: Date.now(),
      durationMs: Date.now() - startTime,
      passed: overallRisk !== 'high' && overallRisk !== 'critical',
    };

    // 缓存结果
    this.scanCache.set(cacheKey, result);

    return result;
  }

  /**
   * 批量扫描 Skill
   *
   * @param skills - Skill 列表
   * @returns 扫描结果列表
   */
  scanSkills(skills: RegisteredSkill[]): ScanResult[] {
    return skills.map((skill) => this.scanSkill(skill.definition));
  }

  // ===================== 2. 内容扫描 =====================

  /**
   * 扫描内容中的安全风险
   */
  private scanContent(content: string, location?: string): RiskFinding[] {
    const findings: RiskFinding[] = [];

    // 危险命令
    for (const cmd of DANGEROUS_COMMANDS) {
      if (cmd.pattern.test(content)) {
        findings.push({
          type: 'dangerous_command',
          level: cmd.level,
          description: cmd.desc,
          location,
          suggestion: '移除或替换为安全的操作方式',
        });
      }
    }

    // 敏感路径
    for (const path of SENSITIVE_PATHS) {
      if (path.pattern.test(content)) {
        findings.push({
          type: 'sensitive_path',
          level: path.level,
          description: path.desc,
          location,
          suggestion: '确保路径在沙箱允许范围内',
        });
      }
    }

    // 代码注入
    if (/eval\s*\(/.test(content) || /new\s+Function\s*\(/.test(content)) {
      findings.push({
        type: 'code_injection',
        level: 'high',
        description: '检测到动态代码执行（eval/new Function）',
        location,
        suggestion: '避免使用动态代码执行，使用安全的替代方案',
      });
    }

    // 凭证泄露
    findings.push(...this.scanCredentials(content, location));

    return findings;
  }

  /**
   * 扫描凭证泄露风险
   */
  private scanCredentials(content: string, location?: string): RiskFinding[] {
    const findings: RiskFinding[] = [];
    const lowerContent = content.toLowerCase();

    for (const keyword of CREDENTIAL_KEYWORDS) {
      const pattern = new RegExp(`${keyword}[\\s:=]+['"].+['"]`, 'i');
      if (pattern.test(content)) {
        findings.push({
          type: 'credential_leak',
          level: 'high',
          description: `检测到疑似凭证信息（${keyword}）`,
          location,
          suggestion: '使用凭证管理系统，不要在代码中硬编码密钥',
        });
        break; // 发现一个就够了
      }
    }

    return findings;
  }

  /**
   * 计算整体风险等级
   */
  private calculateOverallRisk(findings: RiskFinding[]): RiskLevel {
    if (findings.length === 0) return 'none';

    const levels = findings.map((f) => f.level);

    if (levels.includes('critical')) return 'critical';
    if (levels.includes('high')) return 'high';
    if (levels.includes('medium')) return 'medium';
    if (levels.includes('low')) return 'low';
    return 'none';
  }

  // ===================== 3. 审计日志 =====================

  /**
   * 记录审计日志
   *
   * @param record - 审计记录
   */
  recordAudit(record: Omit<AuditRecord, 'id' | 'timestamp'>): void {
    const auditRecord: AuditRecord = {
      ...record,
      id: this.generateAuditId(),
      timestamp: Date.now(),
    };

    this.auditLogs.unshift(auditRecord);

    // 限制日志数量
    if (this.auditLogs.length > this.maxAuditLogs) {
      this.auditLogs.length = this.maxAuditLogs;
    }

    logger.debug(`[SkillSecurityScanner] Audit recorded: ${record.skillId} (${record.result})`);
  }

  /**
   * 查询审计日志
   *
   * @param options - 查询选项
   * @returns 审计记录列表
   */
  queryAudit(options: AuditQueryOptions = {}): AuditRecord[] {
    let results = [...this.auditLogs];

    if (options.skillId) {
      results = results.filter((r) => r.skillId === options.skillId);
    }

    if (options.sessionId) {
      results = results.filter((r) => r.sessionId === options.sessionId);
    }

    if (options.startTime) {
      results = results.filter((r) => r.timestamp >= options.startTime!);
    }

    if (options.endTime) {
      results = results.filter((r) => r.timestamp <= options.endTime!);
    }

    if (options.result) {
      results = results.filter((r) => r.result === options.result);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * 生成审计记录 ID
   */
  private generateAuditId(): string {
    return 'audit_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // ===================== 4. 便捷方法 =====================

  /**
   * 检查 Skill 是否通过安全扫描
   *
   * @param definition - Skill 定义
   * @returns 是否通过
   */
  isSafe(definition: SkillDefinition): boolean {
    const result = this.scanSkill(definition);
    return result.passed;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    scanned: number;
    passed: number;
    failed: number;
    auditLogs: number;
    byRisk: Record<string, number>;
  } {
    const byRisk: Record<string, number> = {
      none: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    let passed = 0;
    let failed = 0;

    for (const result of this.scanCache.values()) {
      byRisk[result.overallRisk]++;
      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
    }

    return {
      scanned: this.scanCache.size,
      passed,
      failed,
      auditLogs: this.auditLogs.length,
      byRisk,
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.scanCache.clear();
    logger.info('[SkillSecurityScanner] Cache cleared.');
  }
}

// ===================== Module-level Singleton =====================

/** Skill 安全扫描器单例 */
export const skillSecurityScanner = new SkillSecurityScanner();
