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
  for (const descriptor of descriptors) {
    if (descriptor.name === "config" || descriptor.name === "version" || descriptor.name === "help") {
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
    // 规范化 argv
    let normalizedArgv = normalizeRootNoColorArgv(argv);
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
