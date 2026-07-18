/**
 * 程序参数构建。
 */
import path from "node:path";
import { resolveDaemonEntry } from "./cmd-argv.js";

export interface ProgramArgsOptions {
  command?: string;
  entry?: string;
  args?: string[];
  extraNodeArgs?: string[];
}

export function buildProgramArgs(options: ProgramArgsOptions = {}): string[] {
  const entry = resolveDaemonEntry(options.entry);
  const extraArgs = options.args ?? [];
  const extraNodeArgs = options.extraNodeArgs ?? [];

  if (options.command) {
    return [options.command, ...extraNodeArgs, entry, ...extraArgs];
  }

  if (entry.toLowerCase().endsWith(".ts")) {
    return [process.execPath, ...extraNodeArgs, "--import", "tsx", entry, ...extraArgs];
  }

  return [process.execPath, ...extraNodeArgs, entry, ...extraArgs];
}

export function parseProgramArgs(args: string[]): {
  command: string;
  nodeArgs: string[];
  entry?: string;
  scriptArgs: string[];
} {
  if (args.length === 0) {
    return { command: process.execPath, nodeArgs: [], scriptArgs: [] };
  }

  const command = args[0];
  const nodeArgs: string[] = [];
  let entryIndex = 1;

  while (entryIndex < args.length) {
    const arg = args[entryIndex];
    if (arg.startsWith("--") || arg === "-r" || arg === "-e" || arg === "-p") {
      nodeArgs.push(arg);
      if ((arg === "--import" || arg === "-r") && entryIndex + 1 < args.length) {
        nodeArgs.push(args[entryIndex + 1]);
        entryIndex += 2;
        continue;
      }
      entryIndex++;
      continue;
    }
    break;
  }

  const entry = args[entryIndex];
  const scriptArgs = args.slice(entryIndex + 1);

  return {
    command,
    nodeArgs,
    entry,
    scriptArgs,
  };
}

export function resolveEntryFromArgs(args: string[]): string | undefined {
  const parsed = parseProgramArgs(args);
  return parsed.entry;
}

export function isTsEntry(entry?: string): boolean {
  if (!entry) return false;
  return entry.toLowerCase().endsWith(".ts");
}

export function resolveEntryBasename(entry?: string): string | undefined {
  if (!entry) return undefined;
  return path.basename(entry);
}
