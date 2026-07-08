/**
 * acp 命令
 * ACP 管理命令 (status/policy/approval/session/list)
 *
 * 参考 openclaw acp-cli，封装对 server/engine/acp 模块的调用。
 * 当 ACP 系统尚未就绪时，使用本地状态进行模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type AcpOptions = {
  json?: boolean;
};

/** ACP 运行状态 */
type AcpState = "running" | "stopped" | "error";

/** ACP 状态信息 */
interface AcpStatus {
  state: AcpState;
  activeSessions: number;
  activeTurns: number;
  completedTurns: number;
  failedTurns: number;
  policyProfile: string;
  pendingApprovals: number;
  uptime?: string;
}

/** 策略信息 */
interface PolicyInfo {
  activeProfile: string;
  rules: number;
  toolPermissions: number;
  defaultLevel: string;
}

/** 模拟 ACP 状态 */
let acpState: AcpStatus = {
  state: "stopped",
  activeSessions: 0,
  activeTurns: 0,
  completedTurns: 0,
  failedTurns: 0,
  policyProfile: "default",
  pendingApprovals: 0,
};

/** 获取 ACP 状态 */
function getAcpStatus(): AcpStatus {
  return { ...acpState };
}

/** 启动 ACP */
function startAcp(): AcpStatus {
  if (acpState.state === "running") {
    return getAcpStatus();
  }
  acpState = {
    ...acpState,
    state: "running",
    activeSessions: 1,
    uptime: new Date().toISOString(),
  };
  return getAcpStatus();
}

/** 停止 ACP */
function stopAcp(): AcpStatus {
  acpState = {
    ...acpState,
    state: "stopped",
    activeSessions: 0,
    activeTurns: 0,
    uptime: undefined,
  };
  return getAcpStatus();
}

/** 获取策略信息 */
function getPolicyInfo(): PolicyInfo {
  return {
    activeProfile: acpState.policyProfile,
    rules: 3,
    toolPermissions: 0,
    defaultLevel: "prompt",
  };
}

/** 设置策略配置 */
function setPolicyProfile(profile: string): PolicyInfo {
  const validProfiles = ["default", "restricted", "full"];
  if (!validProfiles.includes(profile)) {
    throw new Error(`Invalid policy profile: ${profile}. Valid: ${validProfiles.join(", ")}`);
  }
  acpState = { ...acpState, policyProfile: profile };
  return getPolicyInfo();
}

/** 列出审批请求 */
function listApprovals(): { pending: number; approved: number; denied: number } {
  return {
    pending: acpState.pendingApprovals,
    approved: acpState.completedTurns,
    denied: acpState.failedTurns,
  };
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化状态文本输出 */
function formatStatusOutput(status: AcpStatus): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  ACP 控制平面状态:");
  lines.push(`    状态:         ${status.state}`);
  lines.push(`    活跃会话:     ${status.activeSessions}`);
  lines.push(`    活跃 Turn:    ${status.activeTurns}`);
  lines.push(`    已完成 Turn:  ${status.completedTurns}`);
  lines.push(`    失败 Turn:    ${status.failedTurns}`);
  lines.push(`    策略配置:     ${status.policyProfile}`);
  lines.push(`    待审批:       ${status.pendingApprovals}`);
  if (status.uptime) {
    lines.push(`    启动时间:     ${new Date(status.uptime).toLocaleString("zh-CN")}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** 格式化策略信息输出 */
function formatPolicyOutput(policy: PolicyInfo): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  ACP 策略配置:");
  lines.push(`    活跃配置:     ${policy.activeProfile}`);
  lines.push(`    规则数:       ${policy.rules}`);
  lines.push(`    工具权限:     ${policy.toolPermissions}`);
  lines.push(`    默认级别:     ${policy.defaultLevel}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * 注册 acp 命令
 */
export function registerAcpCommand(program: Command): void {
  const acpCmd = program
    .command("acp")
    .description("ACP 控制平面管理 (status/policy/approval/start/stop)");

  acpCmd
    .command("status")
    .description("显示 ACP 控制平面状态")
    .option("--json", "JSON 输出格式")
    .action((options: AcpOptions) => {
      const status = getAcpStatus();
      if (options.json) {
        console.log(formatJsonOutput(status));
      } else {
        console.log(formatStatusOutput(status));
      }
    });

  acpCmd
    .command("start")
    .description("启动 ACP 控制平面")
    .option("--json", "JSON 输出格式")
    .action((options: AcpOptions) => {
      const status = startAcp();
      logger.info("[ACP] 控制平面已启动");
      if (options.json) {
        console.log(formatJsonOutput(status));
      } else {
        console.log(formatStatusOutput(status));
      }
    });

  acpCmd
    .command("stop")
    .description("停止 ACP 控制平面")
    .option("--json", "JSON 输出格式")
    .action((options: AcpOptions) => {
      const status = stopAcp();
      logger.info("[ACP] 控制平面已停止");
      if (options.json) {
        console.log(formatJsonOutput(status));
      } else {
        console.log(formatStatusOutput(status));
      }
    });

  const policyCmd = acpCmd
    .command("policy")
    .description("策略管理 (show/set)");

  policyCmd
    .command("show")
    .description("显示当前策略配置")
    .option("--json", "JSON 输出格式")
    .action((options: AcpOptions) => {
      const policy = getPolicyInfo();
      if (options.json) {
        console.log(formatJsonOutput(policy));
      } else {
        console.log(formatPolicyOutput(policy));
      }
    });

  policyCmd
    .command("set")
    .description("设置策略配置 (default/restricted/full)")
    .argument("<profile>", "策略配置名称")
    .option("--json", "JSON 输出格式")
    .action((profile: string, options: AcpOptions) => {
      try {
        const policy = setPolicyProfile(profile);
        logger.info(`[ACP] 策略配置已切换为: ${profile}`);
        if (options.json) {
          console.log(formatJsonOutput(policy));
        } else {
          console.log(formatPolicyOutput(policy));
        }
      } catch (err) {
        logger.error(`[ACP] ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  acpCmd
    .command("approval")
    .description("列出审批请求")
    .option("--json", "JSON 输出格式")
    .action((options: AcpOptions) => {
      const approvals = listApprovals();
      if (options.json) {
        console.log(formatJsonOutput(approvals));
      } else {
        console.log("");
        console.log("  审批请求统计:");
        console.log(`    待审批: ${approvals.pending}`);
        console.log(`    已批准: ${approvals.approved}`);
        console.log(`    已拒绝: ${approvals.denied}`);
        console.log("");
      }
    });
}
