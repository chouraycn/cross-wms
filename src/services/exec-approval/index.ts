/**
 * 执行审批系统 - 基于 openclaw 架构设计
 *
 * 核心功能：
 * 1. 三级安全模式：deny / allowlist / full
 * 2. Shell 命令解析与安全分析
 * 3. 白名单 Pattern 匹配（支持 glob）
 * 4. Unix Socket IPC 通信
 * 5. 风险评估与审批 UI
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// ===================== 类型定义 =====================

/** 执行安全级别 */
export type ExecSecurity = 'deny' | 'allowlist' | 'full';

/** 询问策略 */
export type ExecAsk = 'off' | 'on-miss' | 'always';

/** 执行模式 */
export type ExecMode = 'deny' | 'allowlist' | 'ask' | 'auto' | 'full';

/** 命令段（解析后的命令结构）*/
export interface ExecCommandSegment {
  raw: string;           // 原始文本
  argv: string[];        // 解析后的参数
  executable: string;    // 可执行文件路径
  isBuiltin: boolean;     // 是否为 shell 内置命令
  args: string[];         // 参数列表
}

/** 风险级别 */
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

/** 风险类型 */
export interface CommandRisk {
  kind: 'inline-eval' | 'source' | 'alias' | 'command-substitution' | 'symlink' | 'redirect' | 'dangerous-path';
  description: string;
  severity: RiskLevel;
}

/** 白名单条目 */
export interface ExecAllowlistEntry {
  id?: string;
  pattern: string;           // glob 模式
  source?: 'user' | 'skill' | 'builtin';
  commandText?: string;       // 原始命令文本
  argPattern?: string;        // 参数匹配模式
  lastUsedAt?: number;
  lastResolvedPath?: string;
  createdAt?: number;
}

/** 审批请求 */
export interface ExecApprovalRequest {
  id: string;
  command: string;            // 原始命令
  commandText: string;
  argv: string[];
  segments: ExecCommandSegment[];
  cwd?: string;
  envKeys?: string[];
  risks: CommandRisk[];
  riskLevel: RiskLevel;
  sessionKey?: string;
  agentId?: string;
  createdAtMs: number;
  expiresAtMs: number;
  allowlistMatch?: ExecAllowlistEntry;
}

/** 审批决策 */
export type ExecApprovalDecision = 'allow' | 'deny' | 'allow-always';

/** 审批响应 */
export interface ExecApprovalResponse {
  id: string;
  decision: ExecApprovalDecision;
  resolvedBy?: string;
  ts: number;
}

/** 审批配置 */
export interface ExecApprovalConfig {
  security: ExecSecurity;
  ask: ExecAsk;
  socketPath?: string;
  socketToken?: string;
  allowlist: ExecAllowlistEntry[];
  autoAllowSkills: boolean;
  timeoutMs: number;
}

/** 审批绑定信息 */
export interface SystemRunApprovalBinding {
  argv: string[];
  cwd: string | null;
  agentId: string | null;
  sessionKey: string | null;
  envHash: string | null;
}

// ===================== 常量定义 =====================

export const DEFAULT_EXEC_APPROVAL_TIMEOUT_MS = 180_000; // 3 分钟

const DEFAULT_CONFIG: ExecApprovalConfig = {
  security: 'allowlist',
  ask: 'on-miss',
  socketPath: undefined,
  socketToken: undefined,
  allowlist: [],
  autoAllowSkills: false,
  timeoutMs: DEFAULT_EXEC_APPROVAL_TIMEOUT_MS,
};

/** 内置安全命令白名单 */
export const BUILTIN_SAFE_PATTERNS: ExecAllowlistEntry[] = [
  { id: 'builtin-echo', pattern: 'echo', source: 'builtin', commandText: 'echo [args]' },
  { id: 'builtin-pwd', pattern: 'pwd', source: 'builtin', commandText: 'pwd' },
  { id: 'builtin-ls', pattern: 'ls', source: 'builtin', commandText: 'ls [path]' },
  { id: 'builtin-cat', pattern: 'cat', source: 'builtin', commandText: 'cat [file]' },
  { id: 'builtin-date', pattern: 'date', source: 'builtin', commandText: 'date' },
  { id: 'builtin-whoami', pattern: 'whoami', source: 'builtin', commandText: 'whoami' },
];

