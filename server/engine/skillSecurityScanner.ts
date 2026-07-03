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

import crypto from 'crypto';
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

/** Prompt 注入检测规则 */
const PROMPT_INJECTION_RULES = [
  { pattern: /ignore\s+(all|previous|prior)\s+(instructions?|prompts?|rules?)/i, level: 'critical' as RiskLevel, desc: 'Prompt 注入：试图忽略指令', ruleId: 'prompt-injection-ignore-instructions' },
  { pattern: /(system\s+prompt|developer\s+message|hidden\s+instructions?)\s*[:\-]/i, level: 'high' as RiskLevel, desc: 'Prompt 注入：引用系统提示', ruleId: 'prompt-injection-system' },
  { pattern: /(run|execute|call)\s+(tool|command)\s+(without|bypass|skip)\s+(permission|approval|auth)/i, level: 'critical' as RiskLevel, desc: 'Prompt 注入：绕过权限执行工具', ruleId: 'prompt-injection-tool' },
  { pattern: /curl\s+[^|]+\|\s*(bash|sh|zsh)/i, level: 'critical' as RiskLevel, desc: 'Shell 管道执行远程脚本', ruleId: 'shell-pipe-to-shell' },
  { pattern: /process\.env[\s\S]*?(fetch|http|axios|request)/i, level: 'high' as RiskLevel, desc: '环境变量外泄风险', ruleId: 'secret-exfiltration' },
  { pattern: /rm\s+-rf\s+[/~]/i, level: 'critical' as RiskLevel, desc: '破坏性删除操作', ruleId: 'destructive-delete' },
  { pattern: /chmod\s+777/i, level: 'high' as RiskLevel, desc: '不安全的权限设置', ruleId: 'unsafe-permissions' },
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

// ===================== 注释剥离工具函数 =====================

/**
 * 剥离代码中的注释
 *
 * 支持的语言：
 * - js/ts/javascript/typescript: 去掉 // 和 /* *\/ 注释
 * - python/py: 去掉 # 和 """ """ 注释
 * - shell/sh/bash/zsh: 去掉 # 注释
 *
 * 保守策略：宁可多扫不可漏扫，字符串中的注释符不做处理。
 *
 * @param code - 代码内容
 * @param lang - 语言类型（可选，默认自动检测）
 * @returns 剥离注释后的代码
 */
export function stripComments(code: string, lang?: string): string {
  if (!code) return code;

  const language = (lang || detectLanguage(code)).toLowerCase();

  switch (language) {
    case 'js':
    case 'ts':
    case 'javascript':
    case 'typescript':
    case 'jsx':
    case 'tsx':
      return stripJsComments(code);
    case 'python':
    case 'py':
      return stripPythonComments(code);
    case 'shell':
    case 'sh':
    case 'bash':
    case 'zsh':
      return stripShellComments(code);
    default:
      return code;
  }
}

/**
 * 自动检测语言（基于代码特征）
 */
function detectLanguage(code: string): string {
  const firstLines = code.slice(0, 500);

  if (/^#!\s*\/.*(bash|sh|zsh)/m.test(firstLines)) {
    return 'shell';
  }
  if (/def\s+\w+\s*\(|class\s+\w+[:\(]/.test(firstLines) &&
      !/function\s+\w+/.test(firstLines)) {
    return 'python';
  }
  if (/(const|let|var)\s+\w+\s*=|function\s+\w+|=>\s*\{/.test(firstLines)) {
    return 'javascript';
  }

  return 'text';
}

/**
 * 剥离 JS/TS 注释
 *
 * 简单实现：使用正则匹配行注释和块注释。
 * 保守策略：不处理字符串中的注释符（可能误删，但安全扫描宁可多扫）。
 */
function stripJsComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (match) => ' '.repeat(match.length))
    .replace(/(?<!:)\/\/[^\n]*/g, (match) => ' '.repeat(match.length));
}

/**
 * 剥离 Python 注释
 *
 * 去掉 # 行注释和三引号块注释。
 */
function stripPythonComments(code: string): string {
  let result = code;

  result = result.replace(/"""[\s\S]*?"""/g, (match) => {
    return ' '.repeat(match.length);
  });
  result = result.replace(/'''[\s\S]*?'''/g, (match) => {
    return ' '.repeat(match.length);
  });
  result = result.replace(/^[ \t]*#[^\n]*/gm, (match) => ' '.repeat(match.length));

  return result;
}

/**
 * 剥离 Shell 注释
 *
 * 去掉 # 行注释（保留 shebang）。
 */
function stripShellComments(code: string): string {
  const lines = code.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.startsWith('#!')) {
      result.push(line);
      continue;
    }
    const stripped = line.replace(/^[ \t]*#[^\n]*/, (match) => ' '.repeat(match.length));
    result.push(stripped);
  }

  return result.join('\n');
}

// ===================== LRU 缓存实现 =====================

/**
 * LRU 缓存（基于内容 SHA256 哈希）
 */
class ContentLRUCache {
  private cache = new Map<string, ScanResult>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): ScanResult | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: ScanResult): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ===================== 并发限制工具 =====================

/**
 * 并发限制器
 */
class ConcurrencyLimiter {
  private maxConcurrency: number;
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrency: number) {
    this.maxConcurrency = maxConcurrency;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      try {
        return await fn();
      } finally {
        this.running--;
        this.processQueue();
      }
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        this.running++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          this.processQueue();
        }
      });
    });
  }

  private processQueue(): void {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get runningCount(): number {
    return this.running;
  }
}

