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
  // 系统破坏命令
  "rm -rf /",
  "rm -rf /*",
  "dd if=",
  "mkfs",
  ":(){ :|:& };:",
  "echo.*> /dev/sda",
  "chmod 777 /",
  "chmod 777 /*",
  // Fork bomb
  "fork bomb",
  // 权限提升
  "sudo",
  "su -",
  "su root",
  "doas",
  // 系统配置修改
  "systemctl",
  "service",
  "initctl",
  // 网络危险操作
  "iptables",
  "ip6tables",
  "ufw disable",
  // 进程危险操作
  "killall",
  "pkill -9",
  // 敏感文件访问
  "cat /etc/shadow",
  "cat /etc/passwd",
  "vim /etc/shadow",
  // 磁盘操作
  "fdisk",
  "parted",
  "mount",
  "umount",
  // 系统重启/关机
  "reboot",
  "shutdown",
  "halt",
  "poweroff",
  // 用户管理
  "userdel",
  "useradd",
  "passwd",
  // 包管理器危险操作
  "apt-get remove",
  "yum remove",
  "dnf remove",
  "brew uninstall",
  "npm uninstall -g",
];

/** 正则表达式模式检测危险命令 */
const DANGEROUS_PATTERNS = [
  // rm -rf 递归删除
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)*(-[a-zA-Z]*f[a-zA-Z]*\s+)*\//i,
  // sudo 相关
  /\bsudo\s+/i,
  // chmod 777
  /\bchmod\s+[0-7]*777\s+/i,
  // dd 写入
  /\bdd\s+.*if=.*of=/i,
  // fork bomb
  /:\(\)\s*\{\s*:\s*\|\s*:&\s*\}\s*;/i,
  // 写入设备文件
  />\s*\/dev\/(sda|hda|nvme|sd[a-z])/i,
  // 系统服务操作
  /\b(systemctl|service|initctl)\s+(start|stop|restart|disable|enable)/i,
  // 网络防火墙修改
  /\b(iptables|ip6tables|ufw)\s+/i,
  // 强制终止进程
  /\bkillall\s+-9\b/i,
  /\bpkill\s+-9\b/i,
  // 访问敏感文件
  /\b(cat|vim|nano|less|more|head|tail)\s+\/etc\/(shadow|passwd|sudoers)/i,
  // 系统重启/关机
  /\b(reboot|shutdown|halt|poweroff)\b/i,
  // 用户管理
  /\b(useradd|userdel|passwd)\s+/i,
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

    // 检查危险命令（字符串匹配）
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

    // 检查危险命令（正则表达式匹配）
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(context.command)) {
        this.logAudit(context.command, false, "Dangerous command pattern detected", context.sessionKey);
        return {
          allowed: false,
          reason: `Dangerous command pattern detected: ${pattern.source}`,
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

    // 检查工作目录限制
    if (context.cwd) {
      const cwdAllowed = this.isPathAllowed(context.cwd, config);
      if (!cwdAllowed) {
        this.logAudit(context.command, false, "Working directory not allowed", context.sessionKey);
        return {
          allowed: false,
          reason: `Working directory not allowed: ${context.cwd}`,
          config,
          restrictions: [`Blocked path: ${context.cwd}`],
          auditRequired: config.enableAuditLog,
          warnings: [],
        };
      }
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

  /**
   * 检查路径是否被允许
   * @param cwd - 工作目录路径
   * @param config - 沙箱配置
   * @returns 是否允许
   */
  private isPathAllowed(cwd: string, config: SandboxConfig): boolean {
    // 如果没有配置允许路径，则默认允许所有路径
    if (config.allowedPaths.length === 0 && config.blockedPaths.length === 0) {
      return true;
    }

    // 检查是否在阻止路径中
    for (const blockedPath of config.blockedPaths) {
      if (cwd.startsWith(blockedPath) || cwd.includes(blockedPath)) {
        return false;
      }
    }

    // 检查是否在允许路径中（如果配置了允许路径列表）
    if (config.allowedPaths.length > 0) {
      for (const allowedPath of config.allowedPaths) {
        if (cwd.startsWith(allowedPath) || allowedPath === '*') {
          return true;
        }
      }
      return false;
    }

    return true;
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
