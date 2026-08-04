/**
 * @vitest-environment node
 *
 * 内存引擎测试 — 记忆存储 / 检索 / 上下文管理
 *
 * 通过 mock appPaths 指向临时目录，隔离文件副作用；
 * mock memory-host registry 使向量搜索不可用，强制走文本搜索路径。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';

// 使用 vi.hoisted 确保 USER_DATA_DIR 在 vi.mock 工厂提升执行时可用
const { USER_DATA_DIR } = vi.hoisted(() => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-engine-test-'));
  return { USER_DATA_DIR: path.join(tmpDir, 'user-data') };
});

vi.mock('../config/appPaths.js', () => ({
  AppPaths: {
    userDataDir: USER_DATA_DIR,
  },
}));

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// mock memory-host registry：getDefaultHostId 返回 null → 向量搜索不可用
vi.mock('../engine/memory-host/index.js', () => ({
  getGlobalMemoryHostRegistry: () => ({
    getDefaultHostId: () => null,
  }),
}));

import { memoryEngine } from '../memoryEngine.js';

beforeEach(async () => {
  // 清空临时目录
  if (fs.existsSync(USER_DATA_DIR)) {
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  memoryEngine.destroy();
  await memoryEngine.init();
});

afterEach(() => {
  memoryEngine.destroy();
});

describe('init 初始化', () => {
  it('初始化后创建 memory 目录结构', () => {
    expect(fs.existsSync(path.join(USER_DATA_DIR, 'memory'))).toBe(true);
    expect(fs.existsSync(path.join(USER_DATA_DIR, 'memory', 'sessions'))).toBe(true);
  });

  it('重复 init 幂等', async () => {
    await expect(memoryEngine.init()).resolves.not.toThrow();
  });
});

describe('会话记忆存储', () => {
  it('addSessionMemory 写入并返回记忆条目', () => {
    const item = memoryEngine.addSessionMemory('sess-1', '用户偏好深色主题', {
      type: 'preference',
      importance: 8,
      tags: ['ui'],
    });
    expect(item.id).toBeTruthy();
    expect(item.content).toBe('用户偏好深色主题');
    expect(item.type).toBe('preference');
    expect(item.importance).toBe(8);
    expect(item.sourceSessionId).toBe('sess-1');
    expect(item.tags).toEqual(['ui']);
  });

  it('默认类型与重要性', () => {
    const item = memoryEngine.addSessionMemory('sess-1', 'some fact');
    expect(item.type).toBe('fact');
    expect(item.importance).toBe(5);
  });
});

describe('会话记忆检索', () => {
  beforeEach(() => {
    memoryEngine.addSessionMemory('sess-1', '苹果是水果', { importance: 7, tags: ['food'] });
    memoryEngine.addSessionMemory('sess-1', '香蕉也是水果', { importance: 5, tags: ['food'] });
    memoryEngine.addSessionMemory('sess-1', '汽车是交通工具', { importance: 3, tags: ['vehicle'] });
  });

  it('返回会话内所有记忆', async () => {
    const results = await memoryEngine.querySessionMemories('sess-1', { limit: 10 });
    expect(results.length).toBe(3);
  });

  it('按重要性过滤', async () => {
    const results = await memoryEngine.querySessionMemories('sess-1', { minImportance: 6 });
    expect(results.length).toBe(1);
    expect(results[0].content).toBe('苹果是水果');
  });

  it('按关键词搜索', async () => {
    const results = await memoryEngine.querySessionMemories('sess-1', { query: '水果' });
    expect(results.length).toBe(2);
    for (const r of results) {
      expect(r.content).toContain('水果');
    }
  });

  it('按标签过滤', async () => {
    const results = await memoryEngine.querySessionMemories('sess-1', { tags: ['vehicle'] });
    expect(results.length).toBe(1);
    expect(results[0].content).toBe('汽车是交通工具');
  });

  it('按重要性排序', async () => {
    const results = await memoryEngine.querySessionMemories('sess-1', {
      sortBy: 'importance',
      limit: 10,
    });
    expect(results[0].importance).toBeGreaterThanOrEqual(results[1].importance);
    expect(results[0].content).toBe('苹果是水果');
  });

  it('limit 限制返回数量', async () => {
    const results = await memoryEngine.querySessionMemories('sess-1', { limit: 2 });
    expect(results.length).toBe(2);
  });
});

describe('会话记忆更新与删除', () => {
  it('updateSessionMemory 更新字段', () => {
    const item = memoryEngine.addSessionMemory('sess-1', '原始内容');
    const updated = memoryEngine.updateSessionMemory('sess-1', item.id, {
      content: '更新内容',
      importance: 9,
    });
    expect(updated?.content).toBe('更新内容');
    expect(updated?.importance).toBe(9);
  });

  it('updateSessionMemory 对不存在 ID 返回 null', () => {
    expect(memoryEngine.updateSessionMemory('sess-1', 'nonexistent', { content: 'x' })).toBeNull();
  });

  it('deleteSessionMemory 删除', () => {
    const item = memoryEngine.addSessionMemory('sess-1', '待删除');
    expect(memoryEngine.deleteSessionMemory('sess-1', item.id)).toBe(true);
    expect(memoryEngine.deleteSessionMemory('sess-1', item.id)).toBe(false);
  });
});

describe('全局记忆', () => {
  it('addGlobalMemory 默认重要性 7', () => {
    const item = memoryEngine.addGlobalMemory('全局事实');
    expect(item.importance).toBe(7);
  });

  it('queryGlobalMemories 检索', async () => {
    memoryEngine.addGlobalMemory('地球是圆的', { importance: 10, tags: ['science'] });
    memoryEngine.addGlobalMemory('苹果是水果', { importance: 6, tags: ['food'] });

    const all = await memoryEngine.queryGlobalMemories({ limit: 10 });
    expect(all.length).toBe(2);

    const science = await memoryEngine.queryGlobalMemories({ tags: ['science'] });
    expect(science.length).toBe(1);
    expect(science[0].content).toBe('地球是圆的');
  });

  it('deleteGlobalMemory 删除', () => {
    const item = memoryEngine.addGlobalMemory('待删除全局');
    expect(memoryEngine.deleteGlobalMemory(item.id)).toBe(true);
    expect(memoryEngine.deleteGlobalMemory(item.id)).toBe(false);
  });

  it('promoteToGlobal 从会话记忆升级', () => {
    const sessionItem = memoryEngine.addSessionMemory('sess-1', '值得长期保留', {
      importance: 6,
    });
    const promoted = memoryEngine.promoteToGlobal('sess-1', sessionItem.id);
    expect(promoted).not.toBeNull();
    expect(promoted?.content).toBe('值得长期保留');
    // 升级后重要性 +2（上限 10）
    expect(promoted?.importance).toBe(8);
    // 应有新的 ID
    expect(promoted?.id).not.toBe(sessionItem.id);
  });

  it('promoteToGlobal 对不存在 ID 返回 null', () => {
    expect(memoryEngine.promoteToGlobal('sess-1', 'nonexistent')).toBeNull();
  });
});

describe('上下文管理 getContextPrompt', () => {
  it('无记忆时返回空字符串', async () => {
    const prompt = await memoryEngine.getContextPrompt('empty-sess');
    expect(prompt).toBe('');
  });

  it('返回格式化的上下文提示', async () => {
    memoryEngine.addGlobalMemory('全局重要事实', { importance: 10 });
    memoryEngine.addSessionMemory('sess-1', '会话内记忆', { importance: 8 });

    const prompt = await memoryEngine.getContextPrompt('sess-1');
    expect(prompt).toContain('全局重要事实');
    expect(prompt).toContain('会话内记忆');
  });
});

describe('cleanup 清理过期记忆', () => {
  it('清理低重要性且长期未访问的记忆', () => {
    // importance 1，会被清理（minImportance 默认 3）
    memoryEngine.addGlobalMemory('低重要性', { importance: 1 });
    // importance 10，不会被清理
    memoryEngine.addGlobalMemory('高重要性', { importance: 10 });

    const removed = memoryEngine.cleanup({ olderThanDays: 0, minImportance: 3 });
    expect(removed).toBeGreaterThanOrEqual(1);

    // 高重要性应保留
    const remaining = memoryEngine
      .queryGlobalMemories({ limit: 100 });
    // cleanup 是同步的，但 queryGlobalMemories 是 async
    return remaining.then((items) => {
      const contents = items.map((i) => i.content);
      expect(contents).toContain('高重要性');
      expect(contents).not.toContain('低重要性');
    });
  });
});
