/**
 * KeyRotator — API Key 轮询与故障转移模块
 *
 * 支持三种策略：
 * - round-robin: 轮询（按顺序循环使用）
 * - random: 随机选择
 * - failover: 主 Key 优先，失败时切换到备用 Key
 *
 * 轮询状态定期持久化到文件，进程重启后可恢复故障计数和轮询进度。
 */

import path from 'path';
import fs from 'fs';
import type { ModelConfig } from './modelsStore.js';
import { logger } from './logger.js';
import { AppPaths } from './config/appPaths.js';

/** 轮询策略类型 */
export type KeyStrategy = 'round-robin' | 'random' | 'failover';

/** Key 使用记录（用于故障转移追踪） */
interface KeyUsageRecord {
  key: string;
  index: number;
  failCount: number;
  lastUsedAt: number;
  lastFailedAt?: number;
}

/** 模型级轮询状态 */
interface ModelRotationState {
  modelId: string;
  strategy: KeyStrategy;
  keys: KeyUsageRecord[];
  currentIndex: number;
  primaryIndex: number;
}

/** 持久化用的 Key 状态（不含 key 值本身） */
interface PersistedKeyState {
  failCount: number;
  lastUsedAt: number;
  lastFailedAt?: number;
}

/** 持久化用的轮询状态 */
interface PersistedRotationState {
  version: 1;
  states: Record<string, {
    currentIndex: number;
    primaryIndex: number;
    keyStates: Record<number, PersistedKeyState>;
  }>;
  savedAt: string;
}

// 状态文件路径
const STATE_DIR = AppPaths.modelsDir;
const ROTATION_STATE_FILE = path.join(STATE_DIR, 'rotation-state.json');

// 内存级轮询状态存储
const rotationStates = new Map<string, ModelRotationState>();

/** 故障转移阈值：连续失败多少次后切换 */
const FAILOVER_THRESHOLD = 2;
/** 故障 Key 冷却时间（毫秒）：冷却期内不再尝试 */
const COOL_DOWN_MS = 60_000;

/**
 * 将当前轮询状态保存到文件
 */
function saveRotationStates(): void {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    const persisted: PersistedRotationState = {
      version: 1,
      states: {},
      savedAt: new Date().toISOString(),
    };
    for (const [modelId, state] of rotationStates) {
      const keyStates: Record<number, PersistedKeyState> = {};
      for (const record of state.keys) {
        keyStates[record.index] = {
          failCount: record.failCount,
          lastUsedAt: record.lastUsedAt,
          lastFailedAt: record.lastFailedAt,
        };
      }
      persisted.states[modelId] = {
        currentIndex: state.currentIndex,
        primaryIndex: state.primaryIndex,
        keyStates,
      };
    }
    fs.writeFileSync(ROTATION_STATE_FILE, JSON.stringify(persisted, null, 2), 'utf-8');
  } catch (e) {
    logger.error('[keyRotator] 保存轮询状态失败:', e);
  }
}

/**
 * 从文件加载轮询状态（模块启动时调用）
 * 只恢复状态元数据，不恢复 keys（keys 在运行时从模型配置获取）。
 */
function loadRotationStates(): void {
  try {
    if (!fs.existsSync(ROTATION_STATE_FILE)) return;
    const raw = fs.readFileSync(ROTATION_STATE_FILE, 'utf-8').trim();
    if (!raw) return;
    const persisted: PersistedRotationState = JSON.parse(raw);
    if (persisted.version !== 1) return;
    for (const [modelId, state] of Object.entries(persisted.states)) {
      // 检查冷却时间是否已过期（60秒），过期则重置
      if (state.keyStates) {
        for (const keyState of Object.values(state.keyStates)) {
          if (keyState.lastFailedAt) {
            const elapsed = Date.now() - keyState.lastFailedAt;
            if (elapsed > COOL_DOWN_MS) {
              keyState.failCount = 0;
              keyState.lastFailedAt = undefined;
            }
          }
        }
      }
      // 存入内存，keys 留空，待 getOrCreateState 时从模型配置填充
      rotationStates.set(modelId, {
        modelId,
        strategy: 'round-robin', // 运行时由 getOrCreateState 覆盖
        keys: [],
        currentIndex: state.currentIndex,
        primaryIndex: state.primaryIndex,
        _persistedKeyStates: state.keyStates,
      } as ModelRotationState & { _persistedKeyStates?: Record<number, PersistedKeyState> });
    }
    logger.debug(`[keyRotator] 恢复了 ${Object.keys(persisted.states).length} 个模型的轮询状态`);
  } catch (e) {
    logger.error('[keyRotator] 加载轮询状态失败:', e);
  }
}

