// 检测并解码 Windows 控制台输出编码。
import { spawnSync } from "node:child_process";
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";
import { getWindowsCmdExePath } from "./windows-install-roots.js";

const WINDOWS_CODEPAGE_ENCODING_MAP: Record<number, string> = {
  65001: "utf-8",
  54936: "gb18030",
  874: "windows-874",
  936: "gbk",
  950: "big5",
  932: "shift_jis",
  949: "euc-kr",
  1250: "windows-1250",
  1251: "windows-1251",
  1252: "windows-1252",
  1253: "windows-1253",
  1254: "windows-1254",
  1255: "windows-1255",
  1256: "windows-1256",
  1257: "windows-1257",
  1258: "windows-1258",
};

let cachedWindowsConsoleEncoding: string | null | undefined;
let cachedWindowsSystemEncoding: string | null | undefined;

/** 从本地化的 chcp 输出中提取 Windows 控制台代码页编号 */
export function parseWindowsCodePage(raw: string): number | null {
  if (!raw) {
    return null;
  }
  const match = raw.match(/\b(\d{3,5})\b/);
  if (!match?.[1]) {
    return null;
  }
  const codePage = Number.parseInt(match[1], 10);
  if (!Number.isFinite(codePage) || codePage <= 0) {
    return null;
  }
  return codePage;
}

