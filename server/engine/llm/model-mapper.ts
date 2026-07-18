/**
 * 模型映射 — 别名 / 版本 / 区域映射。
 *
 * 用户输入的模型名可能是别名（'gpt4'）、旧版本（'gpt-4-0613'）或
 * 区域变体（'gpt-4-cn'）。此模块提供统一映射回当前可用模型 ID 的能力。
 */
import type { Model } from './types.js';

/** 别名映射表。 */
const ALIAS_MAP: Record<string, string> = {
  // OpenAI
  'gpt4': 'gpt-4o',
  'gpt-4': 'gpt-4o',
  'gpt4o': 'gpt-4o',
  'gpt-4-turbo': 'gpt-4o',
  'gpt3.5': 'gpt-4o-mini',
  'gpt-3.5-turbo': 'gpt-4o-mini',
  'o1-preview': 'o1',
  'o1-mini': 'o1',
  // Anthropic
  'claude': 'claude-3-5-sonnet-20241022',
  'claude-3': 'claude-3-5-sonnet-20241022',
  'claude-sonnet': 'claude-3-5-sonnet-20241022',
  'claude-haiku': 'claude-3-5-haiku-20241022',
  'claude-opus': 'claude-3-opus-20240229',
  // Google
  'gemini': 'gemini-1.5-pro',
  'gemini-pro': 'gemini-1.5-pro',
  'gemini-flash': 'gemini-1.5-flash',
  // 国内
  'qwen': 'qwen-max',
  'qwen-max': 'qwen-max',
  'glm': 'glm-4-plus',
  'glm-4': 'glm-4-plus',
  'deepseek': 'deepseek-chat',
  'kimi': 'kimi-k2-0905-preview',
  'baichuan': 'Baichuan4',
  'minimax': 'abab6.5s-chat',
  // 百度文心
  'ernie': 'ernie-4.0-8k-latest',
  'ernie-4': 'ernie-4.0-8k-latest',
  '文心': 'ernie-4.0-8k-latest',
  '文心一言': 'ernie-4.0-8k-latest',
  'baidu': 'ernie-4.0-8k-latest',
  // 讯飞星火
  'spark': '4.0Ultra',
  'spark-4': '4.0Ultra',
  '星火': '4.0Ultra',
  '讯飞': '4.0Ultra',
  'iflytek': '4.0Ultra',
  // 零一万物
  'yi': 'yi-lightning',
  'lingyi': 'yi-lightning',
  '零一': 'yi-lightning',
  '零一万物': 'yi-lightning',
};

/** 版本降级映射（旧 ID → 当前 ID）。 */
const VERSION_FALLBACK: Record<string, string> = {
  'gpt-4-0613': 'gpt-4o',
  'gpt-4-0314': 'gpt-4o',
  'gpt-3.5-turbo-0613': 'gpt-4o-mini',
  'gpt-3.5-turbo-0301': 'gpt-4o-mini',
  'claude-2': 'claude-3-5-sonnet-20241022',
  'claude-2.1': 'claude-3-5-sonnet-20241022',
  'claude-3-sonnet-20240229': 'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229': 'claude-3-5-sonnet-20241022',
};

/** 区域后缀映射（去后缀以匹配标准 ID）。 */
const REGION_SUFFIXES = ['-cn', '-us', '-eu', '-global', '-region1', '-region2'];

/** 解析别名 → 标准 ID（不变则原样返回）。 */
export function resolveAlias(alias: string): string {
  const lower = alias.toLowerCase();
  return ALIAS_MAP[lower] ?? alias;
}

/** 解析旧版本 → 当前 ID（不变则原样返回）。 */
export function resolveVersion(modelId: string): string {
  return VERSION_FALLBACK[modelId.toLowerCase()] ?? modelId;
}

/** 去除区域后缀（如 'gpt-4-cn' → 'gpt-4'）。 */
export function stripRegionSuffix(modelId: string): string {
  for (const suffix of REGION_SUFFIXES) {
    if (modelId.toLowerCase().endsWith(suffix)) {
      return modelId.slice(0, -suffix.length);
    }
  }
  return modelId;
}

/** 完整映射：去后缀 → 别名 → 版本。 */
export function mapModelId(input: string): string {
  let id = stripRegionSuffix(input);
  id = resolveAlias(id);
  id = resolveVersion(id);
  return id;
}

/** 注册自定义别名（运行时扩展）。 */
const customAliases = new Map<string, string>();
export function registerAlias(alias: string, target: string): void {
  customAliases.set(alias.toLowerCase(), target);
}

/** 注册自定义版本映射。 */
const customVersions = new Map<string, string>();
export function registerVersionFallback(from: string, to: string): void {
  customVersions.set(from.toLowerCase(), to);
}

/** 解析自定义别名。 */
export function resolveCustomAlias(alias: string): string | undefined {
  return customAliases.get(alias.toLowerCase());
}

/** 解析自定义版本。 */
export function resolveCustomVersion(modelId: string): string | undefined {
  return customVersions.get(modelId.toLowerCase());
}

/** 在已注册模型中查找匹配（支持别名、版本、后缀）。 */
export function findModelByReference(
  reference: string,
  registry: { find: (pred: (m: Model) => boolean) => Model | undefined; list: () => Model[] },
): Model | undefined {
  // 1. 直接匹配 provider/id
  if (reference.includes('/')) {
    const [provider, id] = reference.split('/', 2);
    const direct = registry.find((m) => m.provider === provider && m.id === id);
    if (direct) return direct;
  }
  // 2. 别名/版本/后缀解析后匹配 ID
  const mapped = mapModelId(reference);
  // 2a. 自定义别名优先
  const custom = resolveCustomAlias(reference) ?? resolveCustomVersion(reference);
  const candidates = [custom, mapped, reference].filter((x): x is string => x !== undefined);
  for (const cand of candidates) {
    const m = registry.find((m) => m.id === cand || (m.aliases?.includes(cand) ?? false));
    if (m) return m;
  }
  // 3. 模糊匹配（包含）
  for (const cand of candidates) {
    const m = registry.list().find((m) => m.id.toLowerCase().includes(cand.toLowerCase()));
    if (m) return m;
  }
  return undefined;
}

/** 列出所有内置别名。 */
export function listBuiltinAliases(): Record<string, string> {
  return { ...ALIAS_MAP };
}

/** 列出所有内置版本映射。 */
export function listBuiltinVersionFallbacks(): Record<string, string> {
  return { ...VERSION_FALLBACK };
}

/** 清空自定义别名与版本（测试用）。 */
export function clearCustomMappings(): void {
  customAliases.clear();
  customVersions.clear();
}