/**
 * 从模型配置中提取所有可用的 API Key
 */
function extractKeys(model: ModelConfig): string[] {
  const keys: string[] = [];

  // 多 Key 模式
  if (model.apiKeys && model.apiKeys.length > 0) {
    for (const entry of model.apiKeys) {
      if (entry.enabled !== false && entry.key && entry.key.trim()) {
        keys.push(entry.key.trim());
      }
    }
  }

  // 单 Key 模式（兼容旧数据）
  if (keys.length === 0 && model.apiKey && model.apiKey.trim()) {
    keys.push(model.apiKey.trim());
  }

  return keys;
}

/**
 * 初始化或获取模型的轮询状态
 */
function getOrCreateState(model: ModelConfig): ModelRotationState {
  const existing = rotationStates.get(model.id);
  const keys = extractKeys(model);

  if (existing && existing.keys.length === keys.length) {
    // 检查 Key 是否变化
    const keysChanged = existing.keys.some((r, i) => r.key !== keys[i]);
    if (!keysChanged) return existing;
  }

  const strategy: KeyStrategy = model.keyStrategy || 'round-robin';

  // 尝试从持久化状态恢复
  const persistedData = existing && '_persistedKeyStates' in existing
    ? (existing as ModelRotationState & { _persistedKeyStates?: Record<number, PersistedKeyState> })._persistedKeyStates
    : undefined;

  const state: ModelRotationState = {
    modelId: model.id,
    strategy,
    keys: keys.map((k, i) => {
      const pk = persistedData?.[i];
      return {
        key: k,
        index: i,
        failCount: pk?.failCount ?? 0,
        lastUsedAt: pk?.lastUsedAt ?? 0,
        lastFailedAt: pk?.lastFailedAt,
      };
    }),
    currentIndex: existing?.currentIndex ?? 0,
    primaryIndex: existing?.primaryIndex ?? 0,
  };

  rotationStates.set(model.id, state);
  return state;
}

/**
 * 获取下一个要使用的 API Key
 * @returns 选中的 Key 和索引
 */
export function selectKey(model: ModelConfig): { key: string; index: number } | null {
  const keys = extractKeys(model);
  if (keys.length === 0) return null;
  if (keys.length === 1) return { key: keys[0], index: 0 };

  const state = getOrCreateState(model);
  const now = Date.now();

  switch (state.strategy) {
    case 'round-robin': {
      // 轮询：按顺序循环
      const idx = state.currentIndex % state.keys.length;
      state.currentIndex = (state.currentIndex + 1) % state.keys.length;
      const record = state.keys[idx];
      record.lastUsedAt = now;
      return { key: record.key, index: idx };
    }

    case 'random': {
      // 随机：均匀随机选择
      const idx = Math.floor(Math.random() * state.keys.length);
      const record = state.keys[idx];
      record.lastUsedAt = now;
      return { key: record.key, index: idx };
    }

    case 'failover': {
      // 故障转移：优先主 Key，失败时找健康的备用 Key
      // 主 Key 健康条件：不在冷却中 且 失败次数未达阈值
      const primary = state.keys[state.primaryIndex];
      const primaryCoolDown = primary.lastFailedAt
        ? now - primary.lastFailedAt < COOL_DOWN_MS
        : false;
      const primaryHealthy = !primaryCoolDown && primary.failCount < FAILOVER_THRESHOLD;

      if (primaryHealthy) {
        primary.lastUsedAt = now;
        return { key: primary.key, index: state.primaryIndex };
      }

      // 主 Key 故障，找下一个健康的 Key（不在冷却中 且 失败次数未达阈值）
      for (let i = 1; i < state.keys.length; i++) {
        const idx = (state.primaryIndex + i) % state.keys.length;
        const record = state.keys[idx];
        const inCoolDown = record.lastFailedAt
          ? now - record.lastFailedAt < COOL_DOWN_MS
          : false;
        const isHealthy = !inCoolDown && record.failCount < FAILOVER_THRESHOLD;

        if (isHealthy) {
          record.lastUsedAt = now;
          return { key: record.key, index: idx };
        }
      }

      // 所有 Key 都在冷却中，强制使用主 Key（重置其失败状态以允许再次尝试）
      primary.failCount = 0;
      primary.lastFailedAt = undefined;
      primary.lastUsedAt = now;
      return { key: primary.key, index: state.primaryIndex };
    }

    default:
      // 默认轮询
      const idx = state.currentIndex % state.keys.length;
      state.currentIndex = (state.currentIndex + 1) % state.keys.length;
      state.keys[idx].lastUsedAt = now;
      return { key: state.keys[idx].key, index: idx };
  }
}