/** 解析并缓存当前 Windows 控制台编码，用于子进程输出 */
export function resolveWindowsConsoleEncoding(): string | null {
  if (process.platform !== "win32") {
    return null;
  }
  if (cachedWindowsConsoleEncoding !== undefined) {
    return cachedWindowsConsoleEncoding;
  }
  try {
    const result = spawnSync(getWindowsCmdExePath(), ["/d", "/s", "/c", "chcp"], {
      windowsHide: true,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const raw = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const codePage = parseWindowsCodePage(raw);
    cachedWindowsConsoleEncoding =
      codePage !== null ? (WINDOWS_CODEPAGE_ENCODING_MAP[codePage] ?? null) : null;
  } catch {
    cachedWindowsConsoleEncoding = null;
  }
  return cachedWindowsConsoleEncoding;
}

/** 解析并缓存 Windows 系统编码（旧式文本文件使用） */
export function resolveWindowsSystemEncoding(): string | null {
  if (process.platform !== "win32") {
    return null;
  }
  if (cachedWindowsSystemEncoding !== undefined) {
    return cachedWindowsSystemEncoding;
  }
  try {
    const result = spawnSync(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "[Text.Encoding]::Default.CodePage"],
      {
        windowsHide: true,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const raw = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const codePage = parseWindowsCodePage(raw);
    cachedWindowsSystemEncoding =
      codePage !== null ? (WINDOWS_CODEPAGE_ENCODING_MAP[codePage] ?? null) : null;
  } catch {
    cachedWindowsSystemEncoding = null;
  }
  return cachedWindowsSystemEncoding;
}

/** 解码单个完整的子进程输出缓冲区，优先使用合法 UTF-8，其次回退到旧式代码页 */
export function decodeWindowsOutputBuffer(params: {
  buffer: Buffer;
  platform?: NodeJS.Platform;
  windowsEncoding?: string | null;
}): string {
  return decodeWindowsBufferWithFallback({
    ...params,
    resolveFallbackEncoding: () => params.windowsEncoding ?? resolveWindowsConsoleEncoding(),
  });
}

/** 解码文本文件，优先使用合法 UTF-8，其次回退到 Windows 系统编码 */
export function decodeWindowsTextFileBuffer(params: {
  buffer: Buffer;
  platform?: NodeJS.Platform;
  windowsEncoding?: string | null;
}): string {
  return decodeWindowsBufferWithFallback({
    ...params,
    resolveFallbackEncoding: () => params.windowsEncoding ?? resolveWindowsSystemEncoding(),
  });
}

function decodeWindowsBufferWithFallback(params: {
  buffer: Buffer;
  platform?: NodeJS.Platform;
  resolveFallbackEncoding: () => string | null;
}): string {
  const platform = params.platform ?? process.platform;
  if (platform !== "win32") {
    return params.buffer.toString("utf8");
  }

  const utf8 = decodeStrictUtf8(params.buffer);
  if (utf8 !== null) {
    return utf8;
  }

  const encoding = params.resolveFallbackEncoding();
  if (!encoding || normalizeLowercaseStringOrEmpty(encoding) === "utf-8") {
    return params.buffer.toString("utf8");
  }
  try {
    return new TextDecoder(encoding).decode(params.buffer);
  } catch {
    return params.buffer.toString("utf8");
  }
}

/** 为可能拆分多字节字符的子进程输出块创建流式解码器 */
export function createWindowsOutputDecoder(params?: {
  platform?: NodeJS.Platform;
  windowsEncoding?: string | null;
}): {
  decode(chunk: Buffer | string): string;
  flush(): string;
} {
  const platform = params?.platform ?? process.platform;
  const encoding =
    platform === "win32" ? (params?.windowsEncoding ?? resolveWindowsConsoleEncoding()) : null;
  const normalizedEncoding = normalizeLowercaseStringOrEmpty(encoding);
  const legacyDecoder =
    platform === "win32" && encoding && normalizedEncoding !== "utf-8"
      ? new TextDecoder(encoding)
      : null;
  const utf8Decoder =
    platform === "win32" && legacyDecoder ? new TextDecoder("utf-8", { fatal: true }) : null;
  let useLegacyDecoder = false;
  let pendingUtf8Bytes = Buffer.alloc(0);

  return {
    decode(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (!legacyDecoder || !utf8Decoder) {
        return buffer.toString("utf8");
      }
      if (useLegacyDecoder) {
        return legacyDecoder.decode(buffer, { stream: true });
      }
      // 在严格 UTF-8 失败前保持该模式；通过旧式解码器重放任何待处理的前导字节，
      // 避免在回退边界处丢失拆分的 GBK/Big5 等字符。
      const replayBuffer =
        pendingUtf8Bytes.length > 0 ? Buffer.concat([pendingUtf8Bytes, buffer]) : buffer;
      try {
        const decoded = utf8Decoder.decode(buffer, { stream: true });
        pendingUtf8Bytes = Buffer.from(getTrailingIncompleteUtf8Bytes(replayBuffer));
        return decoded;
      } catch {
        useLegacyDecoder = true;
        pendingUtf8Bytes = Buffer.alloc(0);
        return legacyDecoder.decode(replayBuffer, { stream: true });
      }
    },
    flush() {
      if (!legacyDecoder || !utf8Decoder) {
        return "";
      }
      if (useLegacyDecoder) {
        return legacyDecoder.decode();
      }
      try {
        const decoded = utf8Decoder.decode();
        pendingUtf8Bytes = Buffer.alloc(0);
        return decoded;
      } catch {
        useLegacyDecoder = true;
        const replayBuffer = pendingUtf8Bytes;
        pendingUtf8Bytes = Buffer.alloc(0);
        return replayBuffer.length > 0 ? legacyDecoder.decode(replayBuffer) : "";
      }
    },
  };
}

function getTrailingIncompleteUtf8Bytes(buffer: Buffer): Buffer {
  let index = buffer.length - 1;
  let continuationBytes = 0;
  while (
    index >= 0 &&
    buffer[index] !== undefined &&
    buffer[index] >= 0x80 &&
    buffer[index] <= 0xbf &&
    continuationBytes < 3
  ) {
    continuationBytes += 1;
    index -= 1;
  }
  if (index < 0) {
    return buffer;
  }

  const leadByte = buffer[index];
  const sequenceLength = getUtf8SequenceLength(leadByte);
  if (sequenceLength <= 1) {
    return Buffer.alloc(0);
  }

  const availableBytes = continuationBytes + 1;
  return availableBytes < sequenceLength ? buffer.subarray(index) : Buffer.alloc(0);
}

function getUtf8SequenceLength(byte: number): number {
  if (byte >= 0xc2 && byte <= 0xdf) {
    return 2;
  }
  if (byte >= 0xe0 && byte <= 0xef) {
    return 3;
  }
  if (byte >= 0xf0 && byte <= 0xf4) {
    return 4;
  }
  return 1;
}

function decodeStrictUtf8(buffer: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}
