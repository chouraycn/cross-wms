/**
 * Native Permission Checker
 *
 * 当 IPC（Swift 原生应用）不可用时，通过 Node.js 调用 macOS 原生命令
 * 来检查和请求系统权限。作为网页端的 fallback 方案。
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

const CHECK_TIMEOUT = 5000;

/**
 * 通过 swift 一行命令检测权限
 */
async function runSwift(code: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync('swift', ['-e', code], {
      timeout: CHECK_TIMEOUT,
      maxBuffer: 1024 * 256,
    });
    if (stderr && !stdout) {
      logger.warn(`[NativePermission] swift stderr: ${stderr.trim()}`);
    }
    return stdout.trim();
  } catch (err) {
    logger.warn(`[NativePermission] swift failed: ${(err as Error).message}`);
    return '';
  }
}

/**
 * 通过 osascript 检测辅助功能权限
 */
async function checkAccessibilityViaOSA(): Promise<boolean> {
  try {
    await execFileAsync('osascript', ['-e', 'tell application "System Events" to get name of first process'], {
      timeout: CHECK_TIMEOUT,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 打开 macOS 系统设置中的对应权限页面
 */
async function openSystemSettings(panel: string): Promise<boolean> {
  try {
    const url = `x-apple.systempreferences:com.apple.preference.security?${panel}`;
    await execFileAsync('open', [url], { timeout: CHECK_TIMEOUT });
    return true;
  } catch (err) {
    logger.warn(`[NativePermission] open settings failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * 检查单个权限状态
 */
export async function checkPermission(capability: string): Promise<boolean> {
  switch (capability) {
    case 'screenRecording':
      return (await runSwift('import CoreGraphics; print(CGPreflightScreenCaptureAccess())')) === 'true';

    case 'accessibility':
      // 先用 swift 检测，失败再用 osascript
      const axResult = await runSwift('import ApplicationServices; print(AXIsProcessTrusted())');
      if (axResult === 'true' || axResult === 'false') {
        return axResult === 'true';
      }
      return await checkAccessibilityViaOSA();

    case 'microphone':
      // macOS 14+ 可以通过 swift 检测
      const micResult = await runSwift(
        'import AVFoundation; print(AVAudioApplication.shared.recordPermission == .granted)'
      );
      return micResult === 'true';

    case 'camera':
      const camResult = await runSwift(
        'import AVFoundation; print(AVAuthorizationStatus(for: .video) == .authorized)'
      );
      return camResult === 'true';

    case 'fullDiskAccess':
      // 通过尝试读取 TCC.db 检测
      try {
        await execFileAsync('sqlite3', [
          '~/Library/Application Support/com.apple.TCC/TCC.db',
          'SELECT count(*) FROM access LIMIT 1;',
        ], { timeout: 3000, shell: true });
        return true;
      } catch {
        return false;
      }

    case 'inputMonitoring':
      // 输入监控权限较难直接检测，尝试通过 event tap 检测
      const imResult = await runSwift(`
        import CoreGraphics
        let tap = CGEvent.tapEnable(0, false)
        print(tap)
      `);
      return imResult === 'true';

    case 'notifications':
      // 通知权限无法直接从命令行检测
      return false;

    case 'automation':
      // 自动化权限通过 osascript 检测
      return await checkAccessibilityViaOSA();

    case 'location':
      // 定位权限无法直接从命令行检测
      return false;

    case 'speechRecognition':
      // 语音识别权限无法直接从命令行检测
      return false;

    case 'appleScript':
      return await checkAccessibilityViaOSA();

    default:
      return false;
  }
}

/**
 * 批量检查所有权限状态
 */
export async function checkAllPermissions(capabilities: string[]): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  for (const cap of capabilities) {
    results[cap] = await checkPermission(cap);
  }
  return results;
}

/**
 * 请求权限（打开系统设置页面）
 */
export async function requestPermission(capability: string): Promise<boolean> {
  const panelMap: Record<string, string> = {
    screenRecording: 'Privacy_ScreenCapture',
    accessibility: 'Privacy_Accessibility',
    inputMonitoring: 'Privacy_InputMonitoring',
    fullDiskAccess: 'Privacy_AllFiles',
    microphone: 'Privacy_Microphone',
    camera: 'Privacy_Camera',
    notifications: 'Privacy_Notifications',
    automation: 'Privacy_Automation',
    location: 'Privacy_LocationServices',
    speechRecognition: 'Privacy_SpeechRecognition',
    appleScript: 'Privacy_Automation',
  };

  const panel = panelMap[capability];
  if (!panel) {
    logger.warn(`[NativePermission] Unknown capability: ${capability}`);
    return false;
  }

  return await openSystemSettings(panel);
}

/**
 * 打开系统设置中的对应权限页面
 */
export async function openPermissionSettings(capability: string): Promise<boolean> {
  return await requestPermission(capability);
}

/**
 * 打开权限管理器（系统设置隐私页面）
 */
export async function openPermissionManager(): Promise<boolean> {
  try {
    await execFileAsync('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy'], {
      timeout: CHECK_TIMEOUT,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 检测是否为 macOS 系统
 */
export function isMacOS(): boolean {
  return process.platform === 'darwin';
}
