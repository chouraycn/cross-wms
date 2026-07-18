// Shell completion generation, cache writing, and install command registration.
// 移植自 openclaw/src/cli/completion-cli.ts。
//
// 降级策略：
//  - 原模块依赖 `../../packages/terminal-core/src/*`（links/theme）、
//    `../logging/console.js`、`./program/command-registry-core.js`、
//    `./program/program-context.js`、`./program/register.subclis-core.js`、
//    `../plugins/cli.js`。这些模块在 cross-wms 中尚未完整移植；
//    `getCompletionScript` 保留原始实现（仅依赖 commander 与 completion-fish），
//    `registerCompletionCli` 降级为注册命令占位，action 抛出 "not supported" 错误。

import type { Command } from "commander";
import {
  buildFishOptionCompletionLine,
  buildFishSubcommandCompletionLine,
} from "./completion-fish.js";
import {
  COMPLETION_SHELLS,
  type CompletionShell,
  installCompletion,
  isCompletionShell,
  resolveShellFromEnv,
} from "./completion-runtime.js";

export function getCompletionScript(shell: CompletionShell, program: Command): string {
  if (shell === "zsh") {
    return generateZshCompletion(program);
  }
  if (shell === "bash") {
    return generateBashCompletion(program);
  }
  if (shell === "powershell") {
    return generatePowerShellCompletion(program);
  }
  return generateFishCompletion(program);
}

function splitOptionFlags(flags: string): string[] {
  return flags.split(/[ ,|]+/u).filter(Boolean);
}

function preferredCompletionFlag(flags: string): string {
  const parts = splitOptionFlags(flags);
  return parts.find((flag) => flag.startsWith("--")) ?? parts[0] ?? flags;
}

function fishWords(values: readonly string[]): string {
  return values.join(" ");
}

function fishOptionFlags(options: Command["options"], wantsValue: boolean): string[] {
  return options.flatMap((option) => {
    if ((option.required || option.optional) !== wantsValue) {
      return [];
    }
    return splitOptionFlags(option.flags).filter((flag) => flag.startsWith("-"));
  });
}

function collectFishPathOptionFlags(
  program: Command,
  parents: readonly string[],
  wantsValue: boolean,
): string[] {
  const flags = new Set(fishOptionFlags(program.options, wantsValue));
  let current: Command | undefined = program;
  for (const name of parents) {
    current = current?.commands.find((cmd) => cmd.name() === name);
    if (!current) {
      break;
    }
    for (const flag of fishOptionFlags(current.options, wantsValue)) {
      flags.add(flag);
    }
  }
  return [...flags];
}

function generateFishPathHelper(rootCmd: string): string {
  // Fish needs a helper to ignore option values while matching nested command paths.
  return `
function __${rootCmd}_command_path_matches
  set -l expected
  set -l value_options
  set -l reading_value_options 0
  for arg in $argv
    if test "$arg" = "--"
      set reading_value_options 1
      continue
    end
    if test $reading_value_options -eq 1
      set -a value_options $arg
    else
      set -a expected $arg
    end
  end
  set -l tokens (commandline -opc)
  set -e tokens[1]
  set -l command_tokens
  set -l skip_next 0
  for token in $tokens
    if test $skip_next -eq 1
      set skip_next 0
      continue
    end
    set -l flag (string split -m1 "=" -- $token)[1]
    if contains -- $flag $value_options
      if not string match -q -- "*=*" $token
        set skip_next 1
      end
      continue
    end
    if string match -q -- "-*" $token
      continue
    end
    set -a command_tokens $token
  end
  for i in (seq (count $expected))
    if test "$command_tokens[$i]" != "$expected[$i]"
      return 1
    end
  end
  return 0
end
`;
}

function fishCommandPathCondition(
  program: Command,
  rootCmd: string,
  parents: readonly string[],
): string {
  const valueOptions = collectFishPathOptionFlags(program, parents, true);
  return `__${rootCmd}_command_path_matches ${parents.join(" ")} -- ${fishWords(valueOptions)}`.trimEnd();
}

