import { logger } from '../../../logger.js';
import { loadModelsConfig } from '../../../modelsStore.js';
import { selectKey } from '../../../keyRotator.js';
import { callAIModelStreamWithAdapter } from '../../../aiClient.js';
import type { ModelCallConfig, AIResponse } from '../../../aiClient.js';

const DEFAULT_SLUG_GENERATOR_TIMEOUT_MS = 15_000;
const PROVIDER_ERROR_PREFIX_RE =
  /^(?:provider\s+)?(?:api|llm|model|openai|anthropic|codex|gateway)\s+(?:request\s+)?(?:error|failed|failure)\b/i;
const PROVIDER_ERROR_DETAIL_RE =
  /\b(?:insufficient[_ -]?quota|quota (?:exceeded|exhausted)|exceeded your current quota|payment required|insufficient credits|credit balance|insufficient[_ -]?(?:balance|funds)|rate[_ -]?limit(?:ed)?|too many requests|invalid[_ -]?api[_ -]?key|incorrect api key|authentication failed|oauth token refresh failed|missing (?:token|projectid|credentials)|google cloud credentials|re-?authenticate|unauthorized|forbidden|permission_error|billing hard limit|spend(?:ing)? limit)\b/i;

function isErrorSlugPayload(text: string | undefined): boolean {
  if (!text) {
    return false;
  }
  const trimmed = text.trim();
  if (parseApiErrorPayload(trimmed)) {
    return true;
  }
  const leadingStatus = extractLeadingHttpStatus(trimmed);
  if (leadingStatus) {
    if ([401, 402, 403, 429].includes(leadingStatus.code)) {
      return true;
    }
    if (
      leadingStatus.code === 400 &&
      (parseApiErrorPayload(leadingStatus.rest) ||
        PROVIDER_ERROR_PREFIX_RE.test(leadingStatus.rest) ||
        PROVIDER_ERROR_DETAIL_RE.test(leadingStatus.rest))
    ) {
      return true;
    }
  }
  return PROVIDER_ERROR_PREFIX_RE.test(trimmed) || PROVIDER_ERROR_DETAIL_RE.test(trimmed);
}

function extractLeadingHttpStatus(text: string): { code: number; rest: string } | null {
  const match = text.match(/^(\d{3})\s*(.*)$/);
  if (!match) return null;
  const code = parseInt(match[1], 10);
  if (!Number.isFinite(code) || code < 100 || code >= 600) return null;
  return { code, rest: match[2] };
}

function parseApiErrorPayload(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && (parsed.error || parsed.errors)) {
      return parsed;
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

export async function generateSlugViaLLM(params: {
  sessionContent: string;
}): Promise<string | null> {
  try {
    const modelsConfig = await loadModelsConfig();
    const defaultModel = modelsConfig.models.find((m: { id: string }) => m.id === 'auto')
      || modelsConfig.models.find((m: { enabled: boolean }) => m.enabled);
    
    if (!defaultModel) {
      logger.debug('[llm-slug-generator] 未找到可用模型，跳过 LLM 生成');
      return null;
    }

    const keyResult = selectKey(defaultModel);
    const effectiveApiKey = keyResult ? keyResult.key : (defaultModel.apiKey || '');
    if (!effectiveApiKey) {
      logger.debug('[llm-slug-generator] 模型未配置 API Key，跳过 LLM 生成');
      return null;
    }

    const modelConfig: ModelCallConfig = {
      ...defaultModel,
      apiKey: effectiveApiKey,
      temperature: 0.1,
      maxTokens: 32,
    };

    const prompt = `Based on this conversation, generate a short 1-2 word filename slug (lowercase, hyphen-separated, no file extension).

Conversation summary:
${params.sessionContent.slice(0, 2000)}

Reply with ONLY the slug, nothing else. Examples: "vendor-pitch", "api-design", "bug-fix"`;

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), DEFAULT_SLUG_GENERATOR_TIMEOUT_MS);

    let fullContent = '';
    const response: AIResponse = await callAIModelStreamWithAdapter(
      modelConfig,
      [{ role: 'user', content: prompt }],
      (chunk: string) => {
        fullContent += chunk;
      },
      abortController.signal,
    );

    clearTimeout(timeoutHandle);

    const text = response.content || fullContent;
    if (!text) {
      return null;
    }

    if (isErrorSlugPayload(text)) {
      logger.debug('[llm-slug-generator] LLM 返回错误，跳过');
      return null;
    }

    const slug = text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30)
      .replace(/^-+|-+$/g, '');

    return slug || null;
  } catch (err) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    logger.debug(`[llm-slug-generator] Failed to generate slug: ${message}`);
    return null;
  }
}