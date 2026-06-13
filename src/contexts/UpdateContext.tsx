import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UpdateStatus } from '../services/updateService';
import { checkForUpdates as checkForUpdatesService, openDownloadUrl } from '../services/updateService';

// 从 Vite 环境变量读取版本号（编译时注入）
const VITE_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

// pywebview 环境：异步获取真实版本号
// 在 UpdateProvider 内通过 useEffect 初始化，避免模块加载时 api 未就绪的问题
let APP_VERSION = VITE_VERSION;

interface UpdateContextType {
  updateStatus: UpdateStatus | null;
  showUpdateNotification: boolean;
  isChecking: boolean;
  checkForUpdates: () => Promise<UpdateStatus>;
  hideUpdateNotification: () => void;
  downloadUpdate: () => void;
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined);

export const UpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(APP_VERSION);
  const versionInitDone = useRef(false);
  const autoCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化：检测 pywebview 环境并获取真实版本号
  useEffect(() => {
    let cancelled = false;

    async function initVersion() {
      // pywebview 环境：等待 api 就绪后获取版本号
      if (typeof window !== 'undefined' && window.pywebview) {
        try {
          // 等待 api 对象就绪（最多 5 秒）
          const waitForApi = (timeout = 5000): Promise<boolean> => {
            if (window.pywebview?.api) return Promise.resolve(true);
            return new Promise((resolve) => {
              const start = Date.now();
              const check = () => {
                if (window.pywebview?.api) {
                  resolve(true);
                  return;
                }
                if (Date.now() - start > timeout) {
                  resolve(false);
                  return;
                }
                setTimeout(check, 50);
              };
              check();
            });
          };

          const ready = await waitForApi();
          if (!ready) {
            console.warn('[UpdateContext] pywebview API 未在超时内就绪，使用 Vite 注入版本号');
            if (!cancelled) versionInitDone.current = true;
            return;
          }

          // api 就绪，调用 get_version（pywebview 同步调用）
          const pyVersion = window.pywebview.api.get_version();
          if (pyVersion && typeof pyVersion === 'string' && pyVersion !== '0.0.0') {
            if (!cancelled) {
              APP_VERSION = pyVersion;
              setCurrentVersion(pyVersion);
            }
          }
        } catch (e) {
          console.warn('[UpdateContext] 获取 pywebview 版本号失败，使用 Vite 注入版本:', e);
        }
      }
      if (!cancelled) versionInitDone.current = true;
    }

    initVersion();
    return () => { cancelled = true; };
  }, []);

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    try {
      const status = await checkForUpdatesService(currentVersion);
      if (status.hasUpdate && status.releaseInfo) {
        setUpdateStatus(status);
        setShowUpdateNotification(true);
      } else if (status.error) {
        // 检查失败，显示错误通知
        setUpdateStatus(status);
        setShowUpdateNotification(true);
      } else {
        // 没有更新
        setUpdateStatus(null);
        setShowUpdateNotification(false);
      }
      return status;
    } finally {
      setIsChecking(false);
    }
  }, [currentVersion]);

  const hideUpdateNotification = useCallback(() => {
    setShowUpdateNotification(false);
  }, []);

  const downloadUpdate = useCallback(() => {
    if (updateStatus?.releaseInfo?.dmgUrl) {
      openDownloadUrl(updateStatus.releaseInfo.dmgUrl);
    }
    setShowUpdateNotification(false);
  }, [updateStatus]);

  // 启动时自动检查更新：等待版本初始化完成后延迟 2 秒执行
  useEffect(() => {
    // 轮询等待 versionInitDone（最多 8 秒），确保使用正确的 pywebview 版本号
    let cancelled = false;
    let pollCount = 0;

    async function waitAndCheck() {
      while (!versionInitDone.current && pollCount < 80) {
        if (cancelled) return;
        await new Promise(r => setTimeout(r, 100));
        pollCount++;
      }

      if (cancelled) return;

      // 版本已就绪，再延迟 2 秒给 UI 渲染时间
      autoCheckTimer.current = setTimeout(async () => {
        if (cancelled) return;
        try {
          console.log('[UpdateContext] 开始自动检查更新，版本:', currentVersion);
          const status = await checkForUpdatesService(currentVersion);
          console.log('[UpdateContext] 更新检查结果:', status);
          if (status.hasUpdate && status.releaseInfo) {
            setUpdateStatus(status);
            setShowUpdateNotification(true);
          }
        } catch (error) {
          console.error('[UpdateContext] 自动更新检查失败:', error);
        }
      }, 2000);
    }

    waitAndCheck();
    return () => {
      cancelled = true;
      if (autoCheckTimer.current) clearTimeout(autoCheckTimer.current);
    };
  }, [currentVersion]);

  return (
    <UpdateContext.Provider
      value={{
        updateStatus,
        showUpdateNotification,
        isChecking,
        checkForUpdates,
        hideUpdateNotification,
        downloadUpdate,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
};

export const useUpdateContext = () => {
  const context = useContext(UpdateContext);
  if (context === undefined) {
    throw new Error('useUpdateContext 必须在 UpdateProvider 内使用');
  }
  return context;
};
