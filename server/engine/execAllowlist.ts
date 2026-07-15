/**
 * 命令白名单模式匹配 — 参考 OpenClaw infra/exec-allowlist-pattern.ts
 *
 * 定义和匹配命令执行的白名单规则。
 */

import { logger } from '../logger.js';

export interface AllowlistPattern {
  id: string;
  pattern: string;
  description?: string;
  type: 'exact' | 'glob' | 'regex';
  allowed: boolean;
}

export interface AllowlistMatchResult {
  matched: boolean;
  allowed: boolean;
  patternId?: string;
  patternDescription?: string;
}

const defaultAllowlist: AllowlistPattern[] = [
  { id: 'ls', pattern: '/usr/bin/ls', description: '列出目录内容', type: 'exact', allowed: true },
  { id: 'cat', pattern: '/usr/bin/cat', description: '查看文件内容', type: 'exact', allowed: true },
  { id: 'echo', pattern: '/usr/bin/echo', description: '输出文本', type: 'exact', allowed: true },
  { id: 'pwd', pattern: '/usr/bin/pwd', description: '显示当前目录', type: 'exact', allowed: true },
  { id: 'whoami', pattern: '/usr/bin/whoami', description: '显示当前用户', type: 'exact', allowed: true },
  { id: 'date', pattern: '/usr/bin/date', description: '显示日期时间', type: 'exact', allowed: true },
  { id: 'safe-bins', pattern: '/usr/bin/*', description: '允许所有系统安全命令', type: 'glob', allowed: true },
  { id: 'node-scripts', pattern: 'node /opt/app/*', description: '允许运行应用脚本', type: 'glob', allowed: true },
  { id: 'rm-danger', pattern: 'rm -rf /', description: '禁止递归删除根目录', type: 'exact', allowed: false },
  { id: 'sudo-all', pattern: 'sudo *', description: '禁止使用 sudo', type: 'glob', allowed: false },
];

export function matchAllowlist(command: string): AllowlistMatchResult {
  logger.debug(`[Allowlist] 匹配命令: ${command}`);

  for (const pattern of defaultAllowlist) {
    let matched = false;

    switch (pattern.type) {
      case 'exact':
        matched = command === pattern.pattern;
        break;
      case 'glob':
        matched = matchGlob(command, pattern.pattern);
        break;
      case 'regex':
        matched = new RegExp(pattern.pattern).test(command);
        break;
    }

    if (matched) {
      logger.info(`[Allowlist] 匹配模式: ${pattern.id} (${pattern.allowed ? '允许' : '拒绝'})`);
      return {
        matched: true,
        allowed: pattern.allowed,
        patternId: pattern.id,
        patternDescription: pattern.description,
      };
    }
  }

  return {
    matched: false,
    allowed: false,
  };
}

function matchGlob(str: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  return new RegExp(`^${regexPattern}$`).test(str);
}

export function isCommandAllowed(command: string): boolean {
  const result = matchAllowlist(command);
  return result.matched && result.allowed;
}

export function isCommandDenied(command: string): boolean {
  const result = matchAllowlist(command);
  return result.matched && !result.allowed;
}

export function addAllowlistPattern(pattern: AllowlistPattern): void {
  defaultAllowlist.push(pattern);
  logger.info(`[Allowlist] 添加模式: ${pattern.id}`);
}

export function removeAllowlistPattern(patternId: string): void {
  const index = defaultAllowlist.findIndex((p) => p.id === patternId);
  if (index >= 0) {
    defaultAllowlist.splice(index, 1);
    logger.info(`[Allowlist] 删除模式: ${patternId}`);
  }
}

export function getAllowlistPatterns(): AllowlistPattern[] {
  return [...defaultAllowlist];
}

export function clearAllowlist(): void {
  defaultAllowlist.length = 0;
  logger.info('[Allowlist] 清空所有模式');
}