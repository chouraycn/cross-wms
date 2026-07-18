// Provides stricter filesystem helpers for canonical path and symlink-sensitive operations.
// 降级实现：从本地 _fs-safe-stubs.ts 重新导出，替代 @openclaw/fs-safe/advanced。
import "./_fs-safe-stubs.js";

export {
  assertNoPathAliasEscape,
  basenameFromMediaSource,
  hasEncodedFileUrlSeparator,
  isWindowsNetworkPath,
  assertNoWindowsNetworkPath,
  safeFileURLToPath,
  trySafeFileURLToPath,
  writeSiblingTempFile,
  type WriteSiblingTempFileOptions,
  type WriteSiblingTempFileResult,
} from "./_fs-safe-stubs.js";

// 高级 fs-safe 辅助：symlink/hardlink/sibling-temp 保护。
// 以下 API 在降级 stub 中未实现，调用时抛出明确错误。
export function assertNoHardlinkedFinalPath(_filePath: string): void {
  throw new Error("assertNoHardlinkedFinalPath stub: fs-safe/advanced hardlink guard not ported");
}

export function assertNoSymlinkParents(_filePath: string): Promise<void> {
  return Promise.reject(
    new Error("assertNoSymlinkParents stub: fs-safe/advanced symlink guard not ported"),
  );
}

export function assertNoSymlinkParentsSync(_filePath: string): void {
  throw new Error("assertNoSymlinkParentsSync stub: fs-safe/advanced symlink guard not ported");
}

export function sameFileIdentity(_left: string, _right: string): Promise<boolean> {
  return Promise.resolve(false);
}

export function sanitizeUntrustedFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}

export function writeViaSiblingTempPath(_options: {
  filePath: string;
  content: string | Buffer;
  mode?: number;
}): Promise<string> {
  return Promise.reject(
    new Error("writeViaSiblingTempPath stub: fs-safe/advanced not ported"),
  );
}

export type AssertNoSymlinkParentsOptions = {
  rootDir?: string;
  allowSymlinkInRoot?: boolean;
};

export type FileIdentityStat = {
  dev: number;
  ino: number;
};

/** 格式化 POSIX 文件模式（降级 stub） */
export function formatPosixMode(mode: number): string {
  return (mode & 0o777).toString(8);
}
