// 配置运行时快照与 last-known-good 恢复模块
// 参考 OpenClaw 的 config/io.ts 设计，提供内存级快照管理与恢复能力

// 默认快照版本号
const DEFAULT_VERSION = '1.0.0';

// 配置快照接口
export interface ConfigSnapshot<T> {
  data: T;
  loadedAt: number;
  version: string;
}

// 模块级变量：当前运行时快照
let currentSnapshot: ConfigSnapshot<unknown> | null = null;

// 模块级变量：last-known-good 快照（已被提升为可信状态的快照）
let lastKnownGoodSnapshot: ConfigSnapshot<unknown> | null = null;

// 配置写入监听器列表
const writeListeners: Array<(snapshot: ConfigSnapshot<unknown>) => void> = [];

// 获取当前运行时快照
export function getRuntimeConfigSnapshot<T>(): ConfigSnapshot<T> | null {
  if (currentSnapshot === null) {
    return null;
  }
  return currentSnapshot as ConfigSnapshot<T>;
}

// 设置运行时快照，并自动通知所有监听器
export function setRuntimeConfigSnapshot<T>(data: T, version: string = DEFAULT_VERSION): void {
  const snapshot: ConfigSnapshot<T> = {
    data,
    loadedAt: Date.now(),
    version,
  };
  currentSnapshot = snapshot as ConfigSnapshot<unknown>;

  // 通知所有监听器
  for (const listener of writeListeners) {
    try {
      listener(currentSnapshot);
    } catch {
      // 忽略监听器内部错误，避免影响主流程
    }
  }
}

// 将当前快照提升为 last-known-good（复制 current 到 lastKnownGood）
export function promoteConfigSnapshotToLastKnownGood<T>(): void {
  if (currentSnapshot === null) {
    return;
  }
  // 浅拷贝快照包装对象，保留 data 引用快照时刻的状态
  lastKnownGoodSnapshot = { ...currentSnapshot };
}

// 获取 last-known-good 快照
export function getLastKnownGoodConfig<T>(): ConfigSnapshot<T> | null {
  if (lastKnownGoodSnapshot === null) {
    return null;
  }
  return lastKnownGoodSnapshot as ConfigSnapshot<T>;
}

// 从 last-known-good 恢复当前快照，返回是否成功
export function restoreFromLastKnownGood<T>(): boolean {
  if (lastKnownGoodSnapshot === null) {
    return false;
  }
  currentSnapshot = { ...lastKnownGoodSnapshot };
  return true;
}

// 注册配置写入监听器，返回取消注册函数
export function registerConfigWriteListener(
  listener: (snapshot: ConfigSnapshot<unknown>) => void,
): () => void {
  writeListeners.push(listener);
  return () => {
    const index = writeListeners.indexOf(listener);
    if (index >= 0) {
      writeListeners.splice(index, 1);
    }
  };
}

// 清除所有快照（current 与 last-known-good）
export function clearConfigSnapshot(): void {
  currentSnapshot = null;
  lastKnownGoodSnapshot = null;
}
