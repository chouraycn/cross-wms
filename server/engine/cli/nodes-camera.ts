// Camera payload validation and artifact writers for node media commands.
// 移植自 openclaw/src/cli/nodes-camera.ts。
//
// 降级策略：
//  - 原模块依赖 `../infra/errors.js` 的 `toErrorObject`、
//    `../infra/net/fetch-guard.js` 的 `fetchWithSsrFGuard`、
//    `../infra/net/hostname.js` 的 `normalizeHostname`、
//    `../infra/parse-finite-number.js` 的 `parseStrictNonNegativeInteger`。
//    这些模块在 cross-wms 中尚未移植；URL 下载相关函数降级为抛出
//    "not supported" 错误，base64 写入仍可用，保留函数签名以便未来替换。
//  - 函数签名与导出保持与原模块一致。

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveCliName } from "./cli-name.js";
import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  resolveTempPathParts,
} from "./nodes-media-utils.js";

const MAX_CAMERA_URL_DOWNLOAD_BYTES = 250 * 1024 * 1024;
const MAX_CAMERA_BASE64_BYTES = MAX_CAMERA_URL_DOWNLOAD_BYTES;

/** Camera orientation accepted by node camera commands. */
export type CameraFacing = "front" | "back";

/** Validated still-image payload from `nodes camera snap`. */
export type CameraSnapPayload = {
  format: string;
  base64?: string;
  url?: string;
  width: number;
  height: number;
};

/** Validated video payload from `nodes camera clip`. */
export type CameraClipPayload = {
  format: string;
  base64?: string;
  url?: string;
  durationMs: number;
  hasAudio: boolean;
};

/** Validate and normalize an unknown camera still-image payload. */
export function parseCameraSnapPayload(value: unknown): CameraSnapPayload {
  const obj = asRecord(value);
  const format = asString(obj.format);
  const base64 = asString(obj.base64);
  const url = asString(obj.url);
  const width = asNumber(obj.width);
  const height = asNumber(obj.height);
  if (!format || (!base64 && !url) || width === undefined || height === undefined) {
    throw new Error("invalid camera.snap payload");
  }
  return { format, ...(base64 ? { base64 } : {}), ...(url ? { url } : {}), width, height };
}

/** Validate and normalize an unknown camera clip payload. */
export function parseCameraClipPayload(value: unknown): CameraClipPayload {
  const obj = asRecord(value);
  const format = asString(obj.format);
  const base64 = asString(obj.base64);
  const url = asString(obj.url);
  const durationMs = asNumber(obj.durationMs);
  const hasAudio = asBoolean(obj.hasAudio);
  if (!format || (!base64 && !url) || durationMs === undefined || hasAudio === undefined) {
    throw new Error("invalid camera.clip payload");
  }
  return { format, ...(base64 ? { base64 } : {}), ...(url ? { url } : {}), durationMs, hasAudio };
}

/** Build a deterministic temp path for a camera artifact. */
export function cameraTempPath(opts: {
  kind: "snap" | "clip";
  facing?: CameraFacing;
  ext: string;
  tmpDir?: string;
  id?: string;
}) {
  const { tmpDir, id, ext } = resolveTempPathParts({
    tmpDir: opts.tmpDir,
    id: opts.id,
    ext: opts.ext,
  });
  const facingPart = opts.facing ? `-${opts.facing}` : "";
  const cliName = resolveCliName();
  return path.join(tmpDir, `${cliName}-camera-${opts.kind}${facingPart}-${id}${ext}`);
}

/**
 * Download a node-hosted media URL to disk.
 *
 * 降级实现：openclaw 的 `infra/net/fetch-guard.js`、`infra/net/hostname.js`、
 * `infra/parse-finite-number.js`、`infra/errors.js` 未移植。这里抛出
 * "not supported" 错误，保留函数签名以便未来替换为正式实现。
 */
export async function writeUrlToFile(
  _filePath: string,
  _url: string,
  _opts: { expectedHost: string },
): Promise<{ path: string; bytes: number }> {
  throw new Error(
    "writeUrlToFile: gateway-guarded download not supported in stub mode (fetch-guard/hostname/parse-finite-number not ported).",
  );
}

function estimateDecodedBase64Bytes(base64: string): number {
  const normalized = base64.replace(/\s+/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

/** Decode a base64 media payload to disk with preflight and post-decode size checks. */
export async function writeBase64ToFile(
  filePath: string,
  base64: string,
  opts: { maxBytes?: number } = {},
) {
  const maxBytes = opts.maxBytes ?? MAX_CAMERA_BASE64_BYTES;
  if (estimateDecodedBase64Bytes(base64) > maxBytes) {
    throw new Error(`writeBase64ToFile: decoded payload exceeds max ${maxBytes}`);
  }
  const buf = Buffer.from(base64, "base64");
  if (buf.length > maxBytes) {
    throw new Error(`writeBase64ToFile: decoded ${buf.length} bytes, exceeds max ${maxBytes}`);
  }
  await fs.writeFile(filePath, buf);
  return { path: filePath, bytes: buf.length };
}

/** Require the node remote IP needed to validate URL-backed camera payloads. */
export function requireNodeRemoteIp(remoteIp?: string): string {
  const normalized = remoteIp?.trim();
  if (!normalized) {
    throw new Error("camera URL payload requires node remoteIp");
  }
  return normalized;
}

/** Write either a URL-backed or base64-backed camera payload to disk. */
export async function writeCameraPayloadToFile(params: {
  filePath: string;
  payload: { url?: string; base64?: string };
  expectedHost?: string;
  invalidPayloadMessage?: string;
}) {
  if (params.payload.url) {
    await writeUrlToFile(params.filePath, params.payload.url, {
      expectedHost: requireNodeRemoteIp(params.expectedHost),
    });
    return;
  }
  if (params.payload.base64) {
    await writeBase64ToFile(params.filePath, params.payload.base64);
    return;
  }
  throw new Error(params.invalidPayloadMessage ?? "invalid camera payload");
}

/** Write a camera clip payload to a generated temp file and return its path. */
export async function writeCameraClipPayloadToFile(params: {
  payload: CameraClipPayload;
  facing: CameraFacing;
  tmpDir?: string;
  id?: string;
  expectedHost?: string;
}): Promise<string> {
  const filePath = cameraTempPath({
    kind: "clip",
    facing: params.facing,
    ext: params.payload.format,
    tmpDir: params.tmpDir,
    id: params.id,
  });
  await writeCameraPayloadToFile({
    filePath,
    payload: params.payload,
    expectedHost: params.expectedHost,
    invalidPayloadMessage: "invalid camera.clip payload",
  });
  return filePath;
}
