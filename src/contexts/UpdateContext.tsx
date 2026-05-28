import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UpdateStatus } from '../services/updateService';
import { checkForUpdates as checkForUpdatesService, openDownloadUrl, formatVersion } from '../services/updateService';

// 从 Vite 环境变量读取版本号
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

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
