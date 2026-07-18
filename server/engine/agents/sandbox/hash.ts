/**
 * 沙箱哈希辅助工具
 *
 * 提供稳定的 SHA-256 摘要，用于沙箱配置哈希、缓存键等场景。
 * 对象会先进行稳定序列化（按键名排序），再计算摘要，确保相同内容产生相同哈希。
 */
import crypto from 'node:crypto';

/** 将值稳定序列化为字符串（对象键名按字典序排序，保证序列化结果与键出现顺序无关） */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`,
  );
  return `{${entries.join(',')}}`;
}

/**
 * 返回输入的稳定 SHA-256 十六进制摘要
 * @param input 字符串、Buffer 或对象
 */
export function stableHash(input: string | Buffer | object): string {
  if (typeof input === 'string') {
    return crypto.createHash('sha256').update(input).digest('hex');
  }
  if (Buffer.isBuffer(input)) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }
  return crypto.createHash('sha256').update(stableStringify(input)).digest('hex');
}

/**
 * 稳定序列化对象后计算 SHA-256 摘要
 * @param obj 待哈希的对象
 */
export function hashObject(obj: object): string {
  return crypto.createHash('sha256').update(stableStringify(obj)).digest('hex');
}

/**
 * 返回哈希的前 N 位字符
 * @param input 字符串、Buffer 或对象
 * @param length 截取长度，默认 12
 */
export function shortHash(input: string | Buffer | object, length = 12): string {
  return stableHash(input).slice(0, length);
}
