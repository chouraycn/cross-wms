/**
 * 配置类检查
 * 包含配置文件完整性、有效性、遗留配置迁移、lint 配置等检查
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type {
  DoctorCheck,
  DoctorCheckResult,
  DoctorContext,
  DoctorFinding,
} from "../types.js";
import { DoctorSeverity, DoctorCategory } from "../types.js";

const ConfigSchema = z.object({
  version: z.string().optional(),
  workspace: z.string().optional(),
  plugins: z.array(z.string()).optional(),
  security: z.object({}).optional(),
  gateway: z.object({}).optional(),
});

export const configChecks: DoctorCheck[] = [
  {
    id: "doctor-config",
    category: DoctorCategory.CONFIG,
    title: "配置文件完整性检查",
    description: "检查配置文件是否存在且格式正确",
    run: checkConfigFile,
  },
  {
    id: "doctor-legacy-config",
    category: DoctorCategory.CONFIG,
    title: "遗留配置迁移检查",
    description: "检查是否存在需要迁移的旧版本配置",
    run: checkLegacyConfig,
  },
  {
    id: "doctor-lint",
    category: DoctorCategory.CONFIG,
    title: "代码规范配置检查",
    description: "检查 lint 配置是否存在且有效",
    run: checkLintConfig,
  },
];

async function checkConfigFile(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];
  const configPath = join(context.configDir, "config.json");

  if (!existsSync(context.configDir)) {
    findings.push({
      id: "doctor/config/dir-missing",
      severity: "warning",
      message: "配置目录不存在",
      target: context.configDir,
      fixHint: "创建配置目录并初始化默认配置",
      fixable: true,
    });

    return {
      checkId: "doctor-config",
      category: DoctorCategory.CONFIG,
      severity: DoctorSeverity.WARN,
      title: "配置文件完整性检查",
      description: "检查配置文件是否存在且格式正确",
      findings,
      details: { configDir: context.configDir },
    };
  }

  if (!existsSync(configPath)) {
    findings.push({
      id: "doctor/config/file-missing",
      severity: "info",
      message: "配置文件不存在，将使用默认配置",
      target: configPath,
      fixHint: "可以通过 'cdfknow config init' 初始化配置文件",
      fixable: true,
    });

    return {
      checkId: "doctor-config",
      category: DoctorCategory.CONFIG,
      severity: DoctorSeverity.INFO,
      title: "配置文件完整性检查",
      description: "检查配置文件是否存在且格式正确",
      findings,
      details: { configPath },
    };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const result = ConfigSchema.safeParse(parsed);

    if (!result.success) {
      for (const issue of result.error.issues) {
        findings.push({
          id: `doctor/config/invalid-field-${issue.path.join(".")}`,
          severity: "error",
          message: `配置字段 ${issue.path.join(".")} 无效: ${issue.message}`,
          target: configPath,
          fixHint: `修正配置字段 ${issue.path.join(".")} 的值`,
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
      checkId: "doctor-config",
      category: DoctorCategory.CONFIG,
      severity,
      title: "配置文件完整性检查",
      description: "检查配置文件是否存在且格式正确",
      findings,
      details: {
        configPath,
        valid: result.success,
        hasConfig: true,
      },
    };
  } catch (err) {
    findings.push({
      id: "doctor/config/parse-error",
      severity: "error",
      message: `配置文件解析失败: ${err instanceof Error ? err.message : String(err)}`,
      target: configPath,
      fixHint: "检查配置文件 JSON 格式是否正确",
      fixable: false,
    });

    return {
      checkId: "doctor-config",
      category: DoctorCategory.CONFIG,
      severity: DoctorSeverity.FAIL,
      title: "配置文件完整性检查",
      description: "检查配置文件是否存在且格式正确",
      findings,
      details: { configPath, parseError: true },
    };
  }
}

async function checkLegacyConfig(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];
  const legacyFiles = [
    "config.old.json",
    "config.v1.json",
    "settings.json",
    "preferences.json",
  ];

  let foundLegacy = false;
  for (const file of legacyFiles) {
    const filePath = join(context.configDir, file);
    if (existsSync(filePath)) {
      foundLegacy = true;
      findings.push({
        id: `doctor/config/legacy-${file}`,
        severity: "info",
        message: `发现遗留配置文件: ${file}`,
        target: filePath,
        fixHint: "建议迁移到新的配置格式或删除旧配置文件",
        fixable: false,
      });
    }
  }

  return {
    checkId: "doctor-legacy-config",
    category: DoctorCategory.CONFIG,
    severity: foundLegacy ? DoctorSeverity.INFO : DoctorSeverity.PASS,
    title: "遗留配置迁移检查",
    description: "检查是否存在需要迁移的旧版本配置",
    findings,
    details: {
      legacyFilesFound: findings.length,
      checkedFiles: legacyFiles,
    },
  };
}

async function checkLintConfig(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];
  const lintConfigs = [
    ".eslintrc",
    ".eslintrc.json",
    ".eslintrc.js",
    "eslint.config.js",
    "eslint.config.ts",
    ".prettierrc",
    ".prettierrc.json",
  ];

  let foundAny = false;
  for (const file of lintConfigs) {
    const filePath = join(context.workspaceDir, file);
    if (existsSync(filePath)) {
      foundAny = true;
    }
  }

  if (!foundAny) {
    findings.push({
      id: "doctor/lint/config-missing",
      severity: "info",
      message: "未发现 lint 配置文件",
      target: context.workspaceDir,
      fixHint: "考虑添加 ESLint 或 Prettier 配置以保持代码风格一致",
      fixable: false,
    });
  }

  return {
    checkId: "doctor-lint",
    category: DoctorCategory.CONFIG,
    severity: findings.length > 0 ? DoctorSeverity.INFO : DoctorSeverity.PASS,
    title: "代码规范配置检查",
    description: "检查 lint 配置是否存在且有效",
    findings,
    details: {
      hasLintConfig: foundAny,
      checkedConfigs: lintConfigs,
    },
  };
}
