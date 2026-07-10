// ============================================================================
// storage/WmsFileStorage.ts — WMS JSON 文件存储层
//
// 为 WMS 业务数据提供基于 JSON 文件的存储层。
// 存储目录: ~/.cdf-know-clow/wms-data/
// 每个实体类型一个 JSON 文件，格式: { items: T[], lastId?: number }
// ============================================================================

import * as path from 'path';
import * as fs from 'fs';
import { AppPaths } from '../config/appPaths.js';
import type { DocumentStorage } from './DocumentStorage.js';

const WMS_DATA_DIR = AppPaths.wmsDataDir;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getFilePath(collection: string): string {
  return path.join(WMS_DATA_DIR, `${collection}.json`);
}

interface CollectionFile<T> {
  items: T[];
  lastId?: number;
}

function readFile<T>(collection: string): CollectionFile<T> {
  const filePath = getFilePath(collection);
  if (!fs.existsSync(filePath)) {
    return { items: [] };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as CollectionFile<T>;
  } catch {
    return { items: [] };
  }
}

function writeFile<T>(collection: string, data: CollectionFile<T>): void {
  ensureDir(WMS_DATA_DIR);
  const filePath = getFilePath(collection);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export class WmsFileStorage implements DocumentStorage {
  private static instance: WmsFileStorage | null = null;

  static getInstance(): WmsFileStorage {
    if (!WmsFileStorage.instance) {
      WmsFileStorage.instance = new WmsFileStorage();
    }
    return WmsFileStorage.instance;
  }

  // ===================== 通用 CRUD =====================

  list<T>(collection: string): T[] {
    const file = readFile<T>(collection);
    return file.items;
  }

  get<T>(collection: string, id: string | number): T | undefined {
    const file = readFile<T & { id: unknown }>(collection);
    return file.items.find((item) => item.id === id) as T | undefined;
  }

  create<T>(collection: string, id: string | number, data: T): T {
    const file = readFile<T>(collection);
    file.items.push(data);
    writeFile(collection, file);
    return data;
  }

  update<T>(collection: string, id: string | number, data: Partial<T>): T | null {
    const file = readFile<T & { id: unknown }>(collection);
    const index = file.items.findIndex((item) => item.id === id);
    if (index === -1) return null;
    file.items[index] = { ...file.items[index], ...data, id } as T & { id: unknown };
    writeFile(collection, file);
    return file.items[index] as T;
  }

  delete(collection: string, id: string | number): boolean {
    const file = readFile<{ id: unknown }>(collection);
    const originalLen = file.items.length;
    file.items = file.items.filter((item) => item.id !== id);
    if (file.items.length === originalLen) return false;
    writeFile(collection, file);
    return true;
  }

  // ===================== 查询 =====================

  find<T>(collection: string, predicate: (item: T) => boolean): T[] {
    const file = readFile<T>(collection);
    return file.items.filter(predicate);
  }

  findOne<T>(collection: string, predicate: (item: T) => boolean): T | undefined {
    const file = readFile<T>(collection);
    return file.items.find(predicate);
  }

  // ===================== 计数 =====================

  count(collection: string): number {
    const file = readFile<unknown>(collection);
    return file.items.length;
  }

  // ===================== 自增 ID =====================

  nextId(collection: string): number {
    const file = readFile<unknown>(collection);
    const next = (file.lastId ?? 0) + 1;
    file.lastId = next;
    writeFile(collection, file);
    return next;
  }
}
