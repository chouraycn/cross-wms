import { execFile } from "child_process";
import type { HelpExtractorOptions } from "./types.js";

export async function extractHelpText(options: HelpExtractorOptions): Promise<string | null> {
  const { command, args = [], timeout = 5000 } = options;

  const helpArgs = [...args];

  if (helpArgs.length === 0) {
    helpArgs.push("--help");
  }

  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const child = execFile(command, helpArgs, (error, stdout, stderr) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error) {
        if (helpArgs[0] === "--help") {
          return resolve(extractHelpText({ command, args: ["-h"], timeout }));
        }
        return resolve(null);
      }

      const output = stdout || stderr;
      resolve(output.trim() || null);
    });

    timeoutId = setTimeout(() => {
      child.kill();
      resolve(null);
    }, timeout);
  });
}

export async function extractVersion(command: string): Promise<string | null> {
  const versionArgs = ["--version", "-v", "-version"];

  for (const arg of versionArgs) {
    try {
      const result = await extractHelpText({ command, args: [arg], timeout: 3000 });
      if (result) {
        const match = result.match(/version\s+([\d.]+)/i);
        return match ? match[1] : result.trim();
      }
    } catch {
    }
  }

  return null;
}

export async function extractCommandInfo(command: string): Promise<{
  help?: string;
  version?: string;
  exists: boolean;
}> {
  try {
    const help = await extractHelpText({ command, timeout: 3000 });
    const versionResult = help ? await extractVersion(command) : undefined;

    return {
      help: help ?? undefined,
      version: versionResult ?? undefined,
      exists: true,
    };
  } catch {
    return {
      exists: false,
    };
  }
}

export async function commandExists(command: string): Promise<boolean> {
  const result = await extractCommandInfo(command);
  return result.exists;
}