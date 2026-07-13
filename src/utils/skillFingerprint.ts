/**
 * 浏览器端 SKILL.md 内容指纹计算
 * 使用 Web Crypto API 的 SHA-256，避免在渲染进程依赖 Node crypto。
 */

export interface SkillFingerprint {
  /** 16 位十六进制哈希摘要 */
  hash: string;
  /** 基于哈希生成的版本号 */
  version: string;
}

export async function computeSkillFingerprint(content: string): Promise<SkillFingerprint> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(digest));
  const fullHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  const hash = fullHash.slice(0, 16);
  const version = `v1.${parseInt(hash.slice(0, 8), 16).toString(10).padStart(8, '0')}`;
  return { hash, version };
}
