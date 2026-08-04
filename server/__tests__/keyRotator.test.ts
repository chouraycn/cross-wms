/**
 * @vitest-environment node
 *
 * API Key 轮换测试 — 轮换逻辑 / 过期清理 / 并发安全
 *
 * 通过 mock appPaths 指向临时目录，隔离持久化文件副作用。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';

// 使用 vi.hoisted 确保 MODELS_DIR 在 vi.mock 工厂提升执行时可用
const { MODELS_DIR } = vi.hoisted(() => {
  // hoisted 回调先于 import 执行，使用 require 访问 node 内置模块
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keyrotator-test-'));
  return { MODELS_DIR: path.join(tmpDir, 'ai-models') };
});

vi.mock('../config/appPaths.js', () => ({
  AppPaths: {
    modelsDir: MODELS_DIR,
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

import {
  selectKey,
  reportKeyResult,
  getKeyStatus,
  clearRotationState,
} from '../keyRotator.js';
import type { ModelConfig } from '../../shared/types/models.js';

function makeModel(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: 'model-test',
    name: 'Test Model',
    provider: 'openai',
    enabled: true,
    ...overrides,
  } as ModelConfig;
}

beforeEach(() => {
  // 清空目录，确保无残留状态文件
  if (fs.existsSync(MODELS_DIR)) {
    for (const f of fs.readdirSync(MODELS_DIR)) {
      fs.unlinkSync(path.join(MODELS_DIR, f));
    }
  } else {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }
  // 清除内存中的轮询状态
  clearRotationState('model-rr');
  clearRotationState('model-fo');
  clearRotationState('model-single');
  clearRotationState('model-empty');
});

afterEach(() => {
  clearRotationState('model-rr');
  clearRotationState('model-fo');
  clearRotationState('model-single');
  clearRotationState('model-empty');
});

describe('selectKey 基础', () => {
  it('无 Key 返回 null', () => {
    const model = makeModel({ id: 'model-empty' });
    expect(selectKey(model)).toBeNull();
  });

  it('单 Key 模式：始终返回同一 Key', () => {
    const model = makeModel({
      id: 'model-single',
      apiKey: 'sk-single',
    });
    const r1 = selectKey(model);
    const r2 = selectKey(model);
    expect(r1?.key).toBe('sk-single');
    expect(r1?.index).toBe(0);
    expect(r2?.key).toBe('sk-single');
    expect(r2?.index).toBe(0);
  });

  it('兼容旧数据：apiKey 字段', () => {
    const model = makeModel({ id: 'model-single', apiKey: ' legacy-key ' });
    expect(selectKey(model)?.key).toBe('legacy-key');
  });
});

describe('round-robin 轮换', () => {
  it('按顺序循环使用多 Key', () => {
    const model = makeModel({
      id: 'model-rr',
      keyStrategy: 'round-robin',
      apiKeys: [
        { key: 'sk-a' },
        { key: 'sk-b' },
        { key: 'sk-c' },
      ],
    });

    const keys: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = selectKey(model);
      if (r) keys.push(r.key);
    }
    // 轮询顺序：a, b, c, a, b, c
    expect(keys).toEqual(['sk-a', 'sk-b', 'sk-c', 'sk-a', 'sk-b', 'sk-c']);
  });

  it('跳过 enabled=false 的 Key', () => {
    const model = makeModel({
      id: 'model-rr',
      keyStrategy: 'round-robin',
      apiKeys: [
        { key: 'sk-a' },
        { key: 'sk-b', enabled: false },
        { key: 'sk-c' },
      ],
    });
    const keys: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = selectKey(model);
      if (r) keys.push(r.key);
    }
    // 只在 a, c 之间轮询
    expect(keys).toEqual(['sk-a', 'sk-c', 'sk-a', 'sk-c']);
  });
});

describe('failover 故障转移', () => {
  it('默认使用主 Key', () => {
    const model = makeModel({
      id: 'model-fo',
      keyStrategy: 'failover',
      apiKeys: [{ key: 'sk-primary' }, { key: 'sk-backup' }],
    });
    expect(selectKey(model)?.key).toBe('sk-primary');
  });

  it('主 Key 连续失败达到阈值后切换到备用 Key', () => {
    const model = makeModel({
      id: 'model-fo',
      keyStrategy: 'failover',
      apiKeys: [{ key: 'sk-primary' }, { key: 'sk-backup' }],
    });

    // 主 Key 健康时返回主
    expect(selectKey(model)?.key).toBe('sk-primary');

    // 报告主 Key 失败两次（达到 FAILOVER_THRESHOLD=2）
    reportKeyResult('model-fo', 0, false);
    reportKeyResult('model-fo', 0, false);

    // 再次选择：主 Key 失败次数已达阈值，应切换到备用
    const next = selectKey(model);
    expect(next?.key).toBe('sk-backup');
  });

  it('成功报告重置失败计数', () => {
    const model = makeModel({
      id: 'model-fo',
      keyStrategy: 'failover',
      apiKeys: [{ key: 'sk-primary' }, { key: 'sk-backup' }],
    });

    reportKeyResult('model-fo', 0, false);
    reportKeyResult('model-fo', 0, true); // 成功重置
    // 主 Key 仍健康
    expect(selectKey(model)?.key).toBe('sk-primary');
  });
});

describe('getKeyStatus 与 clearRotationState', () => {
  it('getKeyStatus 返回状态信息', () => {
    const model = makeModel({
      id: 'model-fo',
      keyStrategy: 'failover',
      apiKeys: [{ key: 'sk-a' }, { key: 'sk-b' }],
    });
    selectKey(model); // 触发状态创建
    const status = getKeyStatus('model-fo');
    expect(status).not.toBeNull();
    expect(status?.length).toBe(2);
    expect(status?.[0].isPrimary).toBe(true);
    expect(status?.[1].isPrimary).toBe(false);
  });

  it('clearRotationState 清除状态后 getKeyStatus 返回 null', () => {
    const model = makeModel({
      id: 'model-fo',
      keyStrategy: 'failover',
      apiKeys: [{ key: 'sk-a' }, { key: 'sk-b' }],
    });
    selectKey(model);
    expect(getKeyStatus('model-fo')).not.toBeNull();
    clearRotationState('model-fo');
    expect(getKeyStatus('model-fo')).toBeNull();
  });

  it('getKeyStatus 对未知模型返回 null', () => {
    expect(getKeyStatus('nonexistent-model')).toBeNull();
  });
});

describe('并发安全', () => {
  it('多次同步调用 selectKey 不破坏内部状态', () => {
    const model = makeModel({
      id: 'model-rr',
      keyStrategy: 'round-robin',
      apiKeys: [{ key: 'sk-a' }, { key: 'sk-b' }],
    });
    // 模拟并发：同步多次调用
    const results: string[] = [];
    for (let i = 0; i < 100; i++) {
      const r = selectKey(model);
      if (r) results.push(r.key);
    }
    // 应严格交替
    expect(results.length).toBe(100);
    expect(results[0]).toBe('sk-a');
    expect(results[1]).toBe('sk-b');
    expect(results[98]).toBe('sk-a');
    expect(results[99]).toBe('sk-b');
  });

  it('reportKeyResult 对未知模型/索引不报错', () => {
    expect(() => reportKeyResult('nonexistent', 0, false)).not.toThrow();
    expect(() => reportKeyResult('model-rr', 999, false)).not.toThrow();
  });
});
