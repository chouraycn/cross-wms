/**
 * ACP Secret File
 * 密钥文件管理 - 从文件读取敏感配置（如 Gateway 认证 token）
 *
 * 参考 openclaw/src/acp/secret-file.ts 设计
 */

import fs from "node:fs";
import path from "node:path";

export function readSecretFromFile(filePath: string, secretName: string): string {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`${secretName} file not found: ${resolvedPath}`);
  }

  try {
    const content = fs.readFileSync(resolvedPath, "utf8");
    const trimmed = content.trim();

    if (!trimmed) {
      throw new Error(`${secretName} file is empty: ${resolvedPath}`);
    }

    return trimmed;
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Failed to read ${secretName} from ${resolvedPath}: ${err.message}`);
    }
    throw new Error(`Failed to read ${secretName} from ${resolvedPath}`);
  }
}

export function readOptionalSecretFromFile(
  filePath: string | undefined,
  secretName: string,
): string | undefined {
  if (!filePath) {
    return undefined;
  }

  try {
    return readSecretFromFile(filePath, secretName);
  } catch {
    return undefined;
  }
}

export function readEnvSecret(
  envKey: string,
  secretName: string,
  fileEnvKey?: string,
): string | undefined {
  const directValue = process.env[envKey];
  if (directValue && directValue.trim()) {
    return directValue.trim();
  }

  const filePath = fileEnvKey ? process.env[fileEnvKey] : undefined;
  if (filePath) {
    try {
      return readSecretFromFile(filePath, secretName);
    } catch {
      return undefined;
    }
  }

  return undefined;
}