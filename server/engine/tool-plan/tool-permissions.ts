import { randomUUID } from 'node:crypto';
import type { ToolOwnerRef } from './types.js';

export type PermissionLevel = 'public' | 'elevated' | 'restricted' | 'dangerous';

export interface PermissionRule {
  readonly toolName?: string;
  readonly toolOwner?: ToolOwnerRef['kind'];
  readonly category?: string;
  readonly requiredLevel: PermissionLevel;
  readonly action: 'allow' | 'deny' | 'ask';
}

export interface PermissionConfig {
  readonly defaultLevel: PermissionLevel;
  readonly rules: PermissionRule[];
  readonly requireApproval: boolean;
  readonly approvalCallback?: (request: ApprovalRequest) => Promise<boolean>;
}

export interface ApprovalRequest {
  readonly toolName: string;
  readonly toolOwner: ToolOwnerRef['kind'];
  readonly args?: unknown;
  readonly requiredLevel: PermissionLevel;
  readonly reason: string;
}

export interface AuditRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly toolName: string;
  readonly action: 'allow' | 'deny' | 'ask' | 'approved' | 'rejected';
  readonly requiredLevel: PermissionLevel;
  readonly args?: unknown;
  readonly result?: 'success' | 'failure';
  readonly durationMs?: number;
  readonly sessionId?: string;
  readonly reason?: string;
}

export interface PermissionResult {
  readonly allowed: boolean;
  readonly level: PermissionLevel;
  readonly action: 'allow' | 'deny' | 'ask';
  readonly reason: string;
}

export interface AuditQueryOptions {
  readonly toolName?: string;
  readonly action?: AuditRecord['action'];
  readonly startTime?: number;
  readonly endTime?: number;
  readonly limit?: number;
}

const LEVEL_WEIGHT: Record<PermissionLevel, number> = {
  public: 0,
  elevated: 1,
  restricted: 2,
  dangerous: 3,
};

const DEFAULT_CONFIG: PermissionConfig = {
  defaultLevel: 'public',
  rules: [],
  requireApproval: false,
};

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*').replace(/\?/gu, '.');
  return new RegExp(`^${escaped}$`, 'u');
}

export class ToolPermissionManager {
  private config: PermissionConfig;
  private auditLog: AuditRecord[] = [];
  private readonly maxLogSize = 10000;
  private totalChecks = 0;
  private allowedCount = 0;
  private deniedCount = 0;
  private pendingApprovalCount = 0;

