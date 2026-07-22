/**
 * 技能安装策略系统
 *
 * 参考 OpenClaw 的 security.installPolicy 配置：
 * - command: 策略检查命令路径
 * - timeout: 超时时间
 * - failClosed: 无法返回决策时是否拒绝
 *
 * 安装前执行策略命令检查，支持 ClawHub/Git/本地/归档等所有安装源。
 */

import { spawn, ChildProcess } from "child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger("install-policy");

// ============================================================================
// 类型定义
// ============================================================================

/** 安装策略配置 */
export interface InstallPolicy {
  /** 策略检查命令路径 */
  command: string;
  /** 超时时间（毫秒），默认 30000 */
  timeout?: number;
  /** 无法返回决策时是否拒绝，默认 true */
  failClosed?: boolean;
  /** 命令参数模板 */
  argsTemplate?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
}

/** 策略检查输入 */
export interface PolicyCheckInput {
  /** 安装源类型 */
  source: "clawhub" | "git" | "local" | "archive" | "url";
  /** 技能名称或 slug */
  skillName: string;
  /** 版本（可选） */
  version?: string;
  /** 来源 URL 或路径 */
  sourceUrl?: string;
  /** 安装目标路径 */
  targetPath: string;
  /** 额外参数 */
  extra?: Record<string, unknown>;
}

/** 策略检查结果 */
export interface PolicyCheckResult {
  /** 是否允许安装 */
  allowed: boolean;
  /** 决策来源 */
  decisionSource: "policy" | "default" | "error";
  /** 原因列表 */
  reasons: string[];
  /** 警告列表 */
  warnings: string[];
  /** 错误信息（如果有） */
  error?: string;
  /** 执行时间（毫秒） */
  durationMs: number;
  /** 策略命令输出 */
  stdout?: string;
  /** 策略命令错误输出 */
  stderr?: string;
}

/** 安全配置 */
export interface SecurityConfig {
  /** 安装策略 */
  installPolicy?: InstallPolicy;
  /** 允许的安装源 */
  allowedSources?: Array<"clawhub" | "git" | "local" | "archive" | "url">;
  /** 是否要求签名验证 */
  requireSignature?: boolean;
  /** 是否允许自签名 */
  allowSelfSigned?: boolean;
  /** 允许的注册表 */
  allowedRegistries?: string[];
}

// ============================================================================
// 安装策略管理器
// ============================================================================

/** 安装策略管理器 */
export class InstallPolicyManager {
  private policy: InstallPolicy | null = null;
  private securityConfig: SecurityConfig;
  private defaultTimeout: number = 30000;
  private defaultFailClosed: boolean = true;

  constructor(config?: SecurityConfig) {
    this.securityConfig = config || {};
    this.policy = this.securityConfig.installPolicy || null;
  }

  /** 更新策略配置 */
  updatePolicy(policy: InstallPolicy): void {
    this.policy = policy;
    this.securityConfig.installPolicy = policy;
    logger.info(`[InstallPolicy] Policy updated: ${policy.command}`);
  }

  /** 更新安全配置 */
  updateSecurityConfig(config: Partial<SecurityConfig>): void {
    this.securityConfig = { ...this.securityConfig, ...config };
    if (config.installPolicy) {
      this.policy = config.installPolicy;
    }
  }

  /** 执行策略检查 */
  async checkPolicy(input: PolicyCheckInput): Promise<PolicyCheckResult> {
    const startTime = Date.now();

    // 检查源类型是否允许
    if (this.securityConfig.allowedSources) {
      if (!this.securityConfig.allowedSources.includes(input.source)) {
        return {
          allowed: false,
          decisionSource: "default",
          reasons: [`Source type "${input.source}" is not allowed`],
          warnings: [],
          durationMs: Date.now() - startTime,
        };
      }
    }

    // 检查注册表是否允许（ClawHub 源）
    if (input.source === "clawhub" && this.securityConfig.allowedRegistries) {
      const registry = this.extractRegistry(input.sourceUrl);
      if (registry && !this.securityConfig.allowedRegistries.includes(registry)) {
        return {
          allowed: false,
          decisionSource: "default",
          reasons: [`Registry "${registry}" is not allowed`],
          warnings: [],
          durationMs: Date.now() - startTime,
        };
      }
    }

    // 如果没有配置策略命令，使用默认规则
    if (!this.policy || !this.policy.command) {
      return this.defaultPolicyCheck(input, startTime);
    }

    // 执行策略命令
    return this.executePolicyCommand(input, startTime);
  }