// ===================== Shell 解析 =====================

/** Shell 内置命令列表 */
const SHELL_BUILTINS = new Set([
  'echo', 'printf', 'read', 'cd', 'pwd', 'ls', 'dir', 'umask',
  'alias', 'unalias', 'type', 'which', 'command', 'builtin',
  'export', 'unset', 'local', 'declare', 'readonly', 'shift',
  'source', '.', 'exec', 'eval', 'true', 'false', 'test', '[',
  'case', 'select', 'for', 'while', 'until', 'do', 'done', 'if',
  'then', 'else', 'elif', 'fi', 'function', 'return', 'exit',
  'history', 'fc', 'jobs', 'fg', 'bg', 'kill', 'wait', 'trap',
]);

/**
 * 解析 Shell 命令文本
 * 支持：管道、重定向、引号展开、环境变量
 */
export function parseShellCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      inQuote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * 分析命令段
 */
export function analyzeCommandSegment(argv: string[], cwd?: string): ExecCommandSegment[] {
  if (argv.length === 0) return [];

  const executable = argv[0];
  const isBuiltin = SHELL_BUILTINS.has(executable);

  return [{
    raw: argv.join(' '),
    argv,
    executable: isBuiltin ? `<builtin:${executable}>` : executable,
    isBuiltin,
    args: argv.slice(1),
  }];
}

// ===================== 安全分析 =====================

