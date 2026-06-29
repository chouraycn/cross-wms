/**
 * System Permissions Routes
 *
 * Mounted at /api/permissions
 */
import { Router, type Request, type Response } from 'express';
import { ipcClient } from '../ipcClient.js';
import { logger } from '../logger.js';

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
    const result = await ipcClient.permissionCheck(capabilities);
    if (result === null) {
      res.json({
        available: false,
        permissions: {},
        message: 'IPC not available - running in browser mode',
      });
      return;
    }
    res.json({
      available: true,
      permissions: result,
    });
  } catch (e) {
    logger.error('[Permissions] status check failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/request/:capability', async (req: Request, res: Response) => {
  try {
    const { capability } = req.params;
    const mapped = CAPABILITY_MAP[capability] || capability;
    const success = await ipcClient.permissionRequest(mapped);
    res.json({ success });
  } catch (e) {
    logger.error('[Permissions] request failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/open-settings/:capability', async (req: Request, res: Response) => {
  try {
    const { capability } = req.params;
    const mapped = CAPABILITY_MAP[capability] || capability;
    const success = await ipcClient.permissionOpenSettings(mapped);
    res.json({ success });
  } catch (e) {
    logger.error('[Permissions] open settings failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