function generateZshCompletion(program: Command): string {
  const rootCmd = program.name();
  const script = `
#compdef ${rootCmd}

_${rootCmd}_root_completion() {
  local -a commands
  local -a options

  _arguments -C \\
    ${generateZshArgs(program)} \\
    ${generateZshSubcmdList(program)} \\
    "*::arg:->args"

  case $state in
    (args)
      case $line[1] in
        ${program.commands.map((cmd) => `(${cmd.name()}) _${rootCmd}_${cmd.name().replace(/-/g, "_")} ;;`).join("\n        ")}
      esac
      ;;
  esac
}

${generateZshSubcommands(program, rootCmd)}

_${rootCmd}_register_completion() {
  if (( ! $+functions[compdef] )); then
    return 0
  fi

  compdef _${rootCmd}_root_completion ${rootCmd}
  precmd_functions=(\${precmd_functions:#_${rootCmd}_register_completion})
  unfunction _${rootCmd}_register_completion 2>/dev/null
}

_${rootCmd}_register_completion
if (( ! $+functions[compdef] )); then
  typeset -ga precmd_functions
  if [[ -z "\${precmd_functions[(r)_${rootCmd}_register_completion]}" ]]; then
    precmd_functions+=(_${rootCmd}_register_completion)
  fi
fi
`;
  return script;
}

function generateZshArgs(cmd: Command): string {
  return (cmd.options || [])
    .map((opt) => {
      const flags = opt.flags.split(/[ ,|]+/);
      const name = flags.find((f) => f.startsWith("--")) || flags[0];
      const short = flags.find((f) => f.startsWith("-") && !f.startsWith("--"));
      const desc = escapeZshDoubleQuotedDescription(opt.description);
      if (short) {
        return `"(${name} ${short})"{${name},${short}}"[${desc}]"`;
      }
      return `"${name}[${desc}]"`;
    })
    .join(" \\\n    ");
}

function generateZshSubcmdList(cmd: Command): string {
  const list = cmd.commands
    .map((c) => {
      const desc = c
        .description()
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "'\\''")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]");
      return `'${c.name()}[${desc}]'`;
    })
    .join(" ");
  return `"1: :_values 'command' ${list}"`;
}

