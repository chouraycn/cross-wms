/**
 * 主 zod schema 入口 — 整合各领域配置 schema
 *
 * 参考 openclaw/src/config/zod-schema.ts，为 cross-wms 建立完整的
 * 配置 zod schema，涵盖 gateway、models、plugins、agents、logging 等领域。
 *
 * 与 server/config/schema.ts 中的 CDFKnowConfigSchema 互补：
 *   - CDFKnowConfigSchema 面向应用级配置（providers、wms、skills、hooks 等）
 *   - 本 schema 面向 engine 运行时配置（gateway、agents、logging 等）
 */

import { z } from 'zod';
import {
  portNumber,
  hostAddress,
  logLevel,
  positiveInt,
  nonNegativeInt,
  stringArray,
  secretInput,
  httpUrl,
} from './schema-base.js';

// ===================== 各领域 schema =====================

/** Gateway 认证配置 */
const GatewayAuthSchema = z
  .object({
    mode: z
      .enum(['none', 'token', 'password', 'trusted-proxy'])
      .default('none'),
    token: secretInput.optional(),
    password: secretInput.optional(),
    allowTailscale: z.boolean().optional(),
    rateLimit: z
      .object({
        maxAttempts: positiveInt.optional(),
        windowMs: nonNegativeInt.optional(),
        lockoutMs: nonNegativeInt.optional(),
        exemptLoopback: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .optional();

/** Gateway 配置 */
const GatewaySchema = z
  .object({
    port: portNumber.default(3000),
    host: hostAddress.default('127.0.0.1'),
    baseUrl: httpUrl.optional(),
    auth: GatewayAuthSchema,
    trustedProxies: stringArray.optional(),
    allowRealIpFallback: z.boolean().optional(),
    handshakeTimeoutMs: positiveInt.optional(),
  })
  .strict()
  .optional();

/** 模型 provider 配置 */
const ModelProviderSchema = z
  .object({
    enabled: z.boolean().default(true),
    apiKeyEnvVar: z.string().optional(),
    defaultModel: z.string().optional(),
    baseUrl: httpUrl.optional(),
    models: stringArray.default([]),
  })
  .strict();

/** 模型配置 */
const ModelsSchema = z
  .object({
    default: z.string().optional(),
    providers: z.record(z.string(), ModelProviderSchema).default({}),
  })
  .strict()
  .optional();

/** 插件配置 */
const PluginsSchema = z
  .object({
    directories: stringArray.default([]),
    enabled: stringArray.default([]),
    allowList: stringArray.optional(),
    denyList: stringArray.optional(),
  })
  .strict()
  .optional();

/** Agent 配置 */
const AgentsSchema = z
  .object({
    defaultTimeoutMs: positiveInt.default(120_000),
    maxConcurrent: positiveInt.default(5),
    defaultModel: z.string().optional(),
  })
  .strict()
  .optional();

/** 日志配置 */
const LoggingSchema = z
  .object({
    level: logLevel.default('info'),
    file: z.string().optional(),
    redactSecrets: z.boolean().default(true),
    redactPatterns: stringArray.optional(),
    consoleLevel: logLevel.optional(),
  })
  .strict()
  .optional();

/** Skills 配置 */
const SkillsSchema = z
  .object({
    allowBundled: stringArray.optional(),
    extraDirs: stringArray.optional(),
    watch: z.boolean().optional(),
    maxSkillsInPrompt: nonNegativeInt.optional(),
  })
  .strict()
  .optional();

/** Hooks 配置 */
const HooksSchema = z
  .object({
    enabled: z.boolean().default(true),
    path: z.string().optional(),
    token: secretInput.optional(),
    maxBodyBytes: positiveInt.optional(),
  })
  .strict()
  .optional();

/** 诊断配置 */
const DiagnosticsSchema = z
  .object({
    enabled: z.boolean().optional(),
    otel: z
      .object({
        enabled: z.boolean().optional(),
        endpoint: z.string().optional(),
        serviceName: z.string().optional(),
        sampleRate: z.number().min(0).max(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .optional();

/** MCP 配置 */
const McpSchema = z
  .object({
    servers: z
      .record(
        z.string(),
        z
          .object({
            enabled: z.boolean().optional(),
            command: z.string().optional(),
            args: stringArray.optional(),
            env: z.record(z.string(), z.string()).optional(),
            url: httpUrl.optional(),
            transport: z.enum(['stdio', 'sse', 'streamable-http']).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .optional();

// ===================== 顶层 schema =====================

/**
 * 完整配置 schema — 整合所有领域的 zod schema
 *
 * 使用 strict 模式确保未知字段被拒绝，避免配置拼写错误被静默忽略。
 */
export const configSchema = z.object({
  $schema: z.string().optional(),
  schemaVersion: z.string().optional(),
  gateway: GatewaySchema,
  models: ModelsSchema,
  plugins: PluginsSchema,
  agents: AgentsSchema,
  logging: LoggingSchema,
  skills: SkillsSchema,
  hooks: HooksSchema,
  diagnostics: DiagnosticsSchema,
  mcp: McpSchema,
});

/** 配置 schema 推导类型 */
export type ConfigSchema = z.infer<typeof configSchema>;

/**
 * 领域 schema 映射
 *
 * 提供按领域单独访问各子 schema 的能力，用于局部校验或 UI 分区展示。
 */
export const domainSchemas = {
  gateway: GatewaySchema,
  models: ModelsSchema,
  plugins: PluginsSchema,
  agents: AgentsSchema,
  logging: LoggingSchema,
  skills: SkillsSchema,
  hooks: HooksSchema,
  diagnostics: DiagnosticsSchema,
  mcp: McpSchema,
} as const;

export type DomainSchemas = typeof domainSchemas;