  constructor(config?: Partial<PermissionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config, rules: config?.rules ? [...config.rules] : [] };
  }

  async checkPermission(
    toolName: string,
    toolOwner: ToolOwnerRef['kind'],
    args?: unknown,
  ): Promise<PermissionResult> {
    this.totalChecks++;
    const level = this.getToolPermissionLevel(toolName, toolOwner);
    const rule = this.findMatchingRule(toolName, toolOwner);

    if (rule?.action === 'deny') {
      this.deniedCount++;
      this.recordAudit({
        toolName,
        action: 'deny',
        requiredLevel: level,
        args,
        reason: '规则拒绝',
      });
      return { allowed: false, level, action: 'deny', reason: '规则匹配 deny' };
    }

    if (rule?.action === 'allow') {
      this.allowedCount++;
      this.recordAudit({
        toolName,
        action: 'allow',
        requiredLevel: level,
        args,
        reason: '规则允许',
      });
      return { allowed: true, level, action: 'allow', reason: '规则匹配 allow' };
    }

    const needsApproval = rule?.action === 'ask' || (LEVEL_WEIGHT[level] >= LEVEL_WEIGHT.dangerous && this.config.requireApproval);
    if (!needsApproval) {
      this.allowedCount++;
      this.recordAudit({
        toolName,
        action: 'allow',
        requiredLevel: level,
        args,
        reason: '无需审批',
      });
      return { allowed: true, level, action: 'allow', reason: '无需审批' };
    }

    if (!this.config.requireApproval || !this.config.approvalCallback) {
      this.deniedCount++;
      this.pendingApprovalCount++;
      this.recordAudit({
        toolName,
        action: 'ask',
        requiredLevel: level,
        args,
        reason: '需要审批但未配置审批回调',
      });
      return { allowed: false, level, action: 'ask', reason: '需要审批但未配置审批回调' };
    }

    const request: ApprovalRequest = {
      toolName,
      toolOwner,
      args,
      requiredLevel: level,
      reason: rule?.action === 'ask' ? '规则要求审批' : '权限级别需要审批',
    };
    const approved = await this.config.approvalCallback(request);
    if (approved) {
      this.allowedCount++;
      this.recordAudit({
        toolName,
        action: 'approved',
        requiredLevel: level,
        args,
        reason: '审批通过',
      });
      return { allowed: true, level, action: 'allow', reason: '审批通过' };
    }
    this.deniedCount++;
    this.recordAudit({
      toolName,
      action: 'rejected',
      requiredLevel: level,
      args,
      reason: '审批被拒绝',
    });
    return { allowed: false, level, action: 'deny', reason: '审批被拒绝' };
  }

  getToolPermissionLevel(toolName: string, toolOwner?: ToolOwnerRef['kind']): PermissionLevel {
    const rule = this.findMatchingRule(toolName, toolOwner);
    if (rule) {
      return rule.requiredLevel;
    }
    return this.config.defaultLevel;
  }

  addRule(rule: PermissionRule): void {
    this.config = { ...this.config, rules: [...this.config.rules, rule] };
  }

  removeRule(index: number): void {
    if (index < 0 || index >= this.config.rules.length) {
      return;
    }
    const rules = [...this.config.rules];
    rules.splice(index, 1);
    this.config = { ...this.config, rules };
  }

  recordAudit(record: Omit<AuditRecord, 'id' | 'timestamp'>): void {
    const entry: AuditRecord = {
      ...record,
      id: randomUUID(),
      timestamp: Date.now(),
    };
    this.auditLog.push(entry);
    if (this.auditLog.length > this.maxLogSize) {
      this.auditLog = this.auditLog.slice(-this.maxLogSize);
    }
  }

  queryAudit(options: AuditQueryOptions): AuditRecord[] {
    let results = [...this.auditLog];
    if (options.toolName !== undefined) {
      results = results.filter((entry) => entry.toolName === options.toolName);
    }
    if (options.action !== undefined) {
      results = results.filter((entry) => entry.action === options.action);
    }
    if (options.startTime !== undefined) {
      results = results.filter((entry) => entry.timestamp >= options.startTime!);
    }
    if (options.endTime !== undefined) {
      results = results.filter((entry) => entry.timestamp <= options.endTime!);
    }
    results.sort((a, b) => b.timestamp - a.timestamp);
    if (options.limit !== undefined && options.limit > 0) {
      results = results.slice(0, options.limit);
    }
    return results;
  }

  exportAuditLog(format?: 'json' | 'csv'): string {
    if (format === 'csv') {
      const header = 'id,timestamp,toolName,action,requiredLevel,result,sessionId';
      const rows = this.auditLog.map((entry) =>
        [
          entry.id,
          entry.timestamp,
          entry.toolName,
          entry.action,
          entry.requiredLevel,
          entry.result ?? '',
          entry.sessionId ?? '',
        ]
          .map((value) => String(value))
          .join(','),
      );
      return [header, ...rows].join('\n');
    }
    return JSON.stringify(this.auditLog, null, 2);
  }

  updateConfig(config: Partial<PermissionConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      rules: config.rules ? [...config.rules] : this.config.rules,
    };
  }

  getStats(): { totalChecks: number; allowed: number; denied: number; pendingApproval: number } {
    return {
      totalChecks: this.totalChecks,
      allowed: this.allowedCount,
      denied: this.deniedCount,
      pendingApproval: this.pendingApprovalCount,
    };
  }

  private findMatchingRule(
    toolName: string,
    toolOwner?: ToolOwnerRef['kind'],
  ): PermissionRule | undefined {
    return this.config.rules.find((rule) => {
      if (rule.toolName !== undefined && !wildcardToRegExp(rule.toolName).test(toolName)) {
        return false;
      }
      if (rule.toolOwner !== undefined && toolOwner !== undefined && rule.toolOwner !== toolOwner) {
        return false;
      }
      if (rule.toolOwner !== undefined && toolOwner === undefined) {
        return false;
      }
      return true;
    });
  }
}
