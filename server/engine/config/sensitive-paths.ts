// 移植自 openclaw/src/config/sensitive-paths.ts
// 为脱敏和校验分类敏感配置路径。
//
// 降级说明：源文件依赖 @openclaw/normalization-core/string-coerce 的
// normalizeLowercaseStringOrEmpty。此处内联等价实现。

/** 内联降级实现：将输入归一化为小写字符串，非字符串返回空串。 */
function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/**
 * 名称恰好匹配敏感模式的非敏感字段名。
 * 这些被显式排除在脱敏（插件配置）和未标记敏感（基础配置）的告警之外。
 */
const SENSITIVE_KEY_WHITELIST_SUFFIXES = [
  'maxtokens',
  'maxoutputtokens',
  'maxinputtokens',
  'maxcompletiontokens',
  'contexttokens',
  'totaltokens',
  'tokencount',
  'tokenlimit',
  'tokenbudget',
  'passwordFile',
] as const;

const NORMALIZED_SENSITIVE_KEY_WHITELIST_SUFFIXES = SENSITIVE_KEY_WHITELIST_SUFFIXES.map(
  (suffix) => normalizeLowercaseStringOrEmpty(suffix),
);

const SENSITIVE_PATTERNS = [
  /token$/i,
  /password/i,
  /secret/i,
  /api.?key/i,
  /encrypt.?key/i,
  /private.?key/i,
  /serviceaccount(?:ref)?$/i,
];

function isWhitelistedSensitivePath(path: string): boolean {
  const lowerPath = normalizeLowercaseStringOrEmpty(path);
  return NORMALIZED_SENSITIVE_KEY_WHITELIST_SUFFIXES.some((suffix) => lowerPath.endsWith(suffix));
}

function matchesSensitivePattern(path: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(path));
}

function isLocalServiceEnvValuePath(path: string): boolean {
  const lowerPath = normalizeLowercaseStringOrEmpty(path);
  return lowerPath.includes('localservice.env.');
}

/**
 * 分类其值应从 UI/API 输出中脱敏的配置路径。
 *
 * 这里有意基于路径标签而非 schema 节点工作，因此插件拥有的字段和原始本地服务 env 变量获得同样的保守处理。
 */
export function isSensitiveConfigPath(path: string): boolean {
  return (
    // 每个本地服务 env 值都是敏感的，即使名字看起来无害。
    isLocalServiceEnvValuePath(path) ||
    (!isWhitelistedSensitivePath(path) && matchesSensitivePattern(path))
  );
}
