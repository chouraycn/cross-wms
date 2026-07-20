// Friendly parse-error formatter for Commander errors and root CLI recovery hints.
// 移植自 openclaw/src/cli/program/error-output.ts
//
// 降级策略：
//  - 原模块依赖 ../../../packages/terminal-core/src/{links,theme}.js；
//    cross-wms 未移植 terminal-core 包；内联降级实现（无颜色输出）。
//  - 原模块依赖 ../argv.js 的 getCommandPathWithRootOptions（已移植）。
//  - 原模块依赖 ../command-format.js 的 formatCliCommand（已移植）。
//  - 原模块依赖 ./command-suggestions.js 的 formatCliCommandSuggestions（已移植）。

import { getCommandPathWithRootOptions } from "./argv.js";
import { formatCliCommand } from "./command-format.js";
import { formatCliCommandSuggestions } from "./command-suggestions.js";

// ===== 内联 theme/link stubs（替代未移植的 terminal-core）=====
const theme = {
  error(value: string): string {
    return value;
  },
  muted(value: string): string {
    return value;
  },
  command(value: string): string {
    return value;
  },
};

function formatDocsLink(_path: string, fallback: string): string {
  return fallback;
}
// ===== stubs 结束 =====

type FormatCliParseErrorOptions = {
  argv?: string[];
};

function stripCommanderErrorPrefix(raw: string): string {
  return raw
    .trim()
    .replace(/^error:\s*/i, "")
    .trim();
}

function quote(value: string): string {
  return `"${value}"`;
}

function resolveHelpCommand(argv: string[] | undefined, options?: { root?: boolean }): string {
  if (options?.root || !argv) {
    return formatCliCommand("openclaw --help");
  }
  const commandPath = getCommandPathWithRootOptions(argv, 2);
  if (commandPath.length === 0) {
    return formatCliCommand("openclaw --help");
  }
  return formatCliCommand(`openclaw ${commandPath.join(" ")} --help`);
}

function lines(...items: Array<string | undefined>): string {
  return `${items.filter((item): item is string => Boolean(item)).join("\n")}\n`;
}

function formatHelpHint(argv: string[] | undefined, options?: { root?: boolean }): string {
  return `${theme.muted("Try:")} ${theme.command(resolveHelpCommand(argv, options))}`;
}

function formatDocsHint(): string {
  return `${theme.muted("Docs:")} ${formatDocsLink("/cli", "docs.openclaw.ai/cli")}`;
}

/** Convert Commander parse errors into OpenClaw-specific help and docs guidance. */
export function formatCliParseErrorOutput(
  raw: string,
  options: FormatCliParseErrorOptions = {},
): string {
  const message = stripCommanderErrorPrefix(raw);
  const unknownCommand = message.match(/^unknown command ['"`](.+?)['"`]/i);
  if (unknownCommand) {
    const command = unknownCommand[1] ?? "";
    return lines(
      theme.error(`OpenClaw does not know the command ${quote(command)}.`),
      formatCliCommandSuggestions(command),
      formatHelpHint(options.argv, { root: true }),
      `${theme.muted("Plugin command?")} ${theme.command(formatCliCommand("openclaw plugins list"))}`,
      formatDocsHint(),
    );
  }

  const unknownOption = message.match(/^unknown option ['"`](.+?)['"`]/i);
  if (unknownOption) {
    const option = unknownOption[1] ?? "";
    return lines(
      theme.error(`OpenClaw does not recognize option ${quote(option)}.`),
      formatHelpHint(options.argv),
    );
  }

  const missingArgument = message.match(/^missing required argument ['"`](.+?)['"`]/i);
  if (missingArgument) {
    const argument = missingArgument[1] ?? "";
    return lines(
      theme.error(`Missing required argument ${quote(argument)}.`),
      formatHelpHint(options.argv),
    );
  }

  const missingOption = message.match(/^required option ['"`](.+?)['"`] not specified/i);
  if (missingOption) {
    const option = missingOption[1] ?? "";
    return lines(
      theme.error(`Missing required option ${quote(option)}.`),
      formatHelpHint(options.argv),
    );
  }

  if (/^too many arguments\b/i.test(message)) {
    return lines(theme.error("Too many arguments for this command."), formatHelpHint(options.argv));
  }

  return lines(
    theme.error(`OpenClaw could not parse this command: ${message}`),
    formatHelpHint(options.argv),
  );
}