// ===================== SkillSecurityScanner 类 =====================

/** 内容缓存最大条目数 */
const MAX_CONTENT_CACHE_SIZE = 500;

/** 批量扫描最大并发数 */
const MAX_SCAN_CONCURRENCY = 5;

/**
 * Skill 安全扫描器
 */
export class SkillSecurityScanner {
  /** 扫描结果缓存（基于 skill id + version） */
  private scanCache = new Map<string, ScanResult>();

  /** 内容级缓存（基于内容 SHA256 哈希，LRU 淘汰） */
  private contentCache = new ContentLRUCache(MAX_CONTENT_CACHE_SIZE);

  /** 批量扫描并发限制器 */
  private concurrencyLimiter = new ConcurrencyLimiter(MAX_SCAN_CONCURRENCY);

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
   * @param options.stripComments - 是否先剥离注释再扫描（默认 true）
   * @returns 扫描结果
   */
  scanSkill(
    definition: SkillDefinition,
    useCache = true,
    options?: { stripComments?: boolean },
  ): ScanResult {
    const startTime = Date.now();
    const strip = options?.stripComments !== false;

    // 检查文件级缓存
    const fileCacheKey = definition.id + ':' + (definition.version || '0');
    if (useCache && this.scanCache.has(fileCacheKey)) {
      logger.debug(`[SkillSecurityScanner] File cache hit for ${definition.id}`);
      return this.scanCache.get(fileCacheKey)!;
    }

    // 计算内容哈希并检查内容级缓存
    const contentHash = this.hashContent(
      (definition.skillMdContent || '') +
      (definition.description || '') +
      (definition.instructionBlocks || []).join('\n'),
    );
    if (useCache && this.contentCache.has(contentHash)) {
      const cached = this.contentCache.get(contentHash)!;
      logger.debug(`[SkillSecurityScanner] Content cache hit for ${definition.id}`);
      const result: ScanResult = {
        ...cached,
        skillId: definition.id,
        scannedAt: Date.now(),
      };
      this.scanCache.set(fileCacheKey, result);
      return result;
    }

    const findings: RiskFinding[] = [];

    // 1. 扫描 SKILL.md 内容
    if (definition.skillMdContent) {
      findings.push(...this.scanContent(definition.skillMdContent, undefined, strip));
    }

    // 2. 扫描参数描述中的敏感词
    if (definition.description) {
      findings.push(...this.scanCredentials(definition.description, 'description'));
    }

    // 3. 扫描 instruction blocks
    if (definition.instructionBlocks) {
      for (let i = 0; i < definition.instructionBlocks.length; i++) {
        findings.push(...this.scanContent(
          definition.instructionBlocks[i],
          `instruction[${i}]`,
          strip,
        ));
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

    // 文件级缓存
    this.scanCache.set(fileCacheKey, result);

    // 内容级缓存
    this.contentCache.set(contentHash, result);

    return result;
  }

  /**
   * 批量扫描 Skill
   *
   * @param skills - Skill 列表
   * @returns 扫描结果列表
   */
  scanSkills(skills: RegisteredSkill[]): ScanResult[] {
    logger.debug(`[SkillSecurityScanner] Batch scanning ${skills.length} skills`);
    return skills.map((skill) => this.scanSkill(skill.definition));
  }

  /**
   * 批量扫描 Skill（异步并发版本）
   *
   * 使用并发限制（最多 5 个并发），超过的排队等待。
   * 适用于包含异步 I/O 的扫描场景。
   *
   * @param skills - Skill 列表
   * @returns 扫描结果列表
   */
  async scanSkillsAsync(skills: RegisteredSkill[]): Promise<ScanResult[]> {
    logger.debug(`[SkillSecurityScanner] Batch scanning ${skills.length} skills (max concurrency: ${MAX_SCAN_CONCURRENCY})`);

    const results = await Promise.all(
      skills.map((skill) =>
        this.concurrencyLimiter.run(() =>
          Promise.resolve(this.scanSkill(skill.definition)),
        ),
      ),
    );

    return results;
  }

  // ===================== 2. 内容扫描 =====================

  /**
   * 扫描内容中的安全风险
   *
   * @param content - 要扫描的内容
   * @param location - 位置标识
   * @param strip - 是否先剥离注释再扫描（默认 true）
   */
  private scanContent(content: string, location?: string, strip = true): RiskFinding[] {
    const findings: RiskFinding[] = [];

    // 先剥离注释再扫描（保守策略：宁可多扫不可漏扫，因此只在扫描前处理，不影响原文）
    const scanContent = strip ? stripComments(content) : content;

    // 危险命令
    for (const cmd of DANGEROUS_COMMANDS) {
      if (cmd.pattern.test(scanContent)) {
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
      if (path.pattern.test(scanContent)) {
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
    if (/eval\s*\(/.test(scanContent) || /new\s+Function\s*\(/.test(scanContent)) {
      findings.push({
        type: 'code_injection',
        level: 'high',
        description: '检测到动态代码执行（eval/new Function）',
        location,
        suggestion: '避免使用动态代码执行，使用安全的替代方案',
      });
    }

    // 凭证泄露
    findings.push(...this.scanCredentials(scanContent, location));

    // Prompt 注入检测
    for (const rule of PROMPT_INJECTION_RULES) {
      if (rule.pattern.test(scanContent)) {
        findings.push({
          type: 'code_injection',
          level: rule.level,
          description: rule.desc,
          location,
          suggestion: '移除 Prompt 注入内容',
        });
      }
    }

    // 组合模式检测
    findings.push(...this.detectCompositePatterns(scanContent, location));

    return findings;
  }

  /**
   * 检测组合风险模式
   *
   * 通过组合多个简单模式识别潜在的安全风险，
   * 例如：文件读取 + 网络发送、大 Base64 + 解码等。
   */
  private detectCompositePatterns(content: string, location?: string): RiskFinding[] {
    const findings: RiskFinding[] = [];
    const lines = content.split('\n');

    // 检测：文件读取 + 网络发送组合
    const hasFileRead = /readFile|readFileSync|fs\.read|cat\s+/.test(content);
    const hasNetworkSend = /fetch\s*\(|http\.post|axios\.post|request\s*\(/.test(content);
    if (hasFileRead && hasNetworkSend) {
      findings.push({
        type: 'credential_leak', level: 'high',
        description: '组合模式：文件读取与网络发送同时出现（潜在数据外泄）',
        location, suggestion: '检查是否存在敏感数据外泄路径',
      });
    }

    // 检测：大 base64 payload + decode
    const hasLargeBase64 = /[A-Za-z0-9+/=]{500,}/.test(content);
    const hasDecode = /atob|Buffer\.from\([^)]*,\s*['"]base64['"]\)|base64Decode/.test(content);
    if (hasLargeBase64 && hasDecode) {
      findings.push({
        type: 'code_injection', level: 'medium',
        description: '组合模式：大 Base64 负载与解码操作同时出现（潜在混淆代码）',
        location, suggestion: '检查是否存在混淆代码执行',
      });
    }

    // 检测：环境变量收集 + 网络发送
    const hasEnvHarvest = /process\.env/.test(content);
    if (hasEnvHarvest && hasNetworkSend) {
      // 检查是否在同一行窗口内
      for (let i = 0; i < lines.length - 2; i++) {
        const window = lines.slice(i, i + 3).join('\n');
        if (/process\.env/.test(window) && /(fetch|http|axios|request)\s*\(/.test(window)) {
          findings.push({
            type: 'credential_leak', level: 'high',
            description: '组合模式：环境变量收集与网络发送在相近代码区域（潜在凭证外泄）',
            location: location ? `${location}:line~${i + 1}` : `line~${i + 1}`,
            suggestion: '避免将环境变量直接发送到外部服务',
          });
          break;
        }
      }
    }

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
    contentCached: number;
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
      contentCached: this.contentCache.size,
      passed,
      failed,
      auditLogs: this.auditLogs.length,
      byRisk,
    };
  }

  /**
   * 清除缓存（包括文件级缓存和内容级缓存）
   */
  clearCache(): void {
    this.scanCache.clear();
    this.contentCache.clear();
    logger.info('[SkillSecurityScanner] Cache cleared (file + content).');
  }

  /**
   * 计算内容 SHA256 哈希
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

// ===================== Module-level Singleton =====================

/** Skill 安全扫描器单例 */
export const skillSecurityScanner = new SkillSecurityScanner();