function escapeZshDoubleQuotedDescription(description: string): string {
  return description
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replaceAll("`", "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function generateZshSubcommands(program: Command, prefix: string): string {
  const segments: string[] = [];

  const visit = (current: Command, currentPrefix: string) => {
    for (const cmd of current.commands) {
      const cmdName = cmd.name();
      const nextPrefix = `${currentPrefix}_${cmdName.replace(/-/g, "_")}`;
      const funcName = `_${nextPrefix}`;

      visit(cmd, nextPrefix);

      const subCommands = cmd.commands;
      if (subCommands.length > 0) {
        segments.push(`
${funcName}() {
  local -a commands
  local -a options

  _arguments -C \\
    ${generateZshArgs(cmd)} \\
    ${generateZshSubcmdList(cmd)} \\
    "*::arg:->args"

  case $state in
    (args)
      case $line[1] in
        ${subCommands.map((sub) => `(${sub.name()}) ${funcName}_${sub.name().replace(/-/g, "_")} ;;`).join("\n        ")}
      esac
      ;;
  esac
}
`);
        continue;
      }

      segments.push(`
${funcName}() {
  _arguments -C \\
    ${generateZshArgs(cmd)}
}
`);
    }
  };

  visit(program, prefix);
  return segments.join("");
}

function generateBashCompletion(program: Command): string {
  const rootCmd = program.name();
  return `
_${rootCmd}_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    opts="${program.commands.map((c) => c.name()).join(" ")} ${program.options.map((o) => preferredCompletionFlag(o.flags)).join(" ")}"

    case "\${prev}" in
      ${program.commands.map((cmd) => generateBashSubcommand(cmd)).join("\n      ")}
    esac

    if [[ \${cur} == -* ]] ; then
        COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
        return 0
    fi

    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
}

complete -F _${rootCmd}_completion ${rootCmd}
`;
}

function generateBashSubcommand(cmd: Command): string {
  return `${cmd.name()})
        opts="${cmd.commands.map((c) => c.name()).join(" ")} ${cmd.options.map((o) => preferredCompletionFlag(o.flags)).join(" ")}"
        COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
        return 0
        ;;`;
}

function generatePowerShellCompletion(program: Command): string {
  const rootCmd = program.name();
  const segments: string[] = [];
  const formatPowerShellArray = (entries: string[]) =>
    entries.length > 0 ? `@(${entries.map((entry) => `'${entry}'`).join(",")})` : "@()";

  const visit = (cmd: Command, pathSegments: string[]) => {
    const fullPath = pathSegments.join(" ");

    const subCommands = cmd.commands.map((c) => c.name());
    const options = cmd.options.map((o) => preferredCompletionFlag(o.flags));
    const allCompletions = formatPowerShellArray([...subCommands, ...options]);

    if (fullPath.length > 0 && [...subCommands, ...options].length > 0) {
      segments.push(`
            if ($commandPath -eq '${fullPath}') {
                $completions = ${allCompletions}
                $completions | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)
                }
            }
`);
    }

    for (const sub of cmd.commands) {
      visit(sub, [...pathSegments, sub.name()]);
    }
  };

  visit(program, []);
  const rootBody = segments.join("");

  return `
Register-ArgumentCompleter -Native -CommandName ${rootCmd} -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $commandElements = $commandAst.CommandElements
    $commandPath = ""

    for ($i = 1; $i -lt $commandElements.Count; $i++) {
        $element = $commandElements[$i].Extent.Text
        if ($element -like "-*") { break }
        if ($i -eq $commandElements.Count - 1 -and $wordToComplete -ne "") { break }
        $commandPath += "$element "
    }
    $commandPath = $commandPath.Trim()

    if ($commandPath -eq "") {
         $completions = ${formatPowerShellArray([
           ...program.commands.map((command) => command.name()),
           ...program.options.map((option) => preferredCompletionFlag(option.flags)),
         ])}
         $completions | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)
         }
    }

    ${rootBody}
}
`;
}

function generateFishCompletion(program: Command): string {
  const rootCmd = program.name();
  const segments: string[] = [generateFishPathHelper(rootCmd)];

  const visit = (cmd: Command, parents: string[]) => {
    if (parents.length === 0) {
      for (const sub of cmd.commands) {
        segments.push(
          buildFishSubcommandCompletionLine({
            rootCmd,
            condition: "__fish_use_subcommand",
            name: sub.name(),
            description: sub.description(),
          }),
        );
      }
      for (const opt of cmd.options) {
        segments.push(
          buildFishOptionCompletionLine({
            rootCmd,
            condition: "__fish_use_subcommand",
            flags: opt.flags,
            description: opt.description,
          }),
        );
      }
    } else {
      const condition = fishCommandPathCondition(program, rootCmd, parents);
      for (const sub of cmd.commands) {
        segments.push(
          buildFishSubcommandCompletionLine({
            rootCmd,
            condition,
            name: sub.name(),
            description: sub.description(),
          }),
        );
      }
      for (const opt of cmd.options) {
        segments.push(
          buildFishOptionCompletionLine({
            rootCmd,
            condition,
            flags: opt.flags,
            description: opt.description,
          }),
        );
      }
    }

    for (const sub of cmd.commands) {
      visit(sub, parents.length === 0 ? [sub.name()] : [...parents, sub.name()]);
    }
  };

  visit(program, []);
  return segments.join("");
}

/**
 * Register the `completion` CLI command.
 *
 * 降级实现：openclaw 的 `program/command-registry-core.js`、
 * `program/program-context.js`、`program/register.subclis-core.js`、
 * `plugins/cli.js`、`logging/console.js` 未移植；这里仅注册命令占位，
 * 支持基本的 `--shell` 生成（依赖 `getCompletionScript`）与 `--install`，
 * 但跳过子命令/插件命令的 eager 注册。
 */
export function registerCompletionCli(program: Command) {
  const completionCmd = program
    .command("completion")
    .description("Generate shell completion script")
    .option("-s, --shell <shell>", "Shell to generate completion for (default: zsh)")
    .option("-i, --install", "Install completion script to shell profile")
    .option(
      "--write-state",
      "Write completion scripts to $OPENCLAW_STATE_DIR/completions (no stdout)",
    )
    .option("-y, --yes", "Skip confirmation (non-interactive)", false)
    .action(async (options) => {
      const shell = (options.shell ?? "zsh") as CompletionShell;

      if (options.install) {
        const targetShell = options.shell ?? resolveShellFromEnv();
        await installCompletion(targetShell, Boolean(options.yes), program.name());
        return;
      }

      if (options.writeState) {
        throw new Error(
          "openclaw completion --write-state: not supported in stub mode (program/registry not ported).",
        );
      }

      if (!isCompletionShell(shell)) {
        throw new Error(`Unsupported shell: ${shell}`);
      }
      if (!COMPLETION_SHELLS.includes(shell)) {
        throw new Error(`Unsupported shell: ${shell}`);
      }
      const script = getCompletionScript(shell, program);
      process.stdout.write(script + "\n");
    });
}
