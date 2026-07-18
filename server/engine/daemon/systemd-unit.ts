/**
 * systemd unit 文件生成与解析。
 */
import type { GatewayServiceEnvironmentValueSource } from "./service-types.js";

export function quoteSystemdArg(value: string): string {
  if (value === "") return '""';
  if (/[\s"\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function quoteSystemdValue(value: string): string {
  if (/[\s"\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function buildSystemdUnit({
  unitName,
  description,
  programArguments,
  workingDirectory,
  stdoutPath,
  stderrPath,
  environment,
  environmentFiles,
  restart,
  restartDelaySec,
  after,
  wants,
  killMode,
}: {
  unitName: string;
  description?: string;
  programArguments: string[];
  workingDirectory?: string;
  stdoutPath: string;
  stderrPath: string;
  environment?: Record<string, string | undefined>;
  environmentFiles?: string[];
  restart?: boolean;
  restartDelaySec?: number;
  after?: string[];
  wants?: string[];
  killMode?: string;
}): string {
  const lines: string[] = [];
  lines.push("[Unit]");
  lines.push(`Description=${description || unitName}`);
  if (after && after.length > 0) {
    lines.push(`After=${after.join(" ")}`);
  } else {
    lines.push("After=network.target");
  }
  if (wants && wants.length > 0) {
    lines.push(`Wants=${wants.join(" ")}`);
  }
  lines.push("");
  lines.push("[Service]");
  lines.push("Type=simple");
  lines.push(`ExecStart=${programArguments.map(quoteSystemdArg).join(" ")}`);
  if (workingDirectory) {
    lines.push(`WorkingDirectory=${workingDirectory}`);
  }
  lines.push(`Restart=${restart === false ? "no" : "always"}`);
  if (restartDelaySec !== undefined && restartDelaySec > 0) {
    lines.push(`RestartSec=${Math.max(1, restartDelaySec)}`);
  }
  if (killMode) {
    lines.push(`KillMode=${killMode}`);
  }
  if (environmentFiles && environmentFiles.length > 0) {
    for (const file of environmentFiles) {
      lines.push(`EnvironmentFile=-${file}`);
    }
  } else if (environment) {
    for (const [k, v] of Object.entries(environment)) {
      if (v !== undefined && v.trim()) {
        lines.push(`Environment=${k}=${quoteSystemdValue(v)}`);
      }
    }
  }
  lines.push(`StandardOutput=append:${stdoutPath}`);
  lines.push(`StandardError=append:${stderrPath}`);
  lines.push("");
  lines.push("[Install]");
  lines.push("WantedBy=default.target");
  return `${lines.join("\n")}\n`;
}

export function parseSystemdUnit(content: string): {
  description?: string;
  after: Set<string>;
  wants: Set<string>;
  execStart?: string;
  workingDirectory?: string;
  restart?: string;
  restartSec?: string;
  killMode?: string;
  environment: Record<string, string>;
  environmentFiles: string[];
  standardOutput?: string;
  standardError?: string;
} {
  const result = {
    after: new Set<string>(),
    wants: new Set<string>(),
    environment: {} as Record<string, string>,
    environmentFiles: [] as string[],
  };

  let currentSection = "";

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#") || line.startsWith(";")) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1);
      continue;
    }

    const idx = line.indexOf("=");
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!value) continue;

    switch (key) {
      case "Description":
        (result as { description?: string }).description = value;
        break;
      case "After":
        for (const entry of value.split(/\s+/)) {
          if (entry) result.after.add(entry);
        }
        break;
      case "Wants":
        for (const entry of value.split(/\s+/)) {
          if (entry) result.wants.add(entry);
        }
        break;
      case "ExecStart":
        (result as { execStart?: string }).execStart = value;
        break;
      case "WorkingDirectory":
        (result as { workingDirectory?: string }).workingDirectory = value;
        break;
      case "Restart":
        (result as { restart?: string }).restart = value;
        break;
      case "RestartSec":
        (result as { restartSec?: string }).restartSec = value;
        break;
      case "KillMode":
        (result as { killMode?: string }).killMode = value;
        break;
      case "Environment": {
        const envMatch = value.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (envMatch) {
          const envKey = envMatch[1];
          let envValue = envMatch[2];
          if (envValue.startsWith('"') && envValue.endsWith('"')) {
            envValue = envValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
          }
          result.environment[envKey] = envValue;
        }
        break;
      }
      case "EnvironmentFile": {
        const file = value.startsWith("-") ? value.slice(1) : value;
        result.environmentFiles.push(file);
        break;
      }
      case "StandardOutput":
        (result as { standardOutput?: string }).standardOutput = value;
        break;
      case "StandardError":
        (result as { standardError?: string }).standardError = value;
        break;
    }
  }

  return result;
}

export function extractExecStartArgs(execStart: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  let i = 0;

  while (i < execStart.length) {
    const char = execStart[i];

    if (char === "\\" && i + 1 < execStart.length && inQuotes) {
      const next = execStart[i + 1];
      if (next === '"' || next === "\\") {
        current += next;
        i += 2;
        continue;
      }
    }

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
      i++;
      continue;
    }

    if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = "";
      i++;
      continue;
    }

    if (/\s/.test(char) && !inQuotes) {
      if (current) {
        args.push(current);
        current = "";
      }
      i++;
      continue;
    }

    current += char;
    i++;
  }

  if (current) {
    args.push(current);
  }

  return args;
}
