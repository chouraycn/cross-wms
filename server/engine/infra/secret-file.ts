// 通过 fs-safe 默认值暴露私有密钥文件辅助。
// 降级实现：openclaw 中从 @openclaw/fs-safe/secret 导入，
// cross-wms 在 _fs-safe-stubs 中提供真实实现。
// ../utils.js 的 resolveUserPath 也在 _fs-safe-stubs 中提供。
import "./fs-safe-defaults.js";
import {
  DEFAULT_SECRET_FILE_MAX_BYTES,
  PRIVATE_SECRET_DIR_MODE,
  PRIVATE_SECRET_FILE_MODE,
  readSecretFileSync as readSecretFileSyncImpl,
  tryReadSecretFileSync,
  writeSecretFileAtomic as writePrivateSecretFileAtomic,
  type SecretFileReadOptions,
  resolveUserPath,
} from "./_fs-safe-stubs.js";

export {
  DEFAULT_SECRET_FILE_MAX_BYTES,
  PRIVATE_SECRET_DIR_MODE,
  PRIVATE_SECRET_FILE_MODE,
  readSecretFileSyncImpl as readSecretFileSync,
  tryReadSecretFileSync,
  type SecretFileReadOptions,
};
export { writePrivateSecretFileAtomic };

export type SecretFileReadResult =
  | {
      ok: true;
      secret: string;
      resolvedPath: string;
    }
  | {
      ok: false;
      message: string;
      resolvedPath?: string;
      error?: unknown;
    };

/** @deprecated 请使用 readSecretFileSync() 或 tryReadSecretFileSync()。 */
export function loadSecretFileSync(
  filePath: string,
  label: string,
  options: Parameters<typeof readSecretFileSyncImpl>[2] = {},
): SecretFileReadResult {
  const trimmedPath = filePath.trim();
  const resolvedPath = resolveUserPath(trimmedPath);
  if (!resolvedPath) {
    return { ok: false, message: `${label} file path is empty.` };
  }

  try {
    return {
      ok: true,
      secret: readSecretFileSyncImpl(filePath, label, options),
      resolvedPath,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      resolvedPath,
      error,
    };
  }
}
