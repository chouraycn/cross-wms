import { describe, it, expect } from 'vitest';
import { MemoryDocumentStorage } from '../DocumentStorage';
import { createDocumentStorage } from '../index';

describe('MemoryDocumentStorage', () => {
  it('create / get / list / count', () => {
    const s = new MemoryDocumentStorage();
    s.create('items', 1, { id: 1, name: 'a' });
    s.create('items', 2, { id: 2, name: 'b' });
    expect(s.count('items')).toBe(2);
    expect(s.get('items', 1)).toEqual({ id: 1, name: 'a' });
    expect(s.list('items')).toHaveLength(2);
  });

  it('update returns null when missing', () => {
    const s = new MemoryDocumentStorage();
    expect(s.update('items', 99, { name: 'x' })).toBeNull();
  });

  it('update merges partial fields', () => {
    const s = new MemoryDocumentStorage();
    s.create('items', 1, { id: 1, name: 'a', v: 1 });
    const updated = s.update('items', 1, { name: 'b' });
    expect(updated).toEqual({ id: 1, name: 'b', v: 1 });
  });

  it('delete returns boolean and is idempotent', () => {
    const s = new MemoryDocumentStorage();
    s.create('items', 1, { id: 1 });
    expect(s.delete('items', 1)).toBe(true);
    expect(s.delete('items', 1)).toBe(false);
  });

  it('find / findOne with predicate', () => {
    const s = new MemoryDocumentStorage();
    s.create('items', 1, { id: 1, tag: 'x' });
    s.create('items', 2, { id: 2, tag: 'y' });
    expect(s.find('items', (i: any) => i.tag === 'x')).toHaveLength(1);
    expect(s.findOne('items', (i: any) => i.tag === 'y')?.id).toBe(2);
  });

  it('nextId is monotonic and persisted', () => {
    const s = new MemoryDocumentStorage();
    expect(s.nextId('seq')).toBe(1);
    expect(s.nextId('seq')).toBe(2);
    expect(s.nextId('seq')).toBe(3);
  });

  it('isolates collections', () => {
    const s = new MemoryDocumentStorage();
    s.create('a', 1, { id: 1 });
    expect(s.count('b')).toBe(0);
  });
});

describe('createDocumentStorage factory', () => {
  it('returns in-memory backend for kind=memory', () => {
    const s = createDocumentStorage('memory');
    s.create('t', 1, { id: 1, k: 'v' });
    expect(s.get('t', 1)).toMatchObject({ id: 1, k: 'v' });
  });
});
