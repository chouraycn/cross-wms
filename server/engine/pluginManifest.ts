/**
 * 插件清单验证与解析 — 参考 OpenClaw plugins/manifest.ts
 *
 * 验证插件清单的完整性和正确性。
 */

import { logger } from '../logger.js';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  entrypoint?: string;
  dependencies?: Record<string, string>;
  capabilities?: string[];
  permissions?: string[];
  configSchema?: Record<string, unknown>;
  channel?: string;
  hooks?: {
    beforeAgentStart?: string;
    beforeToolCall?: string;
    afterToolCall?: string;
    beforeAgentReply?: string;
  };
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const REQUIRED_FIELDS: Array<keyof PluginManifest> = ['id', 'name', 'version'];

const VALID_ID_PATTERN = /^[a-z0-9-]+$/;
const VALID_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

export function validateManifest(manifest: Partial<PluginManifest>): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (!manifest[field]) {
      errors.push(`缺少必填字段: ${field}`);
    }
  }

  if (manifest.id && !VALID_ID_PATTERN.test(manifest.id)) {
    errors.push(`无效的插件 ID: ${manifest.id} (只能包含小写字母、数字和连字符)`);
  }

  if (manifest.version && !VALID_VERSION_PATTERN.test(manifest.version)) {
    errors.push(`无效的版本号: ${manifest.version} (格式应为 x.y.z)`);
  }

  if (manifest.name && manifest.name.length > 100) {
    warnings.push('插件名称过长，建议不超过 100 个字符');
  }

  if (manifest.description && manifest.description.length > 500) {
    warnings.push('插件描述过长，建议不超过 500 个字符');
  }

  if (manifest.permissions && manifest.permissions.length > 0) {
    for (const perm of manifest.permissions) {
      if (!isValidPermission(perm)) {
        warnings.push(`未知权限: ${perm}`);
      }
    }
  }

  logger.debug(`[PluginManifest] 验证结果: ${errors.length} 错误, ${warnings.length} 警告`);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function isValidPermission(permission: string): boolean {
  const validPermissions = [
    'read',
    'write',
    'execute',
    'network',
    'storage',
    'system',
    'admin',
    'config',
  ];
  return validPermissions.includes(permission);
}

export function normalizeManifest(manifest: Partial<PluginManifest>): PluginManifest {
  return {
    id: manifest.id ?? 'unknown',
    name: manifest.name ?? manifest.id ?? 'Unknown',
    version: manifest.version ?? '1.0.0',
    description: manifest.description,
    author: manifest.author,
    license: manifest.license ?? 'MIT',
    entrypoint: manifest.entrypoint,
    dependencies: manifest.dependencies,
    capabilities: manifest.capabilities ?? [],
    permissions: manifest.permissions ?? [],
    configSchema: manifest.configSchema,
    channel: manifest.channel,
    hooks: manifest.hooks,
  };
}

export function parseManifest(content: string): { manifest: PluginManifest; errors: string[] } {
  const errors: string[] = [];
  let manifest: Partial<PluginManifest>;

  try {
    manifest = JSON.parse(content);
  } catch (err) {
    errors.push(`JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`);
    return { manifest: normalizeManifest({}), errors };
  }

  const validation = validateManifest(manifest);
  errors.push(...validation.errors);

  return {
    manifest: normalizeManifest(manifest),
    errors,
  };
}

export function generatePluginId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isManifestValid(manifest: Partial<PluginManifest>): boolean {
  return validateManifest(manifest).valid;
}