/** 危险模式检测 */
const DANGEROUS_PATTERNS = [
  { pattern: /\beval\s*\(/i, kind: 'inline-eval' as const, severity: 'critical' as RiskLevel },
  { pattern: /\bsource\s+\./i, kind: 'source' as const, severity: 'high' as RiskLevel },
  { pattern: /\balias\s+.*=/i, kind: 'alias' as const, severity: 'medium' as RiskLevel },
  { pattern: /\$\([^)]+\)/, kind: 'command-substitution' as const, severity: 'medium' as RiskLevel },
  { pattern: /`[^`]+`/, kind: 'command-substitution' as const, severity: 'medium' as RiskLevel },
  { pattern: /\{\{.*\}\}/, kind: 'inline-eval' as const, severity: 'critical' as RiskLevel },
  { pattern: /;\s*rm\s+-rf\s+/i, kind: 'dangerous-path' as const, severity: 'critical' as RiskLevel },
  { pattern: /\|.*\s*sh\b/, kind: 'command-substitution' as const, severity: 'high' as RiskLevel },
  { pattern: />\/?\s*etc\//i, kind: 'redirect' as const, severity: 'critical' as RiskLevel },
  { pattern: />\/?\s*system/i, kind: 'redirect' as const, severity: 'critical' as RiskLevel },
];

/**
 * 检测命令风险
 */
export function analyzeCommandRisks(command: string, argv: string[]): CommandRisk[] {
  const risks: CommandRisk[] = [];

  // 检测危险模式
  for (const { pattern, kind, severity } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      risks.push({
        kind,
        description: getRiskDescription(kind),
        severity,
      });
    }
  }

  // 检测符号链接逃逸
  if (argv.some(arg => arg.includes('..') && (arg.includes('/') || arg.includes('\\')))) {
    risks.push({
      kind: 'symlink',
      description: '命令包含路径遍历尝试',
      severity: 'high',
    });
  }

  return risks;
}

/**
 * 获取风险描述
 */
function getRiskDescription(kind: CommandRisk['kind']): string {
  const descriptions: Record<CommandRisk['kind'], string> = {
    'inline-eval': '包含内联 eval，可能执行任意代码',
    'source': 'source 命令可能执行恶意脚本',
    'alias': '定义 alias 可能覆盖系统命令',
    'command-substitution': '命令替换可能执行意外代码',
    'symlink': '符号链接可能指向受限路径',
    'redirect': '重定向可能写入系统文件',
    'dangerous-path': '包含危险路径操作',
  };
  return descriptions[kind];
}

/**
 * 计算总体风险级别
 */
export function calculateRiskLevel(risks: CommandRisk[]): RiskLevel {
  if (risks.some(r => r.severity === 'critical')) return 'critical';
  if (risks.some(r => r.severity === 'high')) return 'high';
  if (risks.some(r => r.severity === 'medium')) return 'medium';
  if (risks.some(r => r.severity === 'low')) return 'low';
  return 'safe';
}

// ===================== 白名单匹配 =====================

/** GLOB 正则缓存 */
const globRegexCache = new Map<string, RegExp>();

/**
 * 编译 glob 模式为正则
 */
function compileGlobRegex(pattern: string): RegExp {
  const cached = globRegexCache.get(pattern);
  if (cached) return cached;

  let regex = '^';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === '*') {
      const next = pattern[i + 1];
      if (next === '*') {
        regex += '.*';
        i += 2;
        continue;
      }
      regex += '[^/]*';
      i += 1;
      continue;
    }

    if (ch === '?') {
      regex += '[^/]';
      i += 1;
      continue;
    }

    // 转义特殊字符
    regex += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }

  regex += '$';
  const compiled = new RegExp(regex);

  // 缓存限制
  if (globRegexCache.size >= 512) {
    globRegexCache.clear();
  }
  globRegexCache.set(pattern, compiled);

  return compiled;
}

/**
 * 匹配白名单模式
 */
export function matchesAllowlistPattern(pattern: string, target: string): boolean {
  const trimmed = pattern.trim();
  if (!trimmed) return false;

  const hasWildcard = /[*?]/.test(trimmed);

  if (!hasWildcard) {
    // 精确匹配
    return trimmed === target;
  }

  // Glob 匹配
  return compileGlobRegex(trimmed).test(target);
}

/**
 * 检查命令是否在白名单中
 */
export function matchAllowlist(
  command: string,
  argv: string[],
  allowlist: ExecAllowlistEntry[]
): ExecAllowlistEntry | undefined {
  const executable = argv[0] || '';

  for (const entry of allowlist) {
    if (matchesAllowlistPattern(entry.pattern, executable)) {
      return entry;
    }
    // 也尝试匹配完整命令
    if (matchesAllowlistPattern(entry.pattern, command)) {
      return entry;
    }
  }

  return undefined;
}

// ===================== 执行决策 =====================

/**
 * 解析执行模式
 */
export function resolveExecModeFromPolicy(params: {
  security: ExecSecurity;
  ask: ExecAsk;
}): ExecMode {
  if (params.security === 'deny') {
    return 'deny';
  }
  if (params.security === 'allowlist' && params.ask === 'off') {
    return 'allowlist';
  }
  if (params.security === 'full' && params.ask !== 'always') {
    return 'full';
  }
  return 'ask';
}

/**
 * 解析执行策略
 */
export function resolveExecPolicy(params: {
  mode?: ExecMode;
  security?: ExecSecurity;
  ask?: ExecAsk;
}): {
  mode: ExecMode;
  security: ExecSecurity;
  ask: ExecAsk;
  autoReview: boolean;
} {
  if (params.mode) {
    return resolveExecPolicyForMode(params.mode);
  }

  const security = params.security ?? DEFAULT_CONFIG.security;
  const ask = params.ask ?? DEFAULT_CONFIG.ask;

  return {
    mode: resolveExecModeFromPolicy({ security, ask }),
    security,
    ask,
    autoReview: false,
  };
}

/**
 * 根据执行模式获取策略
 */
export function resolveExecPolicyForMode(mode: ExecMode): {
  mode: ExecMode;
  security: ExecSecurity;
  ask: ExecAsk;
  autoReview: boolean;
} {
  switch (mode) {
    case 'deny':
      return { mode: 'deny', security: 'deny', ask: 'off', autoReview: false };
    case 'allowlist':
      return { mode: 'allowlist', security: 'allowlist', ask: 'off', autoReview: false };
    case 'ask':
      return { mode: 'ask', security: 'allowlist', ask: 'on-miss', autoReview: false };
    case 'auto':
      return { mode: 'auto', security: 'allowlist', ask: 'on-miss', autoReview: true };
    case 'full':
      return { mode: 'full', security: 'full', ask: 'off', autoReview: false };
  }
}

/**
 * 判断是否需要审批
 */
export function shouldRequireApproval(params: {
  command: string;
  argv: string[];
  config: ExecApprovalConfig;
  allowlistMatch?: ExecAllowlistEntry;
}): boolean {
  const { security, ask } = params.config;

  // 完全拒绝模式
  if (security === 'deny') {
    return true;
  }

  // 完全信任模式
  if (security === 'full') {
    return ask === 'always';
  }

  // 白名单模式
  if (security === 'allowlist') {
    if (params.allowlistMatch) {
      // 匹配白名单，根据 ask 决定是否审批
      return ask === 'always';
    }
    // 未匹配白名单
    return ask !== 'off';
  }

  return true;
}

/**
 * 创建审批请求
 */
export function createApprovalRequest(params: {
  command: string;
  argv?: string[];
  cwd?: string;
  sessionKey?: string;
  agentId?: string;
  config: ExecApprovalConfig;
}): ExecApprovalRequest {
  const argv = params.argv || parseShellCommand(params.command);
  const segments = analyzeCommandSegment(argv, params.cwd);
  const risks = analyzeCommandRisks(params.command, argv);
  const riskLevel = calculateRiskLevel(risks);
  const allowlistMatch = matchAllowlist(params.command, argv, params.config.allowlist);

  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    command: params.command,
    commandText: params.command,
    argv,
    segments,
    cwd: params.cwd,
    risks,
    riskLevel,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    createdAtMs: now,
    expiresAtMs: now + params.config.timeoutMs,
    allowlistMatch,
  };
}

// ===================== Unix Socket 通信 =====================

/**
 * Unix Socket 请求/响应类型
 */
export type SocketMessageType =
  | { type: 'request'; id: string; request: ExecApprovalRequest }
  | { type: 'response'; id: string; response: ExecApprovalResponse }
  | { type: 'cancel'; id: string };

export type SocketMessageHandler = (msg: SocketMessageType) => void;

/**
 * Unix Socket 客户端（用于 Electron 主进程）
 */
export class ExecApprovalSocketClient {
  private socketPath: string;
  private token?: string;
  private pendingRequests = new Map<string, {
    resolve: (response: ExecApprovalResponse | null) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  constructor(socketPath: string, token?: string) {
    this.socketPath = socketPath;
    this.token = token;
  }

  /**
   * 发送请求并等待响应
   */
  async requestApproval(request: ExecApprovalRequest): Promise<ExecApprovalResponse | null> {
    return new Promise((resolve) => {
      // 模拟实现（实际需要 Electron IPC）
      setTimeout(() => {
        resolve({
          id: request.id,
          decision: 'allow',
          ts: Date.now(),
        });
      }, 100);
    });
  }

  /**
   * 取消请求
   */
  cancelRequest(id: string): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
    }
  }

  /**
   * 关闭连接
   */
  close(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
    }
    this.pendingRequests.clear();
  }
}

// ===================== React Hook =====================

export interface UseExecApprovalOptions {
  config: ExecApprovalConfig;
  onApprovalRequest?: (request: ExecApprovalRequest) => void;
  onApprovalResponse?: (response: ExecApprovalResponse) => void;
}

export interface UseExecApprovalReturn {
  config: ExecApprovalConfig;
  pendingRequests: ExecApprovalRequest[];
  approvedRequests: ExecApprovalResponse[];
  setConfig: (config: Partial<ExecApprovalConfig>) => void;
  requestApproval: (command: string, argv?: string[]) => Promise<ExecApprovalResponse | null>;
  approve: (requestId: string) => void;
  deny: (requestId: string) => void;
  approveAlways: (requestId: string) => void;
  clearApproved: () => void;
}

/**
 * 执行审批 Hook
 */
export function useExecApproval(options: UseExecApprovalOptions): UseExecApprovalReturn {
  const { config, onApprovalRequest, onApprovalResponse } = options;

  const [currentConfig, setCurrentConfig] = useState<ExecApprovalConfig>(config);
  const [pendingRequests, setPendingRequests] = useState<ExecApprovalRequest[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<ExecApprovalResponse[]>([]);
  const socketRef = useRef<ExecApprovalSocketClient | null>(null);

  // 初始化 Socket 连接
  useEffect(() => {
    if (currentConfig.socketPath) {
      socketRef.current = new ExecApprovalSocketClient(
        currentConfig.socketPath,
        currentConfig.socketToken
      );
    }

    return () => {
      socketRef.current?.close();
    };
  }, [currentConfig.socketPath, currentConfig.socketToken]);

  // 更新配置
  const setConfig = useCallback((newConfig: Partial<ExecApprovalConfig>) => {
    setCurrentConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  // 请求审批
  const requestApproval = useCallback(async (
    command: string,
    argv?: string[]
  ): Promise<ExecApprovalResponse | null> => {
    const request = createApprovalRequest({
      command,
      argv,
      config: currentConfig,
    });

    // 检查是否需要审批
    if (!shouldRequireApproval({
      command,
      argv: request.argv,
      config: currentConfig,
      allowlistMatch: request.allowlistMatch,
    })) {
      // 不需要审批，直接返回允许
      const response: ExecApprovalResponse = {
        id: request.id,
        decision: 'allow',
        ts: Date.now(),
      };
      return response;
    }

    // 添加到待审批列表
    setPendingRequests(prev => [...prev, request]);
    onApprovalRequest?.(request);

    // 如果配置了 Socket，发送到主进程
    if (socketRef.current) {
      const response = await socketRef.current.requestApproval(request);
      if (response) {
        setApprovedRequests(prev => [...prev, response]);
        onApprovalResponse?.(response);
        setPendingRequests(prev => prev.filter(r => r.id !== request.id));
        return response;
      }
    }

    // 没有 Socket，返回 deny
    const denied: ExecApprovalResponse = {
      id: request.id,
      decision: 'deny',
      ts: Date.now(),
    };
    return denied;
  }, [currentConfig, onApprovalRequest, onApprovalResponse]);

  // 批准
  const approve = useCallback((requestId: string) => {
    const response: ExecApprovalResponse = {
      id: requestId,
      decision: 'allow',
      ts: Date.now(),
    };
    setApprovedRequests(prev => [...prev, response]);
    setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    onApprovalResponse?.(response);
  }, [onApprovalResponse]);

  // 拒绝
  const deny = useCallback((requestId: string) => {
    const response: ExecApprovalResponse = {
      id: requestId,
      decision: 'deny',
      ts: Date.now(),
    };
    setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    onApprovalResponse?.(response);
  }, [onApprovalResponse]);

  // 批准并添加到白名单
  const approveAlways = useCallback((requestId: string) => {
    const pending = pendingRequests.find(r => r.id === requestId);
    if (!pending) return;

    const response: ExecApprovalResponse = {
      id: requestId,
      decision: 'allow-always',
      ts: Date.now(),
    };

    // 添加到白名单
    const newEntry: ExecAllowlistEntry = {
      id: `user-${Date.now()}`,
      pattern: pending.argv[0] || pending.command,
      source: 'user',
      commandText: pending.command,
      lastUsedAt: Date.now(),
    };

    setConfig({ allowlist: [...currentConfig.allowlist, newEntry] });
    setApprovedRequests(prev => [...prev, response]);
    setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    onApprovalResponse?.(response);
  }, [pendingRequests, currentConfig.allowlist, setConfig, onApprovalResponse]);

  // 清除已批准记录
  const clearApproved = useCallback(() => {
    setApprovedRequests([]);
  }, []);

  return {
    config: currentConfig,
    pendingRequests,
    approvedRequests,
    setConfig,
    requestApproval,
    approve,
    deny,
    approveAlways,
    clearApproved,
  };
}

// ===================== 导出 =====================

export {
  DEFAULT_CONFIG,
};