  /** 默认策略检查（无策略命令时） */
  private defaultPolicyCheck(
    input: PolicyCheckInput,
    startTime: number
  ): PolicyCheckResult {
    const reasons: string[] = [];
    const warnings: string[] = [];

    // 本地源始终允许
    if (input.source === "local") {
      reasons.push("Local source is allowed by default");
      return {
        allowed: true,
        decisionSource: "default",
        reasons,
        warnings,
        durationMs: Date.now() - startTime,
      };
    }

    // ClawHub 源检查
    if (input.source === "clawhub") {
      reasons.push("ClawHub source is allowed by default");
      // 可以添加更多检查，如签名验证等
    }

    // Git 源检查
    if (input.source === "git") {
      reasons.push("Git source is allowed by default");
      warnings.push("Ensure the repository is trusted");
    }

    // URL 源检查
    if (input.source === "url") {
      warnings.push("URL source requires manual verification");
      reasons.push("URL source is conditionally allowed");
    }

    return {
      allowed: true,
      decisionSource: "default",
      reasons,
      warnings,
      durationMs: Date.now() - startTime,
    };
  }

  /** 执行策略命令 */
  private async executePolicyCommand(
    input: PolicyCheckInput,
    startTime: number
  ): Promise<PolicyCheckResult> {
    if (!this.policy) {
      return this.defaultPolicyCheck(input, startTime);
    }

    const timeout = this.policy.timeout || this.defaultTimeout;
    const failClosed = this.policy.failClosed ?? this.defaultFailClosed;

    // 构建命令参数
    const args = this.buildCommandArgs(input);

    // 构建环境变量
    const env = {
      ...process.env,
      ...this.policy.env,
      POLICY_INPUT: JSON.stringify(input),
    };

    try {
      // 验证命令路径是否存在
      try {
        await fs.access(this.policy.command);
      } catch {
        throw new Error(`Policy command not found: ${this.policy.command}`);
      }

      // 执行命令
      const result = await this.runCommand(
        this.policy.command,
        args,
        env,
        timeout
      );

      // 解析输出
      const output = this.parsePolicyOutput(result.stdout, result.stderr);

      return {
        allowed: output.allowed,
        decisionSource: "policy",
        reasons: output.reasons,
        warnings: output.warnings,
        durationMs: Date.now() - startTime,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[InstallPolicy] Policy check error: ${errorMessage}`);

      return {
        allowed: !failClosed,
        decisionSource: "error",
        reasons: failClosed
          ? ["Policy check failed, installation rejected (fail-closed)"]
          : ["Policy check failed, installation allowed (fail-open)"],
        warnings: [`Error: ${errorMessage}`],
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /** 构建命令参数 */
  private buildCommandArgs(input: PolicyCheckInput): string[] {
    if (this.policy?.argsTemplate) {
      return this.policy.argsTemplate.map((arg) => {
        return arg
          .replace(/\${source}/g, input.source)
          .replace(/\${skillName}/g, input.skillName)
          .replace(/\${version}/g, input.version || "")
          .replace(/\${sourceUrl}/g, input.sourceUrl || "")
          .replace(/\${targetPath}/g, input.targetPath);
      });
    }

    return [
      "--source", input.source,
      "--skill", input.skillName,
      "--target", input.targetPath,
    ];
  }

  /** 执行命令 */
  private runCommand(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    timeout: number
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        env,
        stdio: ["pipe", "pipe", "pipe"],
        timeout,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command exited with code ${code}: ${stderr}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });

      // 超时处理
      setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /** 解析策略输出 */
  private parsePolicyOutput(
    stdout: string,
    stderr: string
  ): { allowed: boolean; reasons: string[]; warnings: string[] } {
    try {
      // 尝试解析 JSON 输出
      const output = JSON.parse(stdout);
      return {
        allowed: output.allowed === true,
        reasons: output.reasons || [],
        warnings: output.warnings || [],
      };
    } catch {
      // 非 JSON 输出，基于退出码判断
      const allowed = stdout.toLowerCase().includes("allow") ||
        stdout.toLowerCase().includes("approved") ||
        stdout.toLowerCase().includes("ok");

      return {
        allowed,
        reasons: allowed ? ["Policy approved"] : ["Policy rejected"],
        warnings: stderr ? [stderr] : [],
      };
    }
  }

  /** 提取注册表 URL */
  private extractRegistry(url?: string): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.origin;
    } catch {
      return null;
    }
  }

  /** 获取当前配置 */
  getConfig(): SecurityConfig {
    return { ...this.securityConfig };
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalPolicyManager: InstallPolicyManager | null = null;

/** 获取全局安装策略管理器 */
export function getInstallPolicyManager(): InstallPolicyManager {
  if (!globalPolicyManager) {
    globalPolicyManager = new InstallPolicyManager();
  }
  return globalPolicyManager;
}

/** 初始化全局安装策略管理器 */
export function initInstallPolicyManager(config?: SecurityConfig): InstallPolicyManager {
  globalPolicyManager = new InstallPolicyManager(config);
  return globalPolicyManager;
}

/** 重置全局管理器 */
export function resetInstallPolicyManager(): void {
  globalPolicyManager = null;
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 快速检查安装是否允许 */
export async function checkInstallAllowed(
  input: PolicyCheckInput
): Promise<boolean> {
  const manager = getInstallPolicyManager();
  const result = await manager.checkPolicy(input);
  return result.allowed;
}