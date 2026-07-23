// Audio transcode helpers run ffmpeg to convert audio for provider requirements.
// Ported from openclaw media. openclaw-specific dependencies are inlined as
// local adapters:
//   - @openclaw/media-core/file-name              → basenameFromAnyPath
//   - ../infra/fs-safe.js (writeExternalFileWithinRoot) → writeExternalFileWithinRoot
//   - ../infra/private-temp-workspace.js          → local temp-workspace stub
//   - ../infra/tmp-openclaw-dir.js                → resolvePreferredTempDir
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { tmpdir as getOsTmpDir } from "node:os";
import crypto from "node:crypto";
import { tempWorkspaceSync, withTempWorkspace } from "./temp-workspace.js";
import { runFfmpeg } from "./ffmpeg-exec.js";

const DEFAULT_OPUS_SAMPLE_RATE_HZ = 48_000;
const DEFAULT_OPUS_BITRATE = "64k";
const DEFAULT_OPUS_CHANNELS = 1;
const DEFAULT_TEMP_PREFIX = "audio-opus-";
const DEFAULT_OUTPUT_FILE_NAME = "voice.opus";
const CROSS_WMS_TMP_DIR = path.join(getOsTmpDir(), "cross-wms");

/** Returns the final filename segment for either POSIX or Windows-style paths. */
function basenameFromAnyPath(value: string): string {
  return path.win32.basename(path.posix.basename(value));
}

/** Resolves a safe cross-wms temp root, creating it if needed. */
function resolvePreferredTempDir(): string {
  try {
    if (!fs.existsSync(CROSS_WMS_TMP_DIR)) {
      fs.mkdirSync(CROSS_WMS_TMP_DIR, { recursive: true, mode: 0o700 });
    }
  } catch {
    /* fall through; tempWorkspace will surface any real errors */
  }
  return CROSS_WMS_TMP_DIR;
}

type ExternalFileWriteOptions = {
  rootDir: string;
  path: string;
  write: (tempPath: string) => Promise<void>;
};

/**
 * Writes a file under rootDir via a sibling temp path then atomic rename.
 * Trimmed from openclaw's fs-safe helper; the `write` callback receives a
 * temp path and the result is renamed into place on success.
 */
async function writeExternalFileWithinRoot(options: ExternalFileWriteOptions): Promise<string> {
  const targetPath = path.resolve(options.rootDir, options.path);
  const tempPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
  try {
    await options.write(tempPath);
    await fsp.rename(tempPath, targetPath);
  } catch (err) {
    await fsp.rm(tempPath, { force: true }).catch(() => {
      /* best-effort cleanup */
    });
    throw err;
  }
  return targetPath;
}

function normalizeAudioExtension(params: {
  inputExtension?: string;
  inputFileName?: string;
}): string {
  const fromExtension = params.inputExtension?.trim();
  const candidate = fromExtension
    ? fromExtension.startsWith(".")
      ? fromExtension
      : `.${fromExtension}`
    : path.extname(params.inputFileName ?? "");
  const normalized = candidate.toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(normalized) ? normalized : ".audio";
}

function normalizeTempPrefix(value?: string): string {
  const sanitized = value?.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!sanitized || sanitized === "." || sanitized === "..") {
    return DEFAULT_TEMP_PREFIX;
  }
  return sanitized.endsWith("-") ? sanitized : `${sanitized}-`;
}

function normalizeOutputFileName(value?: string): string {
  const baseName = basenameFromAnyPath(value?.trim() || DEFAULT_OUTPUT_FILE_NAME);
  if (/^[a-zA-Z0-9._-]{1,80}$/.test(baseName) && baseName !== "." && baseName !== "..") {
    return baseName;
  }
  return DEFAULT_OUTPUT_FILE_NAME;
}

