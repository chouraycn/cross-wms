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
  checkForUpdates: () => Promise<UpdateStatus>;
  hideUpdateNotification: () => void;
  downloadUpdate: () => void;
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined);

export const UpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(APP_VERSION);
  const ran = useRef(false);

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
    }

    initVersion();
    return () => { cancelled = true; };
  }, []);

  const checkForUpdates = useCallback(async () => {
    const status = await checkForUpdatesService(currentVersion);
    if (status.hasUpdate && status.releaseInfo) {
      setUpdateStatus(status);
      setShowUpdateNotification(true);
    } else {
      setUpdateStatus(null);
      setShowUpdateNotification(false);
    }
    return status;
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

  // 启动时自动检查更新（3秒延迟）
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const timer = setTimeout(async () => {
      try {
        const status = await checkForUpdatesService(currentVersion);
        if (status.hasUpdate && status.releaseInfo) {
          setUpdateStatus(status);
          setShowUpdateNotification(true);
        }
      } catch (error) {
        console.error('自动更新检查失败:', error);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [currentVersion]);

  return (
    <UpdateContext.Provider
      value={{
        updateStatus,
        showUpdateNotification,
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
