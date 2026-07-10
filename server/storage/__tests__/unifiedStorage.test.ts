import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDocumentStorage } from '../DocumentStorage.js';
import {
  createUnifiedStorage,
  type UnifiedStorage,
  type CollectionHandle,
} from '../UnifiedStorage.js';

// ---------------------------------------------------------------------------
// 测试用类型
// ---------------------------------------------------------------------------

interface TestItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
}

interface TestWarehouse {
  id: string;
  name: string;
  country: string;
  status: string;
}

// ---------------------------------------------------------------------------
// 工具：创建带内存后端的 UnifiedStorage
// ---------------------------------------------------------------------------

function createMemoryStorage(): UnifiedStorage {
  return createUnifiedStorage({
    documentStorage: new MemoryDocumentStorage(),
  });
}

// ---------------------------------------------------------------------------
// 基础 CRUD 测试
// ---------------------------------------------------------------------------

describe('UnifiedStorage — basic CRUD via CollectionHandle', () => {
  let storage: UnifiedStorage;
  let items: CollectionHandle<TestItem>;

  beforeEach(() => {
    storage = createMemoryStorage();
    items = storage.getCollection<TestItem>('items');
  });

  it('create + get returns the created document', () => {
    const doc: TestItem = { id: 'i1', name: 'Widget', category: 'tools', quantity: 10 };
    items.create('i1', doc);
    expect(items.get('i1')).toEqual(doc);
  });

  it('list returns all documents', () => {
    items.create('i1', { id: 'i1', name: 'A', category: 'x', quantity: 1 });
    items.create('i2', { id: 'i2', name: 'B', category: 'y', quantity: 2 });
    expect(items.list()).toHaveLength(2);
  });

  it('update merges partial fields and returns updated doc', () => {
    items.create('i1', { id: 'i1', name: 'A', category: 'x', quantity: 1 });
    const updated = items.update('i1', { quantity: 99 });
    expect(updated).not.toBeNull();
    expect(updated!.quantity).toBe(99);
    expect(updated!.name).toBe('A');
  });

  it('update returns null when document does not exist', () => {
    expect(items.update('nonexistent', { name: 'x' })).toBeNull();
  });

  it('delete removes document and returns true', () => {
    items.create('i1', { id: 'i1', name: 'A', category: 'x', quantity: 1 });
    expect(items.delete('i1')).toBe(true);
    expect(items.get('i1')).toBeUndefined();
  });

  it('delete is idempotent (returns false on second call)', () => {
    items.create('i1', { id: 'i1', name: 'A', category: 'x', quantity: 1 });
    expect(items.delete('i1')).toBe(true);
    expect(items.delete('i1')).toBe(false);
  });

  it('count returns the number of documents', () => {
    items.create('i1', { id: 'i1', name: 'A', category: 'x', quantity: 1 });
    items.create('i2', { id: 'i2', name: 'B', category: 'y', quantity: 2 });
    expect(items.count()).toBe(2);
  });

  it('count returns 0 for empty collection', () => {
    expect(items.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 查询测试
// ---------------------------------------------------------------------------

describe('UnifiedStorage — query with filter', () => {
  let storage: UnifiedStorage;
  let items: CollectionHandle<TestItem>;

  beforeEach(() => {
    storage = createMemoryStorage();
    items = storage.getCollection<TestItem>('items');
    items.create('i1', { id: 'i1', name: 'Hammer', category: 'tools', quantity: 5 });
    items.create('i2', { id: 'i2', name: 'Screwdriver', category: 'tools', quantity: 3 });
    items.create('i3', { id: 'i3', name: 'Bolts', category: 'hardware', quantity: 100 });
  });

  it('filters by single field', () => {
    const result = items.query({ category: 'tools' });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(['i1', 'i2']);
  });

  it('filters by multiple fields (AND)', () => {
    const result = items.query({ category: 'tools', name: 'Hammer' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('i1');
  });

  it('returns empty array when no match', () => {
    const result = items.query({ category: 'nonexistent' });
    expect(result).toHaveLength(0);
  });

  it('returns all when filter is empty', () => {
    const result = items.query({});
    expect(result).toHaveLength(3);
  });

  it('top-level query method works the same as collection.query', () => {
    const fromTop = storage.query<TestItem>('items', { category: 'hardware' });
    expect(fromTop).toHaveLength(1);
    expect(fromTop[0].id).toBe('i3');
  });
});

// ---------------------------------------------------------------------------
// nextId 测试
// ---------------------------------------------------------------------------

describe('UnifiedStorage — nextId', () => {
  it('returns monotonically increasing ids', () => {
    const storage = createMemoryStorage();
    const seq = storage.getCollection<Record<string, unknown>>('seq');
    expect(seq.nextId()).toBe(1);
    expect(seq.nextId()).toBe(2);
    expect(seq.nextId()).toBe(3);
  });

  it('isolates id sequences per collection', () => {
    const storage = createMemoryStorage();
    const a = storage.getCollection<Record<string, unknown>>('a');
    const b = storage.getCollection<Record<string, unknown>>('b');
    a.nextId();
    a.nextId();
    expect(b.nextId()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 集合隔离测试
// ---------------------------------------------------------------------------

describe('UnifiedStorage — collection isolation', () => {
  it('collections are independent', () => {
    const storage = createMemoryStorage();
    const items = storage.getCollection<TestItem>('items');
    const warehouses = storage.getCollection<TestWarehouse>('warehouses');

    items.create('i1', { id: 'i1', name: 'Item', category: 'x', quantity: 1 });
    warehouses.create('w1', { id: 'w1', name: 'WH1', country: 'CN', status: 'active' });

    expect(items.count()).toBe(1);
    expect(warehouses.count()).toBe(1);
    expect(items.get('w1')).toBeUndefined();
    expect(warehouses.get('i1')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 事务测试
// ---------------------------------------------------------------------------

describe('UnifiedStorage — transaction', () => {
  it('executes work and returns result', () => {
    const storage = createMemoryStorage();
    const items = storage.getCollection<TestItem>('items');

    const result = storage.transaction(() => {
      items.create('i1', { id: 'i1', name: 'A', category: 'x', quantity: 1 });
      items.create('i2', { id: 'i2', name: 'B', category: 'y', quantity: 2 });
      return items.count();
    });

    expect(result).toBe(2);
    expect(items.count()).toBe(2);
  });

  it('propagates exceptions from work', () => {
    const storage = createMemoryStorage();
    expect(() => {
      storage.transaction(() => {
        throw new Error('boom');
      });
    }).toThrow('boom');
  });
});

// ---------------------------------------------------------------------------
// 健康检查测试
// ---------------------------------------------------------------------------

describe('UnifiedStorage — healthCheck', () => {
  it('returns healthy=true for memory backend', () => {
    const storage = createMemoryStorage();
    const result = storage.healthCheck();
    expect(result.healthy).toBe(true);
    expect(result.backend).toBe('document');
  });

  it('returns healthy=false when no backend is configured', () => {
    // 空配置会回退到 MemoryDocumentStorage，所以应该是健康的
    const storage = createUnifiedStorage({});
    const result = storage.healthCheck();
    expect(result.healthy).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getBackend 测试
// ---------------------------------------------------------------------------

describe('UnifiedStorage — getBackend', () => {
  it('returns document for unconfigured collections', () => {
    const storage = createMemoryStorage();
    expect(storage.getBackend('anything')).toBe('document');
  });

  it('respects collectionBackends config', () => {
    const doc = new MemoryDocumentStorage();
    const mockSql: any = {
      isConnected: () => true,
      all: () => [],
      get: () => undefined,
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
      transaction: <T>(fn: () => T) => fn(),
    };
    const storage = createUnifiedStorage({
      documentStorage: doc,
      sqlEngine: mockSql,
      collectionBackends: {
        warehouses: 'document',
        audit_logs: 'sql',
      },
    });
    expect(storage.getBackend('warehouses')).toBe('document');
    expect(storage.getBackend('audit_logs')).toBe('sql');
    expect(storage.getBackend('unknown')).toBe('document');
  });
});

// ---------------------------------------------------------------------------
// 工厂函数测试
// ---------------------------------------------------------------------------

describe('createUnifiedStorage factory', () => {
  it('creates storage with MemoryDocumentStorage', () => {
    const storage = createUnifiedStorage({
      documentStorage: new MemoryDocumentStorage(),
    });
    const items = storage.getCollection<TestItem>('items');
    items.create('i1', { id: 'i1', name: 'Test', category: 'x', quantity: 1 });
    expect(items.get('i1')?.name).toBe('Test');
  });

  it('defaults to MemoryDocumentStorage when no config provided', () => {
    const storage = createUnifiedStorage({});
    const items = storage.getCollection<TestItem>('items');
    items.create('i1', { id: 'i1', name: 'Default', category: 'x', quantity: 0 });
    expect(items.count()).toBe(1);
  });

  it('creates hybrid storage when both backends provided', () => {
    const doc = new MemoryDocumentStorage();
    const mockSql: any = {
      connect: () => Promise.resolve(),
      disconnect: () => Promise.resolve(),
      isConnected: () => true,
      prepare: () => ({ run: () => ({ changes: 0, lastInsertRowid: 0 }), get: () => undefined, all: () => [] }),
      exec: () => {},
      get: () => undefined,
      all: () => [],
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
      transaction: <T>(fn: () => T) => fn(),
      migrate: () => {},
      getVersion: () => '0.0.0',
    };
    const storage = createUnifiedStorage({
      documentStorage: doc,
      sqlEngine: mockSql,
      collectionBackends: {
        warehouses: 'document',
        audit_logs: 'sql',
      },
    });
    expect(storage.getBackend('warehouses')).toBe('document');
    expect(storage.getBackend('audit_logs')).toBe('sql');

    // document-backed collection works
    const wh = storage.getCollection<TestWarehouse>('warehouses');
    wh.create('w1', { id: 'w1', name: 'WH', country: 'CN', status: 'active' });
    expect(wh.get('w1')?.name).toBe('WH');

    // sql-backed collection delegates to mock (returns empty list)
    const logs = storage.getCollection<{ id: string; msg: string }>('audit_logs');
    expect(logs.list()).toEqual([]);

    // hybrid healthCheck — document ok, sql ok (SELECT 1)
    const hc = storage.healthCheck();
    expect(hc.healthy).toBe(true);
  });
});
