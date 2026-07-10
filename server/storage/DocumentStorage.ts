// ============================================================================
// storage/DocumentStorage.ts — 文档式存储统一接口
//
// 补齐双层存储架构中「JSON / 文档」一侧的统一抽象。
// IStorageEngine 面向 SQL 语义（prepare/exec/get/all/run/transaction），
// 而 WMS 业务数据使用 JSON 文件集合（list/get/create/update/delete/find），
// 两者并不互通 —— 这正是历史「双存储漂移」的根源。
//
// 本接口定义集合(Collection)式 CRUD 契约，使：
//   - WmsFileStorage（JSON 文件）实现 DocumentStorage
//   - MemoryDocumentStorage（内存，供单测 / DAO 切换）实现 DocumentStorage
// 上层 DAO 通过 createDocumentStorage(kind) 拿到统一接口，
// 不再直接依赖具体后端，从而实现存储收敛。
// ============================================================================

/**
 * 文档式存储引擎接口（集合 / 文档语义）。
 */
export interface DocumentStorage {
  /** 列出集合下全部文档 */
  list<T>(collection: string): T[];

  /** 按 id 获取单个文档 */
  get<T>(collection: string, id: string | number): T | undefined;

  /** 创建文档（指定 id） */
  create<T>(collection: string, id: string | number, data: T): T;

  /** 局部更新文档，不存在返回 null */
  update<T>(collection: string, id: string | number, data: Partial<T>): T | null;

  /** 删除文档，返回是否删除成功 */
  delete(collection: string, id: string | number): boolean;

  /** 按谓词查询集合 */
  find<T>(collection: string, predicate: (item: T) => boolean): T[];

  /** 按谓词取首个匹配文档 */
  findOne<T>(collection: string, predicate: (item: T) => boolean): T | undefined;

  /** 集合文档数量 */
  count(collection: string): number;

  /** 取下一个自增 id（持久化） */
  nextId(collection: string): number;
}

/**
 * 内存实现：用于单测、以及 DAO 在测试 / 轻量场景下切换到内存后端。
 * 不落盘，进程内有效。
 */
export class MemoryDocumentStorage implements DocumentStorage {
  private collections = new Map<string, { items: Array<Record<string, unknown> & { id: unknown }>; lastId?: number }>();

  private ensure(collection: string) {
    let c = this.collections.get(collection);
    if (!c) {
      c = { items: [] };
      this.collections.set(collection, c);
    }
    return c;
  }

  list<T>(collection: string): T[] {
    return this.ensure(collection).items.slice() as unknown as T[];
  }

  get<T>(collection: string, id: string | number): T | undefined {
    const item = this.ensure(collection).items.find((it) => it.id === id);
    return item ? ({ ...item } as unknown as T) : undefined;
  }

  create<T>(collection: string, id: string | number, data: T): T {
    const c = this.ensure(collection);
    const record = { ...(data as object), id } as Record<string, unknown> & { id: unknown };
    c.items.push(record);
    return { ...record } as unknown as T;
  }

  update<T>(collection: string, id: string | number, data: Partial<T>): T | null {
    const c = this.ensure(collection);
    const index = c.items.findIndex((it) => it.id === id);
    if (index === -1) return null;
    c.items[index] = { ...c.items[index], ...(data as object), id };
    return { ...c.items[index] } as unknown as T;
  }

  delete(collection: string, id: string | number): boolean {
    const c = this.ensure(collection);
    const before = c.items.length;
    c.items = c.items.filter((it) => it.id !== id);
    return c.items.length !== before;
  }

  find<T>(collection: string, predicate: (item: T) => boolean): T[] {
    return this.ensure(collection).items
      .filter((it) => predicate(it as unknown as T))
      .map((it) => ({ ...it } as unknown as T));
  }

  findOne<T>(collection: string, predicate: (item: T) => boolean): T | undefined {
    const found = this.ensure(collection).items.find((it) => predicate(it as unknown as T));
    return found ? ({ ...found } as unknown as T) : undefined;
  }

  count(collection: string): number {
    return this.ensure(collection).items.length;
  }

  nextId(collection: string): number {
    const c = this.ensure(collection);
    const next = (c.lastId ?? 0) + 1;
    c.lastId = next;
    return next;
  }
}
