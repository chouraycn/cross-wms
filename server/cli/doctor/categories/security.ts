/**
 * 安全类检查
 * 包含安全配置、沙箱配置、技能系统等检查
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type {
  DoctorCheck,
  DoctorCheckResult,
  DoctorContext,
  DoctorFinding,
} from "../types.js";
import { DoctorSeverity, DoctorCategory } from "../types.js";

export const securityChecks: DoctorCheck[] = [
  {
    id: "doctor-security",
    category: DoctorCategory.SECURITY,
    title: "安全配置检查",
    description: "检查安全相关配置是否正确",
    run: checkSecurityConfig,
  },
  {
    id: "doctor-sandbox",
    category: DoctorCategory.SECURITY,
    title: "沙箱配置检查",
    description: "检查沙箱环境配置和可用性",
    run: checkSandboxConfig,
  },
  {
    id: "doctor-skills",
    category: DoctorCategory.SECURITY,
    title: "技能系统检查",
    description: "检查技能系统配置和安全性",
    run: checkSkillsSystem,
  },
];

async function checkSecurityConfig(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];
  const securityConfigPath = join(context.configDir, "security.json");

  if (!existsSync(securityConfigPath)) {
    findings.push({
      id: "doctor/security/config-missing",
      severity: "warning",
      message: "安全配置文件不存在，将使用默认安全配置",
      target: securityConfigPath,
      fixHint: "考虑创建安全配置文件以自定义安全策略",
      fixable: false,
    });
  } else {
    try {
      const raw = readFileSync(securityConfigPath, "utf-8");
      const config = JSON.parse(raw);

      if (!config.sessionTimeout) {
        findings.push({
          id: "doctor/security/no-session-timeout",
          severity: "info",
          message: "未配置会话超时时间",
          target: securityConfigPath,
          fixHint: "建议配置 sessionTimeout 以增强安全性",
          fixable: false,
        });
      }

      if (config.allowInsecureConnections) {
        findings.push({
          id: "doctor/security/insecure-connections",
          severity: "warning",
          message: "允许不安全的连接",
          target: securityConfigPath,
          fixHint: "建议禁用 allowInsecureConnections 以提高安全性",
          fixable: false,
        });
      }

      if (!config.encryptionEnabled === false) {
        findings.push({
          id: "doctor/security/encryption-disabled",
          severity: "warning",
          message: "加密功能未启用",
          target: securityConfigPath,
          fixHint: "建议启用 encryptionEnabled 以保护敏感数据",
          fixable: false,
        });
      }
    } catch (err) {
      findings.push({
        id: "doctor/security/config-error",
        severity: "error",
        message: `安全配置文件解析失败: ${err instanceof Error ? err.message : String(err)}`,
        target: securityConfigPath,
        fixHint: "检查安全配置文件格式是否正确",
        fixable: false,
      });
    }
  }

  const severity = findings.some((f) => f.severity === "error")
    ? DoctorSeverity.FAIL
    : findings.length > 0
      ? DoctorSeverity.WARN
      : DoctorSeverity.PASS;

  return {
    checkId: "doctor-security",
    category: DoctorCategory.SECURITY,
    severity,
    title: "安全配置检查",
    description: "检查安全相关配置是否正确",
    findings,
    details: {
      hasSecurityConfig: existsSync(securityConfigPath),
      configPath: securityConfigPath,
    },
  };
}

async function checkSandboxConfig(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];
  const sandboxConfigPath = join(context.configDir, "sandbox.json");
  let sandboxConfig: Record<string, unknown> | null = null;
  let sandboxEnabled = false;
  let sandboxEngine: unknown = null;

  if (!existsSync(sandboxConfigPath)) {
    findings.push({
      id: "doctor/sandbox/config-missing",
      severity: "info",
      message: "沙箱配置文件不存在",
      target: sandboxConfigPath,
      fixHint: "如果需要沙箱功能，请创建沙箱配置文件",
      fixable: false,
    });
  } else {
    try {
      const raw = readFileSync(sandboxConfigPath, "utf-8");
      sandboxConfig = JSON.parse(raw);

      if (sandboxConfig && sandboxConfig.enabled) {
        sandboxEnabled = true;
        sandboxEngine = sandboxConfig.engine;

        if (!sandboxConfig.engine) {
          findings.push({
            id: "doctor/sandbox/no-engine",
            severity: "warning",
            message: "沙箱已启用但未指定引擎",
            target: sandboxConfigPath,
            fixHint: "配置 sandbox.engine (docker/isolate/none)",
            fixable: false,
          });
        }

        if (sandboxConfig.engine === "docker") {
          if (!sandboxConfig.image) {
            findings.push({
              id: "doctor/sandbox/no-image",
              severity: "warning",
              message: "Docker 沙箱未指定镜像",
              target: sandboxConfigPath,
              fixHint: "配置 sandbox.image 指定 Docker 镜像",
              fixable: false,
            });
          }

          try {
            const { execSync } = await import("child_process");
            execSync("docker --version", { stdio: "ignore" });
          } catch {
            findings.push({
              id: "doctor/sandbox/docker-missing",
              severity: "error",
              message: "Docker 沙箱已配置但 Docker 不可用",
              fixHint: "安装 Docker 或更改沙箱引擎",
              fixable: false,
            });
          }
        }
      }
    } catch (err) {
      findings.push({
        id: "doctor/sandbox/config-error",
        severity: "error",
        message: `沙箱配置文件解析失败: ${err instanceof Error ? err.message : String(err)}`,
        target: sandboxConfigPath,
        fixHint: "检查沙箱配置文件格式是否正确",
        fixable: false,
      });
    }
  }

  const severity = findings.some((f) => f.severity === "error")
    ? DoctorSeverity.FAIL
    : findings.length > 0
      ? DoctorSeverity.WARN
      : DoctorSeverity.PASS;

  return {
    checkId: "doctor-sandbox",
    category: DoctorCategory.SECURITY,
    severity,
    title: "沙箱配置检查",
    description: "检查沙箱环境配置和可用性",
    findings,
    details: {
      hasSandboxConfig: existsSync(sandboxConfigPath),
      configPath: sandboxConfigPath,
      sandboxEnabled,
      sandboxEngine,
    },
  };
}

async function checkSkillsSystem(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];
  const skillsDir = join(context.workspaceDir, "skills");
  const skillsConfigPath = join(context.configDir, "skills.json");

  if (!existsSync(skillsDir)) {
    findings.push({
      id: "doctor/skills/dir-missing",
      severity: "info",
      message: "技能目录不存在",
      target: skillsDir,
      fixHint: "如果需要自定义技能，请创建技能目录",
      fixable: false,
    });
  }

  if (!existsSync(skillsConfigPath)) {
    findings.push({
      id: "doctor/skills/config-missing",
      severity: "info",
      message: "技能配置文件不存在",
      target: skillsConfigPath,
      fixHint: "可创建技能配置文件以自定义技能行为",
      fixable: false,
    });
  } else {
    try {
      const raw = readFileSync(skillsConfigPath, "utf-8");
      const config = JSON.parse(raw);

      if (config.allowUnsafeSkills) {
        findings.push({
          id: "doctor/skills/unsafe-allowed",
          severity: "warning",
          message: "允许加载不安全的技能",
          target: skillsConfigPath,
          fixHint: "建议禁用 allowUnsafeSkills 以提高安全性",
          fixable: false,
        });
      }

      if (config.skills && Array.isArray(config.skills)) {
        findings.push({
          id: "doctor/skills/count",
          severity: "info",
          message: `已配置 ${config.skills.length} 个技能`,
          fixHint: "检查技能列表是否符合预期",
          fixable: false,
        });
      }
    } catch (err) {
      findings.push({
        id: "doctor/skills/config-error",
        severity: "warning",
        message: `技能配置文件解析失败: ${err instanceof Error ? err.message : String(err)}`,
        target: skillsConfigPath,
        fixHint: "检查技能配置文件格式是否正确",
        fixable: false,
      });
    }
  }

  const severity = findings.some((f) => f.severity === "error")
    ? DoctorSeverity.FAIL
    : findings.length > 0
      ? DoctorSeverity.WARN
      : DoctorSeverity.PASS;

  return {
    checkId: "doctor-skills",
    category: DoctorCategory.SECURITY,
    severity,
    title: "技能系统检查",
    description: "检查技能系统配置和安全性",
    findings,
    details: {
      skillsDir,
      skillsConfigPath,
      hasSkillsDir: existsSync(skillsDir),
      hasSkillsConfig: existsSync(skillsConfigPath),
    },
  };
}
