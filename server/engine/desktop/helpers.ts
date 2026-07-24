/**
 * Desktop Helpers — 辅助函数与共享状态
 */

import { isMac, isLinux, PLATFORM } from '../toolTypes.js';

/** Helper: Escape text for AppleScript string literals */
export function escapeForAppleScript(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}

/** Helper: Execute AppleScript with proper error handling */
export async function runAppleScript(script: string, timeout: number = 3000): Promise<string> {
  const { execSync } = await import('child_process');
  try {
    const output = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8',
      timeout,
    });
    return output.toString().trim();
  } catch (e: unknown) {
    throw new Error(`AppleScript execution failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** v2.2.0: Helper — Linux 截图（优先 import，其次 scrot，最后 gnome-screenshot） */
export async function linuxScreenshot(outputPath: string): Promise<void> {
  const { execSync } = await import('child_process');
  // 优先使用 ImageMagick import
  try {
    execSync(`import -window root "${outputPath}"`, { encoding: 'utf8', timeout: 8000 });
    return;
  } catch {
    // import 失败，尝试 scrot
  }
  try {
    execSync(`scrot "${outputPath}"`, { encoding: 'utf8', timeout: 8000 });
    return;
  } catch {
    // scrot 失败，尝试 gnome-screenshot
  }
  try {
    execSync(`gnome-screenshot -f "${outputPath}"`, { encoding: 'utf8', timeout: 8000 });
    return;
  } catch {
    throw new Error('所有截图工具均不可用。请安装以下之一：imagemagick (import), scrot, gnome-screenshot');
  }
}

/** v2.2.0: Helper — 检测 Linux 工具是否可用 */
export async function linuxToolAvailable(toolName: string): Promise<boolean> {
  const { execSync } = await import('child_process');
  try {
    execSync(`which ${toolName}`, { encoding: 'utf8', timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

/** 桌面元素缓存 — ref → 元素信息（含 bounds），供后续 ref 操作使用 */
export interface DesktopElement {
  ref: string;
  role: string;
  name: string;
  value?: string;
  enabled?: boolean;
  description?: string;
  bounds: { x: number; y: number; w: number; h: number };
}

export let desktopSnapshotCache: Map<string, DesktopElement> | null = null;

/** Setter for desktopSnapshotCache (ESM imports are immutable) */
export function setDesktopSnapshotCache(cache: Map<string, DesktopElement> | null): void {
  desktopSnapshotCache = cache;
}

/** v2.3.4: 浏览器名称集合，用于检测是否应该启用应用内窗口而非系统浏览器 */
export const BROWSER_APPS = new Set([
  'safari', 'chrome', 'google chrome', 'firefox', 'edge', 'microsoft edge',
  'brave', 'opera', 'arc', 'vivaldi', 'chromium',
  '默认浏览器', 'default browser', 'browser',
]);

export { isMac, isLinux, PLATFORM };

/** desktop_health — 检查 macOS/Linux 原生工具是否可用 */
export async function handleDesktopHealth(): Promise<string> {
  try {
    const { execSync } = await import('child_process');
    const results: Record<string, boolean> = {};

    if (isMac) {
      const tools = ['screencapture', 'osascript', 'open', 'pbcopy', 'pbpaste'];
      for (const tool of tools) {
        try {
          execSync(`which ${tool}`, { encoding: 'utf8', timeout: 1000 });
          results[tool] = true;
        } catch {
          results[tool] = false;
        }
      }
    } else if (isLinux) {
      const linuxTools = [
        'import', 'scrot', 'gnome-screenshot',
        'xdotool',
        'xclip', 'xsel',
        'xdg-open',
        'wmctrl',
      ];
      for (const tool of linuxTools) {
        results[tool] = await linuxToolAvailable(tool);
      }
    } else {
      return JSON.stringify({
        success: false,
        platform: PLATFORM,
        message: `Unsupported platform: ${PLATFORM}. Desktop automation is only supported on macOS and Linux.`,
      });
    }

    const allAvailable = Object.values(results).every(v => v === true);

    return JSON.stringify({
      success: allAvailable,
      platform: PLATFORM,
      tools: results,
      message: allAvailable
        ? `All native ${isMac ? 'macOS' : 'Linux'} tools are available`
        : `Some tools are missing on ${isMac ? 'macOS' : 'Linux'}.`,
    });
  } catch (e: unknown) {
    return JSON.stringify({ success: false, error: (e as Error).message || 'Health check failed' });
  }
}