/** Transcodes arbitrary audio input into mono Opus using a scoped temp workspace. */
export async function transcodeAudioBufferToOpus(params: {
  audioBuffer: Buffer;
  inputExtension?: string;
  inputFileName?: string;
  tempPrefix?: string;
  outputFileName?: string;
  timeoutMs?: number;
  sampleRateHz?: number;
  bitrate?: string;
  channels?: number;
}): Promise<Buffer> {
  return await withTempWorkspace(
    {
      rootDir: resolvePreferredTempDir(),
      prefix: normalizeTempPrefix(params.tempPrefix),
    },
    async (workspace) => {
      const inputPath = await workspace.write(
        `input${normalizeAudioExtension(params)}`,
        params.audioBuffer,
      );
      const outputFileName = normalizeOutputFileName(params.outputFileName);
      await writeExternalFileWithinRoot({
        rootDir: workspace.dir,
        path: outputFileName,
        write: async (outputPath) => {
          await runFfmpeg(
            [
              "-hide_banner",
              "-loglevel",
              "error",
              "-y",
              "-i",
              inputPath,
              "-vn",
              "-sn",
              "-dn",
              "-c:a",
              "libopus",
              "-b:a",
              params.bitrate ?? DEFAULT_OPUS_BITRATE,
              "-ar",
              String(params.sampleRateHz ?? DEFAULT_OPUS_SAMPLE_RATE_HZ),
              "-ac",
              String(params.channels ?? DEFAULT_OPUS_CHANNELS),
              "-f",
              "opus",
              outputPath,
            ],
            { timeoutMs: params.timeoutMs },
          );
        },
      });
      return await workspace.read(outputFileName);
    },
  );
}

/** Outcome for lightweight container transcodes that may be unsupported or intentionally skipped. */
export type AudioContainerTranscodeOutcome =
  | { ok: true; buffer: Buffer }
  | {
      ok: false;
      reason:
        | "platform-unsupported"
        | "invalid-extension"
        | "noop-same-container"
        | "no-recipe"
        | "transcoder-failed";
      detail?: string;
    };

/** Transcodes known audio container pairs, currently using macOS afconvert recipes where needed. */
export async function transcodeAudioBuffer(params: {
  audioBuffer: Buffer;
  sourceExtension: string;
  targetExtension: string;
  timeoutMs?: number;
}): Promise<AudioContainerTranscodeOutcome> {
  const source = normalizeContainerExt(params.sourceExtension);
  const target = normalizeContainerExt(params.targetExtension);
  if (!source || !target) {
    return { ok: false, reason: "invalid-extension" };
  }
  if (source === target) {
    return { ok: false, reason: "noop-same-container" };
  }
  const recipe = pickAfconvertRecipe(source, target);
  if (!recipe) {
    return { ok: false, reason: "no-recipe" };
  }
  if (process.platform !== "darwin") {
    return { ok: false, reason: "platform-unsupported" };
  }

  // afconvert is macOS-only and writes native Messages-compatible voice containers.
  const tmp = tempWorkspaceSync({
    rootDir: resolvePreferredTempDir(),
    prefix: "tts-transcode-",
  });
  const inPath = tmp.write(`in.${source}`, params.audioBuffer);
  const outPath = tmp.path(`out.${target}`);
  try {
    const result = await runAfconvert({
      args: [...recipe, inPath, outPath],
      timeoutMs: params.timeoutMs ?? 5000,
    });
    if (!result.ok) {
      return { ok: false, reason: "transcoder-failed", detail: result.detail };
    }
    return { ok: true, buffer: tmp.read(`out.${target}`) };
  } catch (err) {
    return { ok: false, reason: "transcoder-failed", detail: (err as Error).message };
  } finally {
    tmp.cleanup();
  }
}

function normalizeContainerExt(ext: string): string | undefined {
  const trimmed = ext.trim().toLowerCase().replace(/^\./, "");
  return /^[a-z0-9]{1,12}$/.test(trimmed) ? trimmed : undefined;
}

function pickAfconvertRecipe(_source: string, target: string): string[] | undefined {
  if (target === "caf") {
    // Opus-in-CAF matches native Messages voice memo attachments.
    return ["-f", "caff", "-d", "opus@24000", "-c", "1"];
  }
  return undefined;
}

function runAfconvert(params: {
  args: string[];
  timeoutMs: number;
}): Promise<{ ok: true } | { ok: false; detail: string }> {
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/afconvert", params.args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, detail: `timeout-${params.timeoutMs}ms` });
    }, params.timeoutMs);
    child.once("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, detail: err.message });
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { ok: true } : { ok: false, detail: `exit-${code ?? "unknown"}` });
    });
  });
}
