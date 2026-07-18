import type { ParsedArg, ArgsParseResult } from "./types.js";

export function parseCommandArgs(commandLine: string): ArgsParseResult {
  const tokens = splitShellArgs(commandLine);
  const errors: string[] = [];

  if (tokens.length === 0) {
    return {
      command: "",
      args: [],
      rawArgs: [],
      errors: ["Empty command line"],
    };
  }

  const command = tokens[0];
  const rawArgs = tokens.slice(1);
  const args: ParsedArg[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    const parsed = parseSingleArg(arg, i);
    args.push(parsed);

    if (parsed.type === "option" && parsed.value === undefined && i + 1 < rawArgs.length) {
      const nextArg = rawArgs[i + 1];
      if (!nextArg.startsWith("-")) {
        parsed.value = nextArg;
        i++;
      }
    }
  }

  return {
    command,
    args,
    rawArgs,
    errors,
  };
}

export function parseShellCommand(commandLine: string): ArgsParseResult {
  return parseCommandArgs(commandLine);
}

function splitShellArgs(commandLine: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (let i = 0; i < commandLine.length; i++) {
    const char = commandLine[i];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if ((char === " " || char === "\t") && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function parseSingleArg(arg: string, index: number): ParsedArg {
  if (arg.startsWith("--")) {
    const [name, value] = arg.slice(2).split("=");
    return {
      type: "option",
      name,
      value: value ?? undefined,
      raw: arg,
      index,
    };
  }

  if (arg.startsWith("-") && arg.length > 1) {
    if (arg.length === 2) {
      return {
        type: "flag",
        name: arg.slice(1),
        raw: arg,
        index,
      };
    }

    const flag = arg.slice(1, 2);
    const rest = arg.slice(2);

    if (rest.startsWith("=")) {
      return {
        type: "option",
        name: flag,
        value: rest.slice(1),
        raw: arg,
        index,
      };
    }

    if (/^[0-9]/.test(rest)) {
      return {
        type: "option",
        name: flag,
        value: rest,
        raw: arg,
        index,
      };
    }

    return {
      type: "flag",
      name: arg.slice(1),
      raw: arg,
      index,
    };
  }

  return {
    type: "positional",
    name: arg,
    raw: arg,
    index,
  };
}

export function getFlagValue(args: ParsedArg[], flag: string): string | undefined {
  const arg = args.find((a) => a.type === "flag" && a.name === flag);
  if (arg && arg.value) return arg.value;

  const option = args.find((a) => a.type === "option" && a.name === flag);
  return option?.value;
}

export function hasFlag(args: ParsedArg[], flag: string): boolean {
  return args.some((a) => (a.type === "flag" || a.type === "option") && a.name === flag);
}

export function getPositionalArgs(args: ParsedArg[]): string[] {
  return args.filter((a) => a.type === "positional").map((a) => a.name);
}

export function buildArgv(parsed: ArgsParseResult): string[] {
  const result: string[] = [parsed.command];

  for (const arg of parsed.args) {
    if (arg.type === "flag") {
      result.push(`-${arg.name}`);
    } else if (arg.type === "option") {
      if (arg.value !== undefined) {
        if (arg.name.length === 1) {
          result.push(`-${arg.name}${arg.value}`);
        } else {
          result.push(`--${arg.name}=${arg.value}`);
        }
      } else {
        result.push(`--${arg.name}`);
      }
    } else if (arg.type === "positional") {
      result.push(arg.name);
    }
  }

  return result;
}