/**
 * Sandbox Policy
 * 沙箱策略系统 - 管理代码执行的安全隔离
 */

export type SandboxLevel = "none" | "light" | "medium" | "strict";
export type FilesystemAccess = "none" | "read_only" | "read_write" | "isolated";
export type NetworkAccess = "none" | "limited" | "full";

export interface SandboxConfig {
  level: SandboxLevel;
  filesystem: FilesystemAccess;
  network: NetworkAccess;
  allowedCommands: string[];
  blockedCommands: string[];
  allowedPaths: string[];
  blockedPaths: string[];
  timeoutMs: number;
  memoryLimitMB: number;
  cpuLimitPercent: number;
  allowSubprocess: boolean;
  allowNetwork: boolean;
  allowFilesystemWrite: boolean;
  allowEnvironmentAccess: boolean;
  maxOutputSizeBytes: number;
  enableAuditLog: boolean;
}

export interface SandboxContext {
  command: string;
  args?: string[];
  cwd?: string;
  sessionKey?: string;
  userId?: string;
  toolName?: string;
  metadata?: Record<string, unknown>;
}

export interface SandboxResult {
  allowed: boolean;
  reason: string;
  config?: SandboxConfig;
  restrictions?: string[];
  auditRequired: boolean;
  warnings: string[];
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MEMORY_LIMIT_MB = 512;
const DEFAULT_CPU_LIMIT_PERCENT = 50;
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

const LEVEL_CONFIGS: Record<SandboxLevel, Partial<SandboxConfig>> = {
  none: {
    filesystem: "read_write",
    network: "full",
    allowedCommands: ["*"],
    blockedCommands: [],
    timeoutMs: 0,
    memoryLimitMB: 0,
    cpuLimitPercent: 100,
    allowSubprocess: true,
    allowNetwork: true,
    allowFilesystemWrite: true,
    allowEnvironmentAccess: true,
    maxOutputSizeBytes: 0,
    enableAuditLog: false,
  },
  light: {
    filesystem: "read_only",
    network: "limited",
    allowedCommands: ["ls", "cat", "grep", "find", "echo", "pwd", "head", "tail", "wc"],
    blockedCommands: ["rm", "mv", "cp", "mkdir", "rmdir", "chmod", "chown", "sudo", "su"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    memoryLimitMB: DEFAULT_MEMORY_LIMIT_MB,
    cpuLimitPercent: DEFAULT_CPU_LIMIT_PERCENT,
    allowSubprocess: false,
    allowNetwork: false,
    allowFilesystemWrite: false,
    allowEnvironmentAccess: false,
    maxOutputSizeBytes: DEFAULT_MAX_OUTPUT_BYTES,
    enableAuditLog: true,
  },
  medium: {
    filesystem: "isolated",
    network: "none",
    allowedCommands: ["ls", "cat", "grep", "echo", "pwd", "node", "python3", "python"],
    blockedCommands: ["rm", "mv", "cp", "mkdir", "rmdir", "chmod", "chown", "sudo", "su", "ssh", "scp", "curl", "wget"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    memoryLimitMB: DEFAULT_MEMORY_LIMIT_MB,
    cpuLimitPercent: DEFAULT_CPU_LIMIT_PERCENT,
    allowSubprocess: false,
    allowNetwork: false,
    allowFilesystemWrite: false,
    allowEnvironmentAccess: false,
    maxOutputSizeBytes: DEFAULT_MAX_OUTPUT_BYTES,
    enableAuditLog: true,
  },
  strict: {
    filesystem: "none",
    network: "none",
    allowedCommands: ["echo"],
    blockedCommands: ["*"],
    timeoutMs: 5000,
    memoryLimitMB: 128,
    cpuLimitPercent: 20,
    allowSubprocess: false,
    allowNetwork: false,
    allowFilesystemWrite: false,
    allowEnvironmentAccess: false,
    maxOutputSizeBytes: 1024 * 1024,
    enableAuditLog: true,
  },
};

const DANGEROUS_COMMANDS = [
  "rm -rf /",
  "dd if=",
  "mkfs",
  ":(){ :|:& };:",
  "sudo",
  "su -",
  "chmod 777 /",
  "echo.*> /dev/sda",
];

class SandboxPolicyManager {
  private level: SandboxLevel;
  private customConfig: Partial<SandboxConfig> = {};
  private readonly auditLog: Array<{
    timestamp: number;
    command: string;
    allowed: boolean;
    reason: string;
    sessionKey?: string;
  }> = [];
  private maxAuditLogSize = 1000;

  constructor(level: SandboxLevel = "medium") {
    this.level = level;
  }

  setLevel(level: SandboxLevel): void {
    this.level = level;
  }

  getLevel(): SandboxLevel {
    return this.level;
  }

  setCustomConfig(config: Partial<SandboxConfig>): void {
    this.customConfig = config;
  }

  getConfig(): SandboxConfig {
    const base = LEVEL_CONFIGS[this.level];
    return {
      level: this.level,
      filesystem: base.filesystem!,
      network: base.network!,
      allowedCommands: [...(base.allowedCommands ?? [])],
      blockedCommands: [...(base.blockedCommands ?? [])],
      allowedPaths: [],
      blockedPaths: [],
      timeoutMs: base.timeoutMs!,
      memoryLimitMB: base.memoryLimitMB!,
      cpuLimitPercent: base.cpuLimitPercent!,
      allowSubprocess: base.allowSubprocess!,
      allowNetwork: base.allowNetwork!,
      allowFilesystemWrite: base.allowFilesystemWrite!,
      allowEnvironmentAccess: base.allowEnvironmentAccess!,
      maxOutputSizeBytes: base.maxOutputSizeBytes!,
      enableAuditLog: base.enableAuditLog!,
      ...this.customConfig,
    };
  }

  evaluate(context: SandboxContext): SandboxResult {
    const config = this.getConfig();
    const warnings: string[] = [];
    const restrictions: string[] = [];

    // 检查危险命令
    const commandLower = context.command.toLowerCase();
    for (const dangerous of DANGEROUS_COMMANDS) {
      if (commandLower.includes(dangerous.toLowerCase())) {
        this.logAudit(context.command, false, "Dangerous command detected", context.sessionKey);
        return {
          allowed: false,
          reason: `Dangerous command detected: ${dangerous}`,
          config,
          auditRequired: config.enableAuditLog,
          warnings: [],
        };
      }
    }

    // 检查命令是否在允许列表中
    const commandName = context.command.split(/\s+/)[0];
    const isAllowed = this.isCommandAllowed(commandName, config);
    if (!isAllowed) {
      this.logAudit(context.command, false, "Command not in allowlist", context.sessionKey);
      return {
        allowed: false,
        reason: `Command not allowed: ${commandName}`,
        config,
        restrictions: [`Blocked command: ${commandName}`],
        auditRequired: config.enableAuditLog,
        warnings: [],
      };
    }

    // 检查是否在阻止列表中
    if (this.isCommandBlocked(commandName, config)) {
      this.logAudit(context.command, false, "Command in blocklist", context.sessionKey);
      return {
        allowed: false,
        reason: `Command is blocked: ${commandName}`,
        config,
        restrictions: [`Blocked command: ${commandName}`],
        auditRequired: config.enableAuditLog,
        warnings: [],
      };
    }

    // 添加限制说明
    if (!config.allowNetwork) {
      restrictions.push("Network access disabled");
    }
    if (!config.allowFilesystemWrite) {
      restrictions.push("Filesystem write disabled");
    }
    if (config.timeoutMs > 0) {
      restrictions.push(`Timeout: ${config.timeoutMs}ms`);
    }

    // 添加警告
    if (config.filesystem === "read_only") {
      warnings.push("Filesystem is read-only");
    }
    if (config.memoryLimitMB > 0) {
      warnings.push(`Memory limit: ${config.memoryLimitMB}MB`);
    }

    this.logAudit(context.command, true, "Command allowed", context.sessionKey);

    return {
      allowed: true,
      reason: "Command passed sandbox policy checks",
      config,
      restrictions,
      auditRequired: config.enableAuditLog,
      warnings,
    };
  }

  private isCommandAllowed(commandName: string, config: SandboxConfig): boolean {
    if (config.allowedCommands.includes("*")) {
      return true;
    }
    return config.allowedCommands.some((cmd) => {
      if (cmd.endsWith("*")) {
        return commandName.startsWith(cmd.slice(0, -1));
      }
      return cmd === commandName;
    });
  }

  private isCommandBlocked(commandName: string, config: SandboxConfig): boolean {
    if (config.blockedCommands.includes("*")) {
      return true;
    }
    return config.blockedCommands.some((cmd) => {
      if (cmd.endsWith("*")) {
        return commandName.startsWith(cmd.slice(0, -1));
      }
      return cmd === commandName;
    });
  }

  private logAudit(command: string, allowed: boolean, reason: string, sessionKey?: string): void {
    if (!this.getConfig().enableAuditLog) {
      return;
    }

    this.auditLog.push({
      timestamp: Date.now(),
      command,
      allowed,
      reason,
      sessionKey,
    });

    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog.splice(0, this.auditLog.length - this.maxAuditLogSize);
    }
  }

  getAuditLog(options?: {
    limit?: number;
    allowed?: boolean;
    sessionKey?: string;
  }) {
    let logs = [...this.auditLog].reverse();

    if (options?.allowed !== undefined) {
      logs = logs.filter((l) => l.allowed === options.allowed);
    }
    if (options?.sessionKey) {
      logs = logs.filter((l) => l.sessionKey === options.sessionKey);
    }
    if (options?.limit) {
      logs = logs.slice(0, options.limit);
    }

    return logs;
  }

  clearAuditLog(): void {
    this.auditLog.length = 0;
  }

  reset(): void {
    this.level = "medium";
    this.customConfig = {};
    this.auditLog.length = 0;
  }
}

const SANDBOX_INSTANCE = new SandboxPolicyManager();

export function getSandboxPolicy(): SandboxPolicyManager {
  return SANDBOX_INSTANCE;
}

export function evaluateSandboxPolicy(context: SandboxContext): SandboxResult {
  return SANDBOX_INSTANCE.evaluate(context);
}

export function setSandboxLevel(level: SandboxLevel): void {
  SANDBOX_INSTANCE.setLevel(level);
}

export function resetSandboxPolicyForTests(): void {
  SANDBOX_INSTANCE.reset();
}

export type { SandboxPolicyManager };
