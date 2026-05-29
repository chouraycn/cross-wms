import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UpdateStatus } from '../services/updateService';
import { checkForUpdates as checkForUpdatesService, openDownloadUrl, formatVersion } from '../services/updateService';

// 从 Vite 环境变量读取版本号；pywebview 环境下优先用 Python 侧真实版本号
let APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

// pywebview 环境：通过 JS API 桥接获取真实版本号（避免 Vite 注入值与打包版本不一致）
if (typeof window !== 'undefined' && window.pywebview?.api?.get_version) {
  try {
    // get_version() 返回的是同步值（pywebview 同步调用）
    const pyVersion = window.pywebview.api.get_version();
    if (pyVersion && typeof pyVersion === 'string' && pyVersion !== '0.0.0') {
      APP_VERSION = pyVersion;
    }
  } catch {
    // 桥接失败，降级到 Vite 注入的版本号
  }
}

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
  const ran = useRef(false);

  const checkForUpdates = useCallback(async () => {
    const status = await checkForUpdatesService(APP_VERSION);
    if (status.hasUpdate && status.releaseInfo) {
      setUpdateStatus(status);
      setShowUpdateNotification(true);
    } else {
      setUpdateStatus(null);
      setShowUpdateNotification(false);
    }
    return status;
  }, []);

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
        const status = await checkForUpdatesService(APP_VERSION);
        if (status.hasUpdate && status.releaseInfo) {
          setUpdateStatus(status);
          setShowUpdateNotification(true);
        }
      } catch (error) {
        console.error('自动更新检查失败:', error);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

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
