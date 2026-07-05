/**
 * 模型配置 Zod Schema 验证
 *
 * 用于验证 models.json 配置文件的格式正确性，防止错误配置导致运行时故障。
 */

import { z } from 'zod';
import type { ModelConfig, ProviderConfig, ModelsFile } from '../shared/types/models.js';
import { logger } from './logger.js';

const ModelProviderSchema = z.enum([
  'openai', 'anthropic', 'tencent', 'deepseek', 'google', 'qwen',
  'xai', 'zai', 'minimax', 'kimi', 'byteplus', 'openrouter',
  'novita', 'wwqglobal', 'wwqcn', 'aws', 'azure', 'vercel',
  'ollama', 'bigmodel', 'minimaxcn', 'kimicn', 'volcengine',
  'aliyun', 'modelark', 'ppio', 'groq', 'mistral', 'nvidia', 'custom',
]);

const ModelCapabilitySchema = z.enum([
  'code', 'longContext', 'reasoning', 'multimodal', 'fast', 'costEffective', 'general',
]);

const AuthModeSchema = z.enum(['api-key', 'aws-sdk', 'oauth', 'token', 'none']);

const ApiKeyEntrySchema = z.object({
  label: z.string().optional(),
  key: z.string(),
  enabled: z.boolean().optional(),
  _uid: z.string().optional(),
});

const CostSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
  cacheRead: z.number().optional(),
  cacheWrite: z.number().optional(),
});

const LocalServiceSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  healthUrl: z.string().optional(),
  readyTimeoutMs: z.number().optional(),
  idleStopMs: z.number().optional(),
});

const UsageStatsSchema = z.object({
  callCount: z.number(),
  lastUsedAt: z.string().nullable(),
  avgResponseTime: z.number().nullable(),
});

const ModelApiTypeSchema = z.enum([
  'openai-chat',
  'openai-completions',
  'anthropic-messages',
  'google-generative-ai',
]);

const ThinkingConfigSchema = z.object({
  paramField: z.string().optional(),
  levelMap: z.record(z.string()).optional(),
  useBudget: z.boolean().optional(),
  budgetRatio: z.number().min(0).max(1).optional(),
});

const CompatConfigSchema = z.object({
  supportsStreaming: z.boolean().optional(),
  supportsToolCalls: z.boolean().optional(),
  supportsReasoning: z.boolean().optional(),
  reasoningField: z.string().optional(),
  apiVersion: z.string().optional(),
  extraHeaders: z.record(z.string()).optional(),
  extraBodyParams: z.record(z.unknown()).optional(),
  roleMap: z.record(z.string()).optional(),
  supportsSystemMessage: z.boolean().optional(),
  systemMessageFallback: z.enum(['merge-to-first-user', 'ignore']).optional(),
  maxImages: z.number().int().positive().optional(),
  supportsVision: z.boolean().optional(),
  thinking: ThinkingConfigSchema.optional(),
});

const MediaImageConfigSchema = z.object({
  maxFileSize: z.number().positive().optional(),
  formats: z.array(z.string()).optional(),
  maxPixels: z.number().positive().optional(),
  maxWidth: z.number().positive().optional(),
  maxHeight: z.number().positive().optional(),
  supportsDetail: z.boolean().optional(),
  detailLevels: z.array(z.enum(['auto', 'low', 'high'])).optional(),
});

const MediaVideoConfigSchema = z.object({
  maxFileSize: z.number().positive().optional(),
  formats: z.array(z.string()).optional(),
  maxDurationSeconds: z.number().positive().optional(),
});

const MediaAudioConfigSchema = z.object({
  maxFileSize: z.number().positive().optional(),
  formats: z.array(z.string()).optional(),
  maxDurationSeconds: z.number().positive().optional(),
});

const MediaInputConfigSchema = z.object({
  supportedInputs: z.array(z.enum(['text', 'image', 'video', 'audio'])).optional(),
  image: MediaImageConfigSchema.optional(),
  video: MediaVideoConfigSchema.optional(),
  audio: MediaAudioConfigSchema.optional(),
});