/**
 * 报告 Key 使用结果（成功/失败）
 * 用于故障转移策略的故障计数
 */
export function reportKeyResult(modelId: string, keyIndex: number, success: boolean): void {
  const state = rotationStates.get(modelId);
  if (!state) return;

  const record = state.keys[keyIndex];
  if (!record) return;

  if (success) {
    record.failCount = 0;
    record.lastFailedAt = undefined;
  } else {
    record.failCount++;
    record.lastFailedAt = Date.now();

    // 故障转移策略下，如果主 Key 连续失败超过阈值，提升下一个 Key 为主 Key
    if (state.strategy === 'failover' && keyIndex === state.primaryIndex && record.failCount >= FAILOVER_THRESHOLD) {
      const nextPrimary = (state.primaryIndex + 1) % state.keys.length;
      if (nextPrimary !== state.primaryIndex) {
        state.primaryIndex = nextPrimary;
        logger.debug(`[KeyRotator] 模型 ${modelId} 主 Key 故障，切换到 Key ${nextPrimary}`);
      }
    }
  }
}

/**
 * 获取模型的 Key 状态信息（用于健康监控）
 */
export function getKeyStatus(modelId: string): Array<{
  index: number;
  failCount: number;
  lastUsedAt: number;
  lastFailedAt?: number;
  isPrimary: boolean;
}> | null {
  const state = rotationStates.get(modelId);
  if (!state) return null;

  return state.keys.map(r => ({
    index: r.index,
    failCount: r.failCount,
    lastUsedAt: r.lastUsedAt,
    lastFailedAt: r.lastFailedAt,
    isPrimary: state.strategy === 'failover' && r.index === state.primaryIndex,
  }));
}

/**
 * 清除模型的轮询状态（模型删除/重置时调用）
 * 同时清理持久化文件中的对应条目
 */
export function clearRotationState(modelId: string): void {
  rotationStates.delete(modelId);

  // 同步清理持久化文件中的对应条目
  try {
    if (fs.existsSync(ROTATION_STATE_FILE)) {
      const raw = fs.readFileSync(ROTATION_STATE_FILE, 'utf-8');
      const persisted: PersistedRotationState = JSON.parse(raw);
      if (persisted.states[modelId]) {
        delete persisted.states[modelId];
        if (!fs.existsSync(STATE_DIR)) {
          fs.mkdirSync(STATE_DIR, { recursive: true });
        }
        fs.writeFileSync(ROTATION_STATE_FILE, JSON.stringify(persisted, null, 2), 'utf-8');
      }
    }
  } catch (e) {
    logger.error('[keyRotator] 清理持久化状态失败:', e);
  }
}

// ============================================================
// 模块初始化：恢复持久化状态 & 定期保存
// ============================================================

// 模块加载时恢复状态
loadRotationStates();

// 每 30 秒自动保存一次
const saveInterval = setInterval(saveRotationStates, 30_000);

// 进程退出时保存
process.on('exit', saveRotationStates);
process.on('SIGINT', () => { saveRotationStates(); process.exit(); });
process.on('SIGTERM', () => { saveRotationStates(); process.exit(); });
