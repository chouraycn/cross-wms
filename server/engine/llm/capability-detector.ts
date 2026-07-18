/**
 * 能力检测 — 视觉 / 函数调用 / 思考模式 / JSON 模式等。
 *
 * 能力来源优先级：
 * 1. 模型显式声明的 capabilities 数组
 * 2. 模型 ID 的启发式匹配（如包含 'vl' / 'vision' / '4o'）
 * 3. Provider 默认能力
 */
import type { Api, Model } from './types.js';

/** 已知能力枚举。 */
export type Capability =
  | 'vision'
  | 'function-calling'
  | 'json-mode'
  | 'thinking'
  | 'parallel-tool-calls'
  | 'streaming'
  | 'system-prompt'
  | 'seed'
  | 'logprobs';

/** Provider 默认能力映射。 */
export const PROVIDER_DEFAULT_CAPABILITIES: Record<string, Capability[]> = {
  openai: ['function-calling', 'json-mode', 'streaming', 'system-prompt', 'parallel-tool-calls', 'logprobs', 'seed'],
  anthropic: ['function-calling', 'json-mode', 'streaming', 'system-prompt', 'vision', 'thinking'],
  google: ['function-calling', 'json-mode', 'streaming', 'system-prompt', 'vision', 'parallel-tool-calls'],
  azure: ['function-calling', 'json-mode', 'streaming', 'system-prompt', 'parallel-tool-calls', 'logprobs', 'seed'],
  bedrock: ['function-calling', 'streaming', 'system-prompt'],
  ollama: ['function-calling', 'streaming', 'system-prompt'],
  deepseek: ['function-calling', 'json-mode', 'streaming', 'system-prompt'],
  moonshot: ['function-calling', 'json-mode', 'streaming', 'system-prompt'],
  qwen: ['function-calling', 'json-mode', 'streaming', 'system-prompt'],
  zhipu: ['function-calling', 'json-mode', 'streaming', 'system-prompt'],
  minimax: ['function-calling', 'streaming', 'system-prompt'],
  baichuan: ['function-calling', 'json-mode', 'streaming', 'system-prompt'],
};

/** 视觉能力的 ID 启发式规则。 */
const VISION_ID_PATTERNS = [
  /-vl($|-)/i,
  /vision/i,
  /-4o/i,
  /claude-3/i,
  /gemini/i,
  /qwen-vl/i,
  /glm-4v/i,
  /gpt-4o/i,
];

/** 思考能力的 ID 启发式规则。 */
const THINKING_ID_PATTERNS = [
  /reasoner/i,
  /-r1/i,
  /thinking/i,
  /o1/i,
  /o3/i,
  /claude-3-7/i,
  /kimi-k2/i,
];

/** 检测模型是否具备指定能力。 */
export function hasCapability(model: Model, capability: Capability): boolean {
  // 显式声明优先
  if (model.capabilities?.includes(capability)) return true;
  // reasoning 模型隐含 thinking
  if (capability === 'thinking' && model.reasoning) return true;
  // Provider 默认能力
  const providerDefaults = PROVIDER_DEFAULT_CAPABILITIES[model.provider.toLowerCase()];
  if (providerDefaults?.includes(capability)) return true;
  // ID 启发式
  if (capability === 'vision' && matchesVisionId(model.id)) return true;
  if (capability === 'thinking' && matchesThinkingId(model.id)) return true;
  return false;
}

/** 检测模型 ID 是否暗示视觉能力。 */
export function matchesVisionId(modelId: string): boolean {
  return VISION_ID_PATTERNS.some((re) => re.test(modelId));
}

/** 检测模型 ID 是否暗示思考能力。 */
export function matchesThinkingId(modelId: string): boolean {
  return THINKING_ID_PATTERNS.some((re) => re.test(modelId));
}

/** 列出模型所有能力（合并显式声明、Provider 默认、ID 启发式）。 */
export function listCapabilities(model: Model): Capability[] {
  const set = new Set<Capability>();
  for (const c of model.capabilities ?? []) set.add(c as Capability);
  if (model.reasoning) set.add('thinking');
  const providerDefaults = PROVIDER_DEFAULT_CAPABILITIES[model.provider.toLowerCase()];
  if (providerDefaults) for (const c of providerDefaults) set.add(c);
  if (matchesVisionId(model.id)) set.add('vision');
  if (matchesThinkingId(model.id)) set.add('thinking');
  return Array.from(set);
}

/** 检测一批模型中支持指定能力的子集。 */
export function filterByCapability(models: Model[], capability: Capability): Model[] {
  return models.filter((m) => hasCapability(m, capability));
}

/** 检查 Api 是否原生支持流式。 */
export function apiSupportsStreaming(api: Api): boolean {
  return api !== 'cloudflare-ai';
}

/** 检查 Api 是否支持函数调用。 */
export function apiSupportsFunctionCalling(api: Api): boolean {
  return !['ollama'].includes(api) || true; // 大多数 API 都支持
}

/** 比较两个模型的能力集差异。 */
export function capabilityDiff(a: Model, b: Model): { added: Capability[]; removed: Capability[] } {
  const aCaps = new Set(listCapabilities(a));
  const bCaps = new Set(listCapabilities(b));
  const added = Array.from(bCaps).filter((c) => !aCaps.has(c));
  const removed = Array.from(aCaps).filter((c) => !bCaps.has(c));
  return { added, removed };
}
