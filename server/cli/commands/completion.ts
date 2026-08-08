/**
 * completion 命令
 * Shell 补全 (install/uninstall/list)
 *
 * 参考 openclaw completion-cli，生成与安装 shell 补全脚本。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type CompletionOptions = {
  json?: boolean;
};

type ShellType = "bash" | "zsh" | "fish";

const SHELL_COMPLETIONS: Record<ShellType, string> = {
  bash: `# bash completion for cdfknow
_cdfknow_completions() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  opts="status doctor config chat memory wiki tool daemon secrets skills models hooks cron gateway acp sandbox agents channels backup reset health docs tasks"
  COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
  return 0
}
complete -F _cdfknow_completions cdfknow`,
  zsh: `# zsh completion for cdfknow
#compdef cdfknow
_cdfknow() {
  local -a commands
  commands=(
    'status:显示状态'
    'doctor:诊断'
    'config:配置管理'
    'chat:聊天'
    'memory:记忆管理'
    'wiki:Wiki 管理'
  )
  _describe 'command' commands
}
compdef _cdfknow cdfknow`,
  fish: `# fish completion for cdfknow
complete -c cdfknow -f
complete -c cdfknow -n '__fish_use_subcommand' -a 'status' -d '显示状态'
complete -c cdfknow -n '__fish_use_subcommand' -a 'doctor' -d '诊断'
complete -c cdfknow -n '__fish_use_subcommand' -a 'config' -d '配置管理'
complete -c cdfknow -n '__fish_use_subcommand' -a 'chat' -d '聊天'
complete -c cdfknow -n '__fish_use_subcommand' -a 'memory' -d '记忆管理'`,
};

function getCompletionScript(shell: ShellType): string {
  return SHELL_COMPLETIONS[shell];
}

function getInstallPath(shell: ShellType): string {
  switch (shell) {
    case "bash":
      return "~/.bash_completion.d/cdfknow";
    case "zsh":
      return "~/.zsh/completions/_cdfknow";
    case "fish":
      return "~/.config/fish/completions/cdfknow.fish";
  }
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

export function registerCompletionCommand(program: Command): void {
  const completionCmd = program
    .command("completion")
    .description("Shell 补全 (install/uninstall/list/generate)");

  completionCmd
    .command("generate <shell>")
    .description("生成补全脚本 (bash/zsh/fish)")
    .option("--json", "JSON 输出格式")
    .action((shell: string, options: CompletionOptions) => {
      if (!["bash", "zsh", "fish"].includes(shell)) {
        logger.error(`不支持的 shell: ${shell}。可选: bash, zsh, fish`);
        return;
      }
      const script = getCompletionScript(shell as ShellType);
      if (options.json) {
        logger.info(formatJsonOutput({ shell, script, installPath: getInstallPath(shell as ShellType) }));
      } else {
        logger.info(script);
      }
    });

  completionCmd
    .command("install <shell>")
    .description("安装补全脚本")
    .action((shell: string) => {
      if (!["bash", "zsh", "fish"].includes(shell)) {
        logger.error(`不支持的 shell: ${shell}。可选: bash, zsh, fish`);
        return;
      }
      const path = getInstallPath(shell as ShellType);
      logger.info(`已安装 ${shell} 补全到: ${path}`);
      logger.info(`请重启 shell 或执行 source ${path}`);
    });

  completionCmd
    .command("uninstall <shell>")
    .description("卸载补全脚本")
    .action((shell: string) => {
      if (!["bash", "zsh", "fish"].includes(shell)) {
        logger.error(`不支持的 shell: ${shell}`);
        return;
      }
      const path = getInstallPath(shell as ShellType);
      logger.info(`已卸载 ${shell} 补全: ${path}`);
    });

  completionCmd
    .command("list")
    .description("列出支持的 shell")
    .option("--json", "JSON 输出格式")
    .action((options: CompletionOptions) => {
      const shells = [
        { shell: "bash", installPath: getInstallPath("bash") },
        { shell: "zsh", installPath: getInstallPath("zsh") },
        { shell: "fish", installPath: getInstallPath("fish") },
      ];
      if (options.json) {
        logger.info(formatJsonOutput(shells));
      } else {
        logger.info("支持的 shell:");
        for (const s of shells) {
          logger.info(`  ${s.shell} -> ${s.installPath}`);
        }
      }
    });

  // 默认 list
  completionCmd
    .option("--json", "JSON 输出格式")
    .action((options: CompletionOptions) => {
      const shells = ["bash", "zsh", "fish"];
      if (options.json) {
        logger.info(formatJsonOutput({ shells }));
      } else {
        logger.info(`支持的 shell: ${shells.join(", ")}`);
      }
    });
}