export const ModelConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: ModelProviderSchema,
  providerConfigId: z.string().optional(),
  apiEndpoint: z.string().optional(),
  apiKey: z.string().optional(),
  apiKeyRef: z.string().optional(),
  apiKeys: z.array(ApiKeyEntrySchema).optional(),
  apiKeyRefs: z.array(z.string()).optional(),
  keyStrategy: z.enum(['round-robin', 'random', 'failover']).optional(),
  enabled: z.boolean(),
  isDefault: z.boolean().optional(),
  description: z.string().optional(),
  contextWindow: z.number().positive().optional(),
  contextTokens: z.number().positive().optional(),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  capabilities: z.array(ModelCapabilitySchema).optional(),
  thinkingLevels: z.array(z.string()).optional(),
  defaultThinkingLevel: z.string().optional(),
  cost: CostSchema.optional(),
  localService: LocalServiceSchema.optional(),
  authMode: AuthModeSchema.optional(),
  headers: z.record(z.string()).optional(),
  params: z.record(z.unknown()).optional(),
  inputModalities: z.array(z.enum(['text', 'image', 'video', 'audio'])).optional(),
  apiType: ModelApiTypeSchema.optional(),
  compatConfig: CompatConfigSchema.optional(),
  mediaInputConfig: MediaInputConfigSchema.optional(),
  usageStats: UsageStatsSchema.optional(),
  hidden: z.boolean().optional(),
}).strict();

export const ProviderConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: ModelProviderSchema,
  apiEndpoint: z.string().optional(),
  apiKey: z.string().optional(),
  apiKeyRef: z.string().optional(),
  apiKeys: z.array(ApiKeyEntrySchema).optional(),
  apiKeyRefs: z.array(z.string()).optional(),
  keyStrategy: z.enum(['round-robin', 'random', 'failover']).optional(),
  authMode: AuthModeSchema.optional(),
  headers: z.record(z.string()).optional(),
  defaultParams: z.record(z.unknown()).optional(),
  localService: LocalServiceSchema.optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  apiType: ModelApiTypeSchema.optional(),
  compatConfig: CompatConfigSchema.optional(),
  mediaInputConfig: MediaInputConfigSchema.optional(),
}).strict();

export const ModelsFileSchema = z.object({
  version: z.number(),
  providers: z.array(ProviderConfigSchema).optional(),
  models: z.array(ModelConfigSchema),
  defaultModelId: z.string(),
  updatedAt: z.string(),
}).strict();

/**
 * 验证模型配置文件
 * 返回 { valid, errors }
 */
export function validateModelsFile(data: unknown): {
  valid: boolean;
  errors?: z.ZodIssue[];
  data?: ModelsFile;
} {
  const result = ModelsFileSchema.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, errors: result.error.issues };
}

/**
 * 验证单个模型配置
 */
export function validateModelConfig(data: unknown): {
  valid: boolean;
  errors?: z.ZodIssue[];
  data?: ModelConfig;
} {
  const result = ModelConfigSchema.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, errors: result.error.issues };
}

/**
 * 验证单个 Provider 配置
 */
export function validateProviderConfig(data: unknown): {
  valid: boolean;
  errors?: z.ZodIssue[];
  data?: ProviderConfig;
} {
  const result = ProviderConfigSchema.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, errors: result.error.issues };
}

/**
 * 格式化 Zod 错误为人类可读的字符串
 */
export function formatZodErrors(errors: z.ZodIssue[]): string {
  return errors.map((issue, i) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `  [${i + 1}] ${path}: ${issue.message}`;
  }).join('\n');
}

/**
 * 记录验证警告（不阻断流程，但记录日志）
 * 用于启动时检查配置文件格式
 */
export function warnIfModelsFileInvalid(data: unknown): void {
  const result = validateModelsFile(data);
  if (!result.valid && result.errors) {
    logger.warn(
      '[modelsStore] 配置文件格式不完全符合 schema:\n' +
      formatZodErrors(result.errors).slice(0, 500),
    );
  }
}
