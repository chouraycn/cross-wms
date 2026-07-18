/**
 * CLI 程序入口
 * 构建和运行 CLI 程序
 */

import { Command } from "commander";
import { getCoreCliCommandDescriptors } from "./descriptors.js";
import { createProgramContext, setProgramContext } from "./context.js";
import {
  hasHelpOrVersion,
  normalizeRootNoColorArgv,
  normalizeRootLogLevelArgv,
  parseRootOptions,
} from "./argv.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerChatCommand } from "./commands/chat.js";
import { registerMemoryCommand } from "./commands/memory.js";
import { registerWikiCommand } from "./commands/wiki.js";
import { registerToolCommand } from "./commands/tool.js";
import { registerDaemonCommand } from "./commands/daemon.js";
import { registerSecretsCommand } from "./commands/secrets.js";
import { registerSkillsCommand } from "./commands/skills.js";
import { registerModelsCommand } from "./commands/models.js";
import { registerHooksCommand } from "./commands/hooks.js";
import { registerCronCommand } from "./commands/cron.js";
import { registerGatewayCommand } from "./commands/gateway.js";
import { registerAcpCommand } from "./commands/acp.js";
import { registerSandboxCommand } from "./commands/sandbox.js";
import { registerAgentsCommand } from "./commands/agents.js";
import { registerChannelsCommand } from "./commands/channels.js";
import { registerBackupCommand } from "./commands/backup.js";
import { registerResetCommand } from "./commands/reset.js";
import { registerHealthCommand } from "./commands/health.js";
import { logger } from "../logger.js";

/**
 * 构建 CLI 程序
 */
export function buildCLIProgram(): Command {
  const program = new Command();
  program.name("cdfknow").description("CDFKnow CLI");

  // 创建并设置程序上下文
  const ctx = createProgramContext();
  setProgramContext(program, ctx);

  // 添加全局选项
  program
    .option("--no-color", "禁用颜色输出")
    .option("--log-level <level>", "设置日志级别", "info")
    .option("--json", "JSON 输出格式")
    .option("--quiet", "静默模式")
    .option("--verbose", "详细输出");

  // 注册核心命令描述符
  const descriptors = getCoreCliCommandDescriptors();

  // 添加主命令占位符
  // 直接注册的命令需要跳过占位符创建，否则 commander v12 会因重复命令名抛错
  const DIRECTLY_REGISTERED = new Set([
    "config",
    "version",
    "help",
    "status",
    "doctor",
    "chat",
    "memory",
    "wiki",
    "tool",
    "skill",
    "cron",
    "daemon",
    "secrets",
    "models",
    "hooks",
    "gateway",
    "acp",
    "sandbox",
    "agents",
    "channels",
    "backup",
    "reset",
    "health",
  ]);
  for (const descriptor of descriptors) {
    if (DIRECTLY_REGISTERED.has(descriptor.name)) {
      // 这些命令直接注册
      continue;
    }

    const cmd = program.command(descriptor.name);
    cmd.description(descriptor.description);
    if (descriptor.aliases && descriptor.aliases.length > 0) {
      cmd.aliases([...descriptor.aliases]);
    }
  }

  // 注册 version 命令
  program
    .command("version")
    .aliases(["v", "ver"])
    .description("显示版本信息")
    .action(() => {
      logger.info(`cdfknow v${ctx.programVersion}`);
      logger.info(`Platform: ${process.platform}`);
      logger.info(`Node: ${process.version}`);
    });

  // 注册 help 命令
  registerHelpCommand(program);

  // 注册 status 命令
  registerStatusCommand(program);

  // 注册 doctor 命令
  registerDoctorCommand(program);

  // 注册 config 命令 (带子命令)
  registerConfigCommand(program);

  // 注册 chat 命令
  registerChatCommand(program);

  // 注册 memory 命令 (带子命令)
  registerMemoryCommand(program);

  // 注册 wiki 命令 (带子命令)
  registerWikiCommand(program);

  // 注册 tool 命令 (带子命令)
  registerToolCommand(program);

  // 注册 daemon 命令 (带子命令)
  registerDaemonCommand(program);

  // 注册 secrets 命令 (带子命令)
  registerSecretsCommand(program);

  // 注册 skill 命令 (带子命令)
  registerSkillsCommand(program);

  // 注册 models 命令 (带子命令)
  registerModelsCommand(program);

  // 注册 hooks 命令 (带子命令)
  registerHooksCommand(program);

  // 注册 cron 命令 (带子命令)
  registerCronCommand(program);

  // 注册 gateway 命令 (带子命令)
  registerGatewayCommand(program);

  // 注册 acp 命令 (带子命令)
  registerAcpCommand(program);

  // 注册 sandbox 命令 (带子命令)
  registerSandboxCommand(program);

  // 注册 agents 命令 (带子命令)
  registerAgentsCommand(program);

  // 注册 channels 命令 (带子命令)
  registerChannelsCommand(program);

  // 注册 backup 命令
  registerBackupCommand(program);

  // 注册 reset 命令
  registerResetCommand(program);

  // 注册 health 命令
  registerHealthCommand(program);

  return program;
}

