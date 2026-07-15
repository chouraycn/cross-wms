/**
 * 内置默认线束 — 参考 OpenClaw harness/builtin-openclaw.ts
 *
 * 默认线束实现，封装现有的 runChatSession 调用。
 * 支持：
 * - 自动检测 provider/model 支持性
 * - 委托 runChatSession 执行实际对话
 * - 流式输出状态跟踪
 * - 压缩委托
 */

import { logger } from '../../logger.js';
import type {
  AgentHarness,
  HarnessAttemptParams,
  HarnessAttemptResult,
  HarnessCompactParams,
  HarnessCompactResult,
  HarnessSupportContext,
  HarnessSupport,
  HarnessResultClassification,
} from './types.js';

/** 内置线束 ID */
export const BUILTIN_HARNESS_ID = 'builtin';

/** 默认支持的 Provider 列表 */
const SUPPORTED_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'qwen',
  'zhipu',
  'moonshot',
  'yi',
  'baichuan',
  'minimax',
  'ollama',
  'openrouter',
  'siliconflow',
  'volcengine',
]);

/** 默认优先级（低于插件线束） */
const DEFAULT_PRIORITY = 0;

/**
 * 创建内置默认线束
 *
 * @param options - 创建选项
 * @returns 内置线束实例
 */
export function createBuiltinHarness(options?: {
  runAttemptFn?: (params: HarnessAttemptParams) => Promise<HarnessAttemptResult>;
  compactFn?: (params: HarnessCompactParams) => Promise<HarnessCompactResult | undefined>;
}): AgentHarness {
  const runAttemptFn = options?.runAttemptFn ?? defaultRunAttempt;
  const compactFn = options?.compactFn;

  return {
    id: BUILTIN_HARNESS_ID,
    label: 'Built-in Agent Harness',
    priority: DEFAULT_PRIORITY,
    contextEngineHostCapabilities: ['legacy'],

    supports(ctx: HarnessSupportContext): HarnessSupport {
      const provider = ctx.provider?.toLowerCase();
      if (!provider) {
        return { supported: false, reason: '未指定 provider' };
      }
      if (SUPPORTED_PROVIDERS.has(provider)) {
        return {
          supported: true,
          priority: DEFAULT_PRIORITY,
          reason: `内置支持 provider: ${provider}`,
        };
      }
      return {
        supported: false,
        reason: `内置线束不支持 provider: ${provider}`,
      };
    },

    async runAttempt(params: HarnessAttemptParams): Promise<HarnessAttemptResult> {
      logger.debug(`[BuiltinHarness] 开始执行: runId=${params.runId}, provider=${params.provider}`);
      const startTime = Date.now();

      try {
        const result = await runAttemptFn(params);
        result.durationMs = Date.now() - startTime;
        logger.debug(
          `[BuiltinHarness] 执行完成: runId=${params.runId}, ` +
          `tokens=${result.tokensUsed ?? 'unknown'}, duration=${result.durationMs}ms`,
        );
        return result;
      } catch (err) {
        logger.error(`[BuiltinHarness] 执行异常: runId=${params.runId}`, err);
        return {
          text: '',
          promptError: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startTime,
        };
      }
    },

    async compact(params: HarnessCompactParams): Promise<HarnessCompactResult | undefined> {
      if (!compactFn) {
        logger.debug(`[BuiltinHarness] 压缩未配置，跳过: sessionId=${params.sessionId}`);
        return undefined;
      }
      return compactFn(params);
    },

    classify(result: HarnessAttemptResult): HarnessResultClassification | undefined {
      if (result.promptError) return 'error';
      if (result.externalAbort || result.aborted) return 'aborted';
      if (result.timedOut || result.idleTimedOut) return 'timeout';
      if (result.timedOutDuringCompaction) return 'compaction_failure';
      return 'ok';
    },
  };
}

/**
 * 默认的运行尝试函数
 *
 * 这是一个占位实现，实际使用时应通过 options.runAttemptFn 注入。
 */
async function defaultRunAttempt(params: HarnessAttemptParams): Promise<HarnessAttemptResult> {
  logger.warn(
    `[BuiltinHarness] 使用默认占位实现，请通过 runAttemptFn 注入实际逻辑: runId=${params.runId}`,
  );
  return {
    text: '',
    promptError: 'BuiltinHarness: runAttemptFn not configured',
  };
}

/** 注册内置线束到注册表 */
export async function registerBuiltinHarness(options?: {
  runAttemptFn?: (params: HarnessAttemptParams) => Promise<HarnessAttemptResult>;
  compactFn?: (params: HarnessCompactParams) => Promise<HarnessCompactResult | undefined>;
}): Promise<void> {
  // 延迟导入避免循环依赖
  const { registerAgentHarness } = await import('./registry.js');
  const harness = createBuiltinHarness(options);
  registerAgentHarness(harness);
}
