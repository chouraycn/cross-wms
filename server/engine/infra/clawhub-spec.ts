/**
 * ClawhHub 扩展仓库规范定义
 *
 * 参考 openclaw/src/infra/clawhub-spec.ts，定义 cross-wms 的扩展仓库规范：
 *   - ClawhubSpec：扩展仓库元数据（名称、版本、清单、包列表等）
 *   - ClawhubManifest：扩展清单（入口、能力、依赖等）
 *   - ClawhubPackageMeta：包元数据（路径、校验和、大小等）
 *
 * 使用 zod 进行 schema 验证，提供 parseSpec / validateSpec 两个入口。
 */

import { z } from 'zod';
import { logger } from '../../logger.js';

/** 包格式 */
export const ClawhubPackageFormatSchema = z.enum(['zip', 'tar.gz', 'tgz']);

/** 扩展类型 */
export const ClawhubExtensionKindSchema = z.enum(['skill', 'plugin', 'bundle']);

/** ClawhHub 扩展清单 schema */
export const ClawhubManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  kind: ClawhubExtensionKindSchema.optional(),
  entry: z.string().optional(),
  main: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
});

/** ClawhHub 包元数据 schema */
export const ClawhubPackageMetaSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  path: z.string().optional(),
  sha256: z
    .string()
    .regex(/^[A-Fa-f0-9]{64}$/)
    .optional(),
  size: z.number().int().nonnegative().optional(),
  format: ClawhubPackageFormatSchema.optional(),
  downloadUrl: z.string().url().optional(),
  integrity: z.string().optional(),
});

/** ClawhHub 扩展仓库规范 schema */
export const ClawhubSpecSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  homepage: z.string().url().optional(),
  repository: z.string().optional(),
  manifest: ClawhubManifestSchema.optional(),
  packages: z.array(ClawhubPackageMetaSchema).optional(),
  tags: z.array(z.string()).optional(),
});

/** 扩展清单类型 */
export type ClawhubManifest = z.infer<typeof ClawhubManifestSchema>;

/** 包元数据类型 */
export type ClawhubPackageMeta = z.infer<typeof ClawhubPackageMetaSchema>;

/** 扩展仓库元数据类型 */
export type ClawhubSpec = z.infer<typeof ClawhubSpecSchema>;

/** 验证结果 */
export type SpecValidationResult = {
  /** 是否通过验证 */
  valid: boolean;
  /** 错误信息列表（path: message 格式） */
  errors: string[];
};

/**
 * 解析 spec 输入
 *
 * 接受字符串（JSON）或对象作为输入，使用 zod schema 校验后返回 ClawhubSpec。
 * 解析失败时返回 null，并记录 debug 日志。
 *
 * @param input - 待解析的输入（JSON 字符串或对象）
 * @returns 解析成功的 ClawhubSpec，失败返回 null
 */
export function parseSpec(input: unknown): ClawhubSpec | null {
  if (input == null) return null;

  let data: unknown = input;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    // 仅接受 JSON 形式的字符串
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        data = JSON.parse(trimmed);
      } catch (err) {
        logger.debug(`[ClawhubSpec] JSON 解析失败: ${(err as Error).message}`);
        return null;
      }
    } else {
      // 非法输入形式
      logger.debug(`[ClawhubSpec] 输入字符串不是合法的 JSON 起始`);
      return null;
    }
  }

  const result = ClawhubSpecSchema.safeParse(data);
  if (!result.success) {
    logger.debug(
      `[ClawhubSpec] schema 校验失败: ${result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}(${i.code}): ${i.message}`)
        .join('; ')}`,
    );
    return null;
  }
  return result.data;
}

/**
 * 验证 spec 合规性
 *
 * 使用 zod schema 对输入进行结构校验，返回详细的验证结果。
 *
 * @param spec - 待验证的 spec 对象
 * @returns 验证结果，包含 valid 标志和错误信息列表
 */
export function validateSpec(spec: unknown): SpecValidationResult {
  const result = ClawhubSpecSchema.safeParse(spec);
  if (result.success) {
    return { valid: true, errors: [] };
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
  );
  return { valid: false, errors };
}
