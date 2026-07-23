// FFmpeg exec helpers run ffmpeg and ffprobe with normalized errors.
// Ported from openclaw media. openclaw-specific dependencies are inlined as
// local adapters:
//   - @openclaw/normalization-core/string-coerce  → ./string-helpers.js
//   - ../infra/errors.js (toErrorObject)          → toErrorObject
//   - ../infra/resolve-system-bin.js              → resolveSystemBin (trimmed)
import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import {
  MEDIA_FFMPEG_MAX_BUFFER_BYTES,
  MEDIA_FFMPEG_TIMEOUT_MS,
  MEDIA_FFPROBE_TIMEOUT_MS,
} from "./ffmpeg-limits.js";
import { normalizeLowercaseStringOrEmpty } from "./string-helpers.js";

const execFileAsync = promisify(execFile);

/** Process limits and optional stdin payload for ffmpeg/ffprobe helper calls. */
export type MediaExecOptions = {
  timeoutMs?: number;
  maxBufferBytes?: number;
  input?: Buffer | string;
};

/** Normalizes a non-Error rejection into an Error, preserving useful props. */
function toErrorObject(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === "string") {
    return new Error(value);
  }
  const error = new Error(fallbackMessage, { cause: value });
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
    Object.assign(error, value);
  }
  return error;
}

type SystemBinTrust = "strict" | "standard";

// Unix directories where OS-managed or system-installed binaries live.
const UNIX_BASE_TRUSTED_DIRS = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"] as const;
// Package-manager directories appended in "standard" trust on macOS/Linux.
const DARWIN_STANDARD_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"] as const;
const LINUX_STANDARD_DIRS = ["/usr/local/bin"] as const;
const WIN_PATEXT = [".exe", ".cmd", ".bat", ".com"] as const;

function defaultIsExecutable(filePath: string): boolean {
  try {
    if (process.platform === "win32") {
      fs.accessSync(filePath, fs.constants.R_OK);
    } else {
      fs.accessSync(filePath, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a binary name to an absolute path by searching only trusted system
 * directories. Returns `null` when not found. Trimmed from openclaw's
 * resolve-system-bin (drops Windows Program Files scanning and caching) while
 * preserving the trusted-dir-only resolution used to prevent PATH hijacking.
 */
function resolveSystemBin(
  name: string,
  opts?: { trust?: SystemBinTrust; extraDirs?: readonly string[] },
): string | null {
  const trust = opts?.trust ?? "strict";
  const dirs: string[] = [...UNIX_BASE_TRUSTED_DIRS];
  if (trust === "standard") {
    if (process.platform === "darwin") {
      dirs.push(...DARWIN_STANDARD_DIRS);
    } else if (process.platform === "linux") {
      dirs.push(...LINUX_STANDARD_DIRS);
    }
  }
  dirs.push(...(opts?.extraDirs ?? []));

  const isWin = process.platform === "win32";
  for (const dir of dirs) {
    if (isWin) {
      for (const ext of WIN_PATEXT) {
        const candidate = path.win32.join(dir, name + ext);
        if (defaultIsExecutable(candidate)) {
          return candidate;
        }
      }
    } else {
      const candidate = path.join(dir, name);
      if (defaultIsExecutable(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function resolveExecOptions(
  defaultTimeoutMs: number,
  options: MediaExecOptions | undefined,
): ExecFileOptions {
  return {
    timeout: options?.timeoutMs ?? defaultTimeoutMs,
    maxBuffer: options?.maxBufferBytes ?? MEDIA_FFMPEG_MAX_BUFFER_BYTES,
  };
}

function requireSystemBin(name: string): string {
  const resolved = resolveSystemBin(name, { trust: "standard" });
  if (!resolved) {
    const hint =
      process.platform === "darwin"
        ? "e.g. brew install ffmpeg"
        : "e.g. apt install ffmpeg / dnf install ffmpeg";
    throw new Error(
      `${name} not found in trusted system directories. ` +
        `Install it via your system package manager (${hint}).`,
    );
  }
  return resolved;
}

/** Resolves ffmpeg from trusted system paths before command execution. */
export function resolveFfmpegBin(): string {
  return requireSystemBin("ffmpeg");
}

function isBrokenPipeError(error: Error): boolean {
  return (error as NodeJS.ErrnoException).code === "EPIPE";
}

/** Runs ffprobe with optional stdin input, ignoring benign stdin EPIPE after successful output. */
export async function runFfprobe(args: string[], options?: MediaExecOptions): Promise<string> {
  const execOptions = resolveExecOptions(MEDIA_FFPROBE_TIMEOUT_MS, options);
  if (options?.input == null) {
    const { stdout } = await execFileAsync(requireSystemBin("ffprobe"), args, execOptions);
    return stdout.toString();
  }

  return await new Promise<string>((resolve, reject) => {
    let stdinWriteError: Error | undefined;
    const proc = execFile(requireSystemBin("ffprobe"), args, execOptions, (err, stdout) => {
      if (err) {
        reject(toErrorObject(err, "Non-Error rejection"));
        return;
      }
      if (stdinWriteError && !isBrokenPipeError(stdinWriteError)) {
        reject(stdinWriteError);
        return;
      }
      resolve(stdout.toString());
    });
    proc.stdin?.once("error", (err: Error) => {
      stdinWriteError = err;
    });
    proc.stdin?.end(options.input);
  });
}

/** Runs ffmpeg with bounded timeout and buffer settings. */
export async function runFfmpeg(args: string[], options?: MediaExecOptions): Promise<string> {
  const { stdout } = await execFileAsync(
    resolveFfmpegBin(),
    args,
    resolveExecOptions(MEDIA_FFMPEG_TIMEOUT_MS, options),
  );
  return stdout.toString();
}

/** Splits ffprobe CSV-ish output into normalized lowercase fields. */
export function parseFfprobeCsvFields(stdout: string, maxFields: number): string[] {
  return stdout
    .trim()
    .split(/[,\r\n]+/, maxFields)
    .map((field) => normalizeLowercaseStringOrEmpty(field));
}

function parseFfprobeSampleRateHz(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  const sampleRate = Number(value);
  return Number.isSafeInteger(sampleRate) && sampleRate > 0 ? sampleRate : null;
}

/** Parses codec and positive sample rate from compact ffprobe stream output. */
export function parseFfprobeCodecAndSampleRate(stdout: string): {
  codec: string | null;
  sampleRateHz: number | null;
} {
  const [codecRaw, sampleRateRaw] = parseFfprobeCsvFields(stdout, 2);
  const codec = codecRaw ? codecRaw : null;
  return {
    codec,
    sampleRateHz: parseFfprobeSampleRateHz(sampleRateRaw),
  };
}
