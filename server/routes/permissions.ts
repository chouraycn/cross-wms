/**
 * System Permissions Routes
 *
 * Mounted at /api/permissions
 *
 * 双通道架构：
 * 1. 优先使用 IPC（Swift 原生应用，打包模式）
 * 2. IPC 不可用时 fallback 到 native checker（Node.js 直接调用 macOS 命令，网页端模式）
 */
import { Router, type Request, type Response } from 'express';
import { ipcClient } from '../ipcClient.js';
import { logger } from '../logger.js';
import { ok, serverError } from './_shared/respond.js';
import {
  checkPermission,
  checkAllPermissions,
  requestPermission as nativeRequestPermission,
  openPermissionSettings,
  openPermissionManager as nativeOpenPermissionManager,
  isMacOS,
} from '../nativePermissionChecker.js';

const router = Router();

const CAPABILITY_MAP: Record<string, string> = {
  screenRecording: 'screenRecording',
  accessibility: 'accessibility',
  inputMonitoring: 'inputMonitoring',
  fullDiskAccess: 'fullDiskAccess',
  microphone: 'microphone',
  camera: 'camera',
  notifications: 'notifications',
  automation: 'automation',
  location: 'location',
  speechRecognition: 'speechRecognition',
  appleScript: 'appleScript',
};

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const capabilities = Object.values(CAPABILITY_MAP);

    // 通道 1：尝试 IPC（Swift 原生应用）
    const ipcResult = await ipcClient.permissionCheck(capabilities);
    if (ipcResult !== null) {
      return ok(res, {
        available: true,
        source: 'ipc',
        permissions: ipcResult,
      });
    }

    // 通道 2：IPC 不可用，fallback 到 native checker
    if (isMacOS()) {
      const nativeResult = await checkAllPermissions(capabilities);
      return ok(res, {
        available: true,
        source: 'native',
        permissions: nativeResult,
      });
    }

    // 非 macOS 系统
    return ok(res, {
      available: false,
      permissions: {},
      message: 'System permissions are only available on macOS',
    });
  } catch (e) {
    logger.error('[Permissions] status check failed:', e);
    return serverError(res, (e as Error).message);
  }
});

router.post('/request/:capability', async (req: Request, res: Response) => {
  try {
    const { capability } = req.params;
    const mapped = CAPABILITY_MAP[capability] || capability;

    // 通道 1：尝试 IPC
    if (ipcClient.isConnected()) {
      const success = await ipcClient.permissionRequest(mapped);
      return ok(res, { success, source: 'ipc' });
    }

    // 通道 2：fallback 到 native checker（打开系统设置页面）
    if (isMacOS()) {
      const success = await nativeRequestPermission(mapped);
      return ok(res, { success, source: 'native' });
    }

    return ok(res, { success: false, message: 'Not supported on this platform' });
  } catch (e) {
    logger.error('[Permissions] request failed:', e);
    return serverError(res, (e as Error).message);
  }
});

router.post('/open-settings/:capability', async (req: Request, res: Response) => {
  try {
    const { capability } = req.params;
    const mapped = CAPABILITY_MAP[capability] || capability;

    // 通道 1：尝试 IPC
    if (ipcClient.isConnected()) {
      const success = await ipcClient.permissionOpenSettings(mapped);
      return ok(res, { success, source: 'ipc' });
    }

    // 通道 2：fallback 到 native checker
    if (isMacOS()) {
      const success = await openPermissionSettings(mapped);
      return ok(res, { success, source: 'native' });
    }

    return ok(res, { success: false, message: 'Not supported on this platform' });
  } catch (e) {
    logger.error('[Permissions] open settings failed:', e);
    return serverError(res, (e as Error).message);
  }
});

router.post('/open-manager', async (_req: Request, res: Response) => {
  try {
    // 通道 1：尝试 IPC
    if (ipcClient.isConnected()) {
      const success = await ipcClient.openPermissionManager();
      return ok(res, { success, source: 'ipc' });
    }

    // 通道 2：fallback 到 native checker
    if (isMacOS()) {
      const success = await nativeOpenPermissionManager();
      return ok(res, { success, source: 'native' });
    }

    return ok(res, { success: false, message: 'Not supported on this platform' });
  } catch (e) {
    logger.error('[Permissions] open manager failed:', e);
    return serverError(res, (e as Error).message);
  }
});

export default router;
