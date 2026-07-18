/**
 * ConfigLookup — 基于扁平化 Record 的点号路径配置查询器
 *
 * 支持 'a.b.c' 形式的多级路径读写，底层存储为 Record<string, unknown>
 */

export class ConfigLookup {
  private store: Record<string, unknown>;

  constructor(initial: Record<string, unknown> = {}) {
    this.store = { ...initial };
  }

  /**
   * 获取配置值（支持点号路径，如 'models.default'）
   */
  get(key: string): unknown {
    const segments = splitKey(key);
    if (segments.length === 0) {
      return undefined;
    }
    let current: unknown = this.store;

    for (const segment of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  /**
   * 设置配置值（支持点号路径，自动创建中间对象）
   */
  set(key: string, value: unknown): void {
    const segments = splitKey(key);
    if (segments.length === 0) {
      return;
    }

    let current = this.store as Record<string, unknown>;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const next = current[segment];
      if (next === null || next === undefined || typeof next !== 'object' || Array.isArray(next)) {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }

    current[segments[segments.length - 1]] = value;
  }

  /**
   * 判断指定路径是否存在
   */
  has(key: string): boolean {
    const segments = splitKey(key);
    if (segments.length === 0) {
      return false;
    }
    let current: unknown = this.store;

    for (const segment of segments) {
      if (current === null || current === undefined) {
        return false;
      }
      if (typeof current !== 'object') {
        return false;
      }
      if (!(segment in (current as Record<string, unknown>))) {
        return false;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return true;
  }

  /**
   * 删除指定路径的配置值
   */
  delete(key: string): void {
    const segments = splitKey(key);
    if (segments.length === 0) {
      return;
    }

    let current: unknown = this.store;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (current === null || current === undefined) {
        return;
      }
      if (typeof current !== 'object') {
        return;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    if (current !== null && typeof current === 'object') {
      delete (current as Record<string, unknown>)[segments[segments.length - 1]];
    }
  }

  /**
   * 获取底层扁平/嵌套存储的只读视图
   */
  toObject(): Record<string, unknown> {
    return { ...this.store };
  }

  /**
   * 用新的根对象完全替换内部存储
   */
  replace(root: Record<string, unknown>): void {
    this.store = { ...root };
  }
}

function splitKey(key: string): string[] {
  return key
    .trim()
    .split('.')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
