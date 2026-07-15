/**
 * 命令安全策略检查 — 参考 OpenClaw infra/exec-safety.ts
 *
 * 检查命令的安全风险，防止危险操作。
 */

import { logger } from '../logger.js';

export type ExecSafetyLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface ExecSafetyAnalysis {
  command: string;
  args: string[];
  safetyLevel: ExecSafetyLevel;
  risks: SafetyRisk[];
  recommendations: string[];
}

export interface SafetyRisk {
  type: 'path_traversal' | 'arbitrary_code' | 'network_access' | 'privilege_escalation' | 'data_deletion' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: string;
}

const DANGEROUS_COMMANDS = new Set([
  'rm', 'rmdir', 'del', 'erase',
  'shutdown', 'reboot', 'halt', 'poweroff',
  'sudo', 'su', 'doas',
  'chmod', 'chown', 'chgrp',
  'dd', 'mkfs', 'fdisk', 'parted',
  'rm -rf', 'rm -fr',
]);

const NETWORK_COMMANDS = new Set([
  'curl', 'wget', 'fetch', 'httpie',
  'git', 'svn', 'hg',
  'ssh', 'scp', 'rsync',
  'nc', 'netcat', 'telnet',
]);

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\.\\/g,
  /\/etc\//g,
  /\/root\//g,
  /\/home\/[^/]+/g,
];

export function analyzeExecSafety(command: string, args: string[]): ExecSafetyAnalysis {
  logger.debug(`[ExecSafety] 分析命令安全: ${command} ${args.join(' ')}`);

  const risks: SafetyRisk[] = [];
  const recommendations: string[] = [];
  const fullCommand = `${command} ${args.join(' ')}`.toLowerCase();

  checkPathTraversal(command, args, risks);
  checkDangerousCommands(command, fullCommand, risks);
  checkNetworkAccess(command, risks);
  checkPrivilegeEscalation(fullCommand, risks);
  checkDataDeletion(command, args, fullCommand, risks);

  const safetyLevel = determineSafetyLevel(risks);

  if (safetyLevel === 'high' || safetyLevel === 'critical') {
    recommendations.push('需要操作员审批');
  }
  if (risks.some((r) => r.type === 'path_traversal')) {
    recommendations.push('检查路径参数是否安全');
  }
  if (risks.some((r) => r.type === 'network_access')) {
    recommendations.push('验证目标 URL 是否在允许列表中');
  }

  return {
    command,
    args,
    safetyLevel,
    risks,
    recommendations,
  };
}

function checkPathTraversal(command: string, args: string[], risks: SafetyRisk[]): void {
  for (const arg of args) {
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(arg)) {
        risks.push({
          type: 'path_traversal',
          severity: 'high',
          description: '检测到路径遍历尝试',
          evidence: `参数: ${arg}`,
        });
        return;
      }
    }
  }
}

function checkDangerousCommands(command: string, fullCommand: string, risks: SafetyRisk[]): void {
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (fullCommand.includes(dangerous)) {
      const severity = dangerous === 'sudo' || dangerous === 'su' ? 'critical' : 'high';
      risks.push({
        type: 'arbitrary_code',
        severity,
        description: `检测到危险命令: ${dangerous}`,
        evidence: `命令: ${command}`,
      });
    }
  }
}

function checkNetworkAccess(command: string, risks: SafetyRisk[]): void {
  if (NETWORK_COMMANDS.has(command.toLowerCase())) {
    risks.push({
      type: 'network_access',
      severity: 'medium',
      description: '检测到网络访问命令',
      evidence: `命令: ${command}`,
    });
  }
}

function checkPrivilegeEscalation(fullCommand: string, risks: SafetyRisk[]): void {
  if (fullCommand.includes('sudo') || fullCommand.includes('su ') || fullCommand.includes('doas')) {
    risks.push({
      type: 'privilege_escalation',
      severity: 'critical',
      description: '检测到权限提升尝试',
      evidence: `命令: ${fullCommand}`,
    });
  }
}

function checkDataDeletion(command: string, args: string[], fullCommand: string, risks: SafetyRisk[]): void {
  if (command === 'rm' && (args.includes('-rf') || args.includes('-fr'))) {
    risks.push({
      type: 'data_deletion',
      severity: 'critical',
      description: '检测到递归删除操作',
      evidence: `命令: ${fullCommand}`,
    });
  }
}

function determineSafetyLevel(risks: SafetyRisk[]): ExecSafetyLevel {
  if (risks.length === 0) {
    return 'safe';
  }

  const criticalCount = risks.filter((r) => r.severity === 'critical').length;
  const highCount = risks.filter((r) => r.severity === 'high').length;
  const mediumCount = risks.filter((r) => r.severity === 'medium').length;

  if (criticalCount > 0) {
    return 'critical';
  }
  if (highCount > 0) {
    return 'high';
  }
  if (mediumCount > 0) {
    return 'medium';
  }
  return 'low';
}

export function isCommandSafe(command: string, args: string[]): boolean {
  const analysis = analyzeExecSafety(command, args);
  return analysis.safetyLevel === 'safe';
}

export function requiresApproval(command: string, args: string[]): boolean {
  const analysis = analyzeExecSafety(command, args);
  return analysis.safetyLevel === 'high' || analysis.safetyLevel === 'critical';
}