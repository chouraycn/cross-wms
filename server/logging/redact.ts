/**
 * 密钥脱敏模块
 *
 * 参考 OpenClaw 的 src/logging/redact.ts 设计
 * - 支付凭据 / Auth 凭据 key 识别
 * - form-body / URL query / standalone assignment 三类上下文脱敏
 * - 处理不可见字符（零宽字符 / 方向控制符）混淆
 * - 长值保留首 6 末 4（中间以 ... 替代），短值全量替换为 [REDACTED]
 */

/** 脱敏模式：off=关闭脱敏, tools=启用工具调用脱敏 */
export type RedactSensitiveMode = 'off' | 'tools';

/** 最小脱敏长度：值长度 >= 该值才保留首尾，否则全量替换 */
const MIN_REDACT_LENGTH = 18;

/** 不可见字符范围（零宽空格 / 方向控制符 / BOM 等，用于对抗 key 混淆） */
const INVISIBLE_CHARS = '[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF]';

/**
 * 敏感 key 集合（覆盖 30+ 支付凭据 / Auth 凭据键名）
 * 全部小写存储，匹配时大小写不敏感
 */
export const BODY_SECRET_KEYS: ReadonlySet<string> = new Set<string>([
  // 支付凭据：CARD_NUMBER, CVC, CVV, PAN, CARD_HOLDER 等 env/query key
  'card_number',
  'cardnumber',
  'card_no',
  'cardno',
  'cvc',
  'cvv',
  'pan',
  'card_holder',
  'cardholder',
  'cardholder_name',
  'expiry_date',
  'expiry',
  'expiration',
  'expiration_date',
  'exp_month',
  'exp_year',
  // Auth query key：access_token, refresh_token, api_key, authorization, jwt, bearer 等
  'access_token',
  'refresh_token',
  'refreshtoken',
  'api_key',
  'apikey',
  'client_secret',
  'clientsecret',
  'authorization',
  'jwt',
  'bearer',
  'id_token',
  'password',
  'passwd',
  'secret',
  'token',
  'private_key',
  'privatekey',
  'session_token',
  'sessiontoken',
  'auth_token',
  'authtoken',
  'api_secret',
  'apisecret',
]);

/** 转义正则特殊字符 */
function escapeRegExpChar(ch: string): string {
  if (/[a-z0-9_]/i.test(ch)) return ch;
  return '\\' + ch;
}

/**
 * 构建敏感 key 的正则片段
 * 每个字符之间允许插入不可见字符，对抗零宽字符混淆
 * 长键优先匹配，避免短键（如 token）误吞噬长键（如 access_token）
 */
function buildKeyPattern(keys: ReadonlySet<string>): string {
  const sorted = Array.from(keys).sort((a, b) => b.length - a.length);
  const alternated = sorted
    .map(k => k.split('').map(escapeRegExpChar).join(`${INVISIBLE_CHARS}*`))
    .join('|');
  return `(?:${alternated})`;
}

const KEY_PATTERN = buildKeyPattern(BODY_SECRET_KEYS);

/**
 * 统一脱敏正则，覆盖三类上下文：
 *   (a) URL query pair:        ?key=value / &key=value
 *   (b) form-body pair:        &key=value / 行首 key=value（含不可见字符混淆）
 *   (c) standalone assignment: key=value（空白 / 分隔符边界）
 *
 * 捕获组：P1=前缀边界, K=敏感 key, V=值
 * 值遇 & # 空白 , ; { } [ ] ) " ' < > 终止
 */
const SECRET_PAIR_RE = new RegExp(
  `(^|[?&\\s,;{\\(\\[\\]"'])` +                 // P1: 前缀 / 边界
  `(${KEY_PATTERN})` +                            // K: 敏感 key
  `${INVISIBLE_CHARS}*=${INVISIBLE_CHARS}*` +     // = （允许周围不可见字符）
  `([^&#\\s,;{}\\[\\]\\)"'<>]+)`,                 // V: 值（遇分隔符终止）
  'gi',
);

/** 对单个敏感值进行脱敏：长值保留首 6 末 4，短值全量替换 */
function redactValue(value: string): string {
  if (value.length >= MIN_REDACT_LENGTH) {
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  }
  return '[REDACTED]';
}

/**
 * 对文本执行密钥脱敏
 * @param text 待脱敏文本
 * @param mode 脱敏模式，默认 'tools'
 */
export function redactSecrets(text: string, mode: RedactSensitiveMode = 'tools'): string {
  if (!text || mode === 'off') return text;
  return text.replace(
    SECRET_PAIR_RE,
    (_match, prefix: string, key: string, value: string) => `${prefix}${key}=${redactValue(value)}`,
  );
}

/**
 * 对文本执行敏感信息脱敏（redactSecrets 的封装，默认 tools 模式）
 */
export function redactSensitiveText(text: string): string {
  return redactSecrets(text, 'tools');
}

/**
 * 递归脱敏对象
 * - key 命中 BODY_SECRET_KEYS 的字段：原始值替换为 [REDACTED]（嵌套对象继续递归）
 * - 字符串值：内部若包含 key=value 形态，同样脱敏
 * @param obj 待脱敏对象
 * @param mode 脱敏模式，默认 'tools'
 */
export function redactObject(obj: unknown, mode: RedactSensitiveMode = 'tools'): unknown {
  if (mode === 'off') return obj;
  if (obj === null) return obj;
  if (typeof obj === 'string') return redactSecrets(obj, mode);
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => redactObject(item, mode));

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (BODY_SECRET_KEYS.has(k.toLowerCase())) {
      // 敏感 key：原值脱敏（嵌套对象递归，原始值直接替换）
      result[k] = v !== null && typeof v === 'object' ? redactObject(v, mode) : '[REDACTED]';
    } else {
      result[k] = redactObject(v, mode);
    }
  }
  return result;
}
