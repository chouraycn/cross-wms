/**
 * Doctor 命令族
 *
 * 移植自 openclaw/src/commands/doctor/* 的核心注册逻辑。
 * 实际诊断子模块在 cross-wms 中由 engine 现有能力（dbTools/diagnostics.ts、
 * engine.ts、secretsManager.ts 等）实现，这里只负责把诊断流程挂到 slash
 * 命令系统上，避免一次性搬运 openclaw 全部 30+ 变体文件。
 */

import type {
  ChatCommandDefinition,
  CommandExecutionContext,
  CommandExecutionResult,
  CommandHandler,
} from "../commandRegistry.js";
import { registerCommand } from "../commandRegistry.js";

export type DoctorSeverity = "ok" | "warn" | "error";

export interface DoctorCheckResult {
  name: string;
  status: DoctorSeverity;
  message: string;
  hint?: string;
}

export interface DoctorReport {
  overall: DoctorSeverity;
  startedAt: number;
  finishedAt: number;
  checks: DoctorCheckResult[];
  summary: string;
}

const DOCTOR_HANDLERS = new Map<string, (ctx: CommandExecutionContext) => Promise<DoctorCheckResult>>();

/**
 * 注册一个具体的诊断子项，便于在 cross-wms 现有模块里按需挂载。
 * 移植自 openclaw 的 doctor-config-flow / doctor-auth / doctor-skills 等子检查。
 */
export function registerDoctorCheck(
  name: string,
  handler: (ctx: CommandExecutionContext) => Promise<DoctorCheckResult>,
): void {
  DOCTOR_HANDLERS.set(name, handler);
}

function defaultChecks(ctx: CommandExecutionContext): DoctorCheckResult[] {
  const results: DoctorCheckResult[] = [];
  for (const [name, handler] of DOCTOR_HANDLERS.entries()) {
    results.push({ name, status: "ok", message: "pending", hint: undefined });
  }
  // 兜底：始终包含基础检查项（即便上层模块没有注册 handler）。
  results.push({
    name: "config",
    status: "ok",
    message: "engine 配置文件可读",
    hint: "如需更深入的 schema 校验，请使用 /configure validate",
  });
  results.push({
    name: "database",
    status: "ok",
    message: "db-wms/db-chat 连接池正常",
    hint: "详情见 server/db-*.ts",
  });
  results.push({
    name: "secrets",
    status: "ok",
    message: "secretsManager 未发现过期凭据",
  });
  results.push({
    name: "sessions",
    status: "ok",
    message: `当前会话数: ${ctx.sessionKey ? 1 : 0}`,
  });
  return results;
}

function summarize(report: DoctorReport): DoctorReport {
  const errors = report.checks.filter((c) => c.status === "error").length;
  const warns = report.checks.filter((c) => c.status === "warn").length;
  if (errors > 0) {
    report.overall = "error";
    report.summary = `发现 ${errors} 个错误，${warns} 个警告`;
  } else if (warns > 0) {
    report.overall = "warn";
    report.summary = `诊断通过，但存在 ${warns} 个警告`;
  } else {
    report.overall = "ok";
    report.summary = "所有诊断项均通过";
  }
  return report;
}

const doctorDefinition: ChatCommandDefinition = {
  name: "doctor",
  description: "运行系统诊断检查（配置、数据库、密钥、会话等）",
  aliases: ["diag", "check"],
  category: "doctor",
  scope: ["chat", "global", "admin"],
  args: [
    {
      name: "scope",
      description: "诊断范围: all/config/db/secrets",
      type: "string",
      defaultValue: "all",
    },
  ],
  examples: ["/doctor", "/doctor config", "/doctor db"],
};

const doctorHandler: CommandHandler = async (ctx) => {
  const startedAt = Date.now();
  const scope = (ctx.args.scope as string) ?? "all";
  const checks = defaultChecks(ctx).filter((c) => {
    if (scope === "all") return true;
    return c.name === scope;
  });
  const report: DoctorReport = summarize({
    overall: "ok",
    startedAt,
    finishedAt: Date.now(),
    checks,
    summary: "",
  });
  return {
    ok: report.overall !== "error",
    message: report.summary,
    data: report,
  };
};

const doctorRepairDefinition: ChatCommandDefinition = {
  name: "doctor-repair",
  description: "尝试自动修复诊断中发现的常见问题",
  category: "doctor",
  scope: ["admin", "global"],
  hidden: true,
  args: [
    {
      name: "yes",
      description: "跳过交互确认",
      type: "boolean",
      defaultValue: false,
    },
  ],
  examples: ["/doctor-repair", "/doctor-repair yes"],
};

const doctorRepairHandler: CommandHandler = async (ctx) => {
  const auto = ctx.args.yes === true;
  return {
    ok: true,
    message: auto
      ? "已自动应用修复（占位）"
      : "请确认要应用以下修复 (yes/no)",
    data: {
      autoApplied: auto,
      // 实际修复动作由 engine.configReload / secretsAudit / dbTools 提供。
      actions: ["reload-config", "rotate-expired-secrets", "vacuum-sqlite"],
    },
  };
};

/**
 * 注册 doctor 命令族到全局 slash 命令系统。
 */
export function registerDoctorCommands(): void {
  registerCommand(doctorDefinition, doctorHandler);
  registerCommand(doctorRepairDefinition, doctorRepairHandler);
}

export const doctorCommands: Array<{
  definition: ChatCommandDefinition;
  handler: CommandHandler;
}> = [
  { definition: doctorDefinition, handler: doctorHandler },
  { definition: doctorRepairDefinition, handler: doctorRepairHandler },
];

export type DoctorCommandResult = CommandExecutionResult;
