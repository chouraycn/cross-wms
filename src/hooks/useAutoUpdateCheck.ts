/**
 * 启动时自动检查更新 Hook
 * 只在应用首次挂载时运行一次，检测到新版本后通过回调通知 UI
 */
import { useEffect, useRef } from 'react';
import { checkForUpdates, type UpdateStatus } from '../services/updateService';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

export interface AutoUpdateResult {
  checked: boolean;
  status: UpdateStatus | null;
}

/**
 * 启动时自动检查更新，仅在组件首次挂载时执行一次
 * @param onUpdateFound 发现新版本时的回调
 * @param delayMs 启动后延迟检查的毫秒数（默认 3000，让应用先完成渲染）
 */
export function useAutoUpdateCheck(
  onUpdateFound?: (status: UpdateStatus) => void,
  delayMs: number = 3000,
): void {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const timer = setTimeout(async () => {
      try {
        const status = await checkForUpdates(APP_VERSION);
        if (status.hasUpdate && status.releaseInfo && onUpdateFound) {
          onUpdateFound(status);
        }
      } catch (err) {
        // 静默失败 — 启动时检查失败不打扰用户
        console.debug('[AutoUpdate] 启动检查更新失败:', err);
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [onUpdateFound, delayMs]);
}
