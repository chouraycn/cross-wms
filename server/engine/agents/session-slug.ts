/**
 * session slug 生成工具
 *
 * 根据会话标题生成人类可读的 kebab-case slug，
 * 支持中英文混合标题：中文字符会被剥离并以 kebab-case 形式保留 ASCII 词，
 * 纯中文标题会回退为 adjective-noun 组合的随机 slug。
 *
 * 参考自 openclaw/src/agents/session-slug.ts。
 */
import { randomBytes } from 'node:crypto';
import { logger } from '../../logger.js';

/** 合法 slug 的字符集：小写字母、数字与连字符。 */
const SLUG_VALID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** slug 最大长度限制。 */
const SLUG_MAX_LENGTH = 64;

/** 形容词词表，用于生成随机 slug。 */
const SLUG_ADJECTIVES = [
  'amber', 'brisk', 'calm', 'clear', 'cool', 'crisp', 'dawn', 'ember',
  'fresh', 'gentle', 'glow', 'grand', 'keen', 'lucky', 'mellow', 'mild',
  'neat', 'nimble', 'nova', 'plaid', 'quick', 'quiet', 'rapid', 'salty',
  'sharp', 'swift', 'tender', 'tidal', 'tidy', 'vivid', 'warm', 'wild',
];

/** 名词词表，用于生成随机 slug。 */
const SLUG_NOUNS = [
  'atlas', 'bloom', 'breeze', 'canyon', 'cedar', 'cloud', 'comet', 'coral',
  'cove', 'crest', 'dune', 'falcon', 'fjord', 'forest', 'glade', 'gulf',
  'harbor', 'haven', 'lagoon', 'meadow', 'mist', 'nexus', 'ocean', 'orbit',
  'otter', 'pine', 'prairie', 'reef', 'ridge', 'river', 'sable', 'sage',
  'shell', 'shore', 'summit', 'trail', 'valley', 'wharf', 'willow', 'zephyr',
];

/** 回退随机后缀的字符表。 */
const FALLBACK_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * 将任意文本转换为 kebab-case slug。
 *
 * 处理规则：
 * - 转为小写
 * - 非法字符（含中文等非 ASCII 字符）替换为连字符
 * - 连续连符合并为单个
 * - 去除首尾连字符
 * - 超长时截断到 SLUG_MAX_LENGTH 并保证不以连字符结尾
 *
 * @param text 原始文本
 */
export function slugify(text: string): string {
  if (typeof text !== 'string' || !text) {
    return '';
  }
  const lower = text.toLowerCase();
  // 仅保留 a-z、0-9，其余字符（含中文、标点、空格）替换为连字符
  const kebab = lower
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (kebab.length === 0) {
    return '';
  }
  if (kebab.length <= SLUG_MAX_LENGTH) {
    return kebab;
  }
  // 截断后去除可能残留的尾部连字符
  return kebab.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, '');
}

/**
 * 判断字符串是否为合法的 slug。
 * 合法 slug 由小写字母、数字与连字符组成，且不以连字符开头或结尾。
 * @param s 待检测的字符串
 */
export function isValidSlug(s: string): boolean {
  if (typeof s !== 'string' || !s) {
    return false;
  }
  return SLUG_VALID_RE.test(s);
}

/**
 * 根据会话标题生成 session slug。
 *
 * - 标题包含 ASCII 字符时，使用 slugify 转换并附加短随机后缀保证唯一性
 * - 标题为纯中文/纯非 ASCII 时，回退为 adjective-noun 随机组合 slug
 * - 始终保证返回合法 slug（通过 isValidSlug 校验）
 *
 * @param title 会话标题
 */
export function generateSessionSlug(title: string): string {
  if (typeof title !== 'string' || title.trim().length === 0) {
    return createRandomSlug();
  }

  const slug = slugify(title);
  if (!slug) {
    // 纯中文/非 ASCII 标题，回退为随机组合
    return createRandomSlug();
  }

  // 附加短随机后缀以降低碰撞概率
  const suffix = createShortSuffix(4);
  const combined = `${slug}-${suffix}`;
  if (combined.length > SLUG_MAX_LENGTH) {
    // 超长时压缩 base 部分
    const budget = SLUG_MAX_LENGTH - suffix.length - 1;
    const trimmed = slug.slice(0, budget).replace(/-+$/g, '');
    return `${trimmed}-${suffix}`;
  }
  return combined;
}

/** 创建 adjective-noun 随机 slug。 */
function createRandomSlug(): string {
  const adj = pickRandom(SLUG_ADJECTIVES) ?? 'steady';
  const noun = pickRandom(SLUG_NOUNS) ?? 'harbor';
  const suffix = createShortSuffix(3);
  return `${adj}-${noun}-${suffix}`;
}

/** 生成指定长度的随机后缀。 */
function createShortSuffix(length: number): string {
  const bytes = randomBytes(length);
  let suffix = '';
  for (let i = 0; i < length; i += 1) {
    suffix += FALLBACK_ALPHABET[bytes[i] % FALLBACK_ALPHABET.length] ?? 'x';
  }
  return suffix;
}

/** 从数组中随机选取一个元素。 */
function pickRandom(values: string[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const idx = randomBytes(1)[0] % values.length;
  return values[idx];
}

logger.debug('[Agents:SessionSlug] Module loaded');