/** 注册 help 命令 */
function registerHelpCommand(program: Command): void {
  program
    .command("help")
    .aliases(["h", "?"])
    .description("显示帮助信息")
    .argument("[command]", "要查看帮助的命令")
    .action((command?: string) => {
      if (command) {
        // 显示特定命令的帮助
        const cmd = program.commands.find(
          (c) => c.name() === command || c.aliases().includes(command),
        );
        if (cmd) {
          cmd.help();
        } else {
          logger.error(`未知命令: ${command}`);
          process.exit(1);
        }
      } else {
        // 显示总体帮助
        program.help();
      }
    });
}

/**
 * 运行 CLI
 * @param argv 命令行参数
 * @returns 退出码
 */
export async function runCLI(argv: string[]): Promise<number> {
  try {
    // 入参 argv 约定为“已剥离 node + 脚本名”的参数数组。
    // 但 commander.parseAsync 以及本模块内的根选项/help 解析工具都按完整
    // process.argv（含 node + 可执行名前缀）处理，因此这里补齐占位前缀，
    // 保证 normalize / 解析 / parse 三处行为一致。否则直接传入会被 commander
    // 当成“无参数”而回显 help。
    const cliArgv = ["node", "cdfknow", ...argv];

    // 规范化 argv
    let normalizedArgv = normalizeRootNoColorArgv(cliArgv);
    normalizedArgv = normalizeRootLogLevelArgv(normalizedArgv);

    // 检查 help/version
    if (hasHelpOrVersion(normalizedArgv)) {
      const program = buildCLIProgram();
      await program.parseAsync(normalizedArgv);
      return 0;
    }

    // 检查 verbose 标志
    const rootOptions = parseRootOptions(normalizedArgv);
    if (rootOptions.verbose) {
      logger.debug("[DEBUG] argv:", normalizedArgv);
    }

    // 构建并运行程序
    const program = buildCLIProgram();

    // 设置程序退出处理
    program.exitOverride((err) => {
      const exitCode = typeof err.exitCode === "number" ? err.exitCode : 1;
      throw new Error(`CLI exited with code ${exitCode}: ${err.message}`);
    });

    await program.parseAsync(normalizedArgv);
    return 0;
  } catch (error) {
    if (error instanceof Error && error.message.includes("CLI exited with code")) {
      const match = error.message.match(/code (\d+)/);
      return match ? parseInt(match[1], 10) : 1;
    }
    logger.error("Error running CLI:", error instanceof Error ? error.message : String(error));
    return 1;
  }
}

// 导出描述符工具
export {
  getCoreCliCommandDescriptors,
  getCoreCliCommandNames,
} from "./descriptors.js";
export type { CoreCommandDescriptor, CommandOption } from "./descriptors.js";

// 导出 argv 工具
export {
  hasHelpOrVersion,
  isHelpOrVersionInvocation,
  getPrimaryCommand,
  getCommandPath as getCommandPathFromArgv,
  getFlagValue,
  normalizeRootNoColorArgv,
  normalizeRootLogLevelArgv,
  normalizeHelpCommandArgv,
  parseRootOptions,
} from "./argv.js";
export type { RootOption, ParseRootOptionsResult } from "./argv.js";
