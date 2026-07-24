/**
 * Desktop App Tools — app_launch / app_quit / window_focus
 */

import { isMac, isLinux, PLATFORM } from '../toolTypes.js';
import { linuxToolAvailable, BROWSER_APPS } from './helpers.js';

/** desktop_app_launch - Launch application using `open` command */
export async function handleDesktopAppLaunch(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const app = String(args.app || '');
    const url = args.url ? String(args.url) : null;

    if (!app) {
      return JSON.stringify({ success: false, error: 'app parameter is required' });
    }

    // v2.3.4: 对于浏览器 + URL 的组合，不启动系统浏览器，改为返回 URL 让前端在应用内窗口打开
    const isBrowserApp = BROWSER_APPS.has(app.toLowerCase().trim());
    if (isBrowserApp && url) {
      // 返回 URL 让前端处理（Swift 原生应用通过 WKNavigationDelegate 在外部浏览器打开）
      return JSON.stringify({
        success: true,
        output: `链接已准备好: ${url}`,
        app,
        url,
        inApp: true,
      });
    }

    let command: string;
    let output = '';

    if (isMac) {
      if (url) {
        command = `open -a "${app}" "${url}"`;
      } else {
        command = `open -a "${app}"`;
      }
      output = execSync(command, { encoding: 'utf8', timeout: 5000 }).toString();
    } else if (isLinux) {
      if (url) {
        execSync(`xdg-open "${url}"`, { encoding: 'utf8', timeout: 5000 });
      } else {
        execSync(`nohup ${app} > /dev/null 2>&1 &`, { encoding: 'utf8', timeout: 3000, shell: '/bin/bash' });
      }
      output = '';
    } else {
      return JSON.stringify({ success: false, error: `Unsupported platform: ${PLATFORM}` });
    }

    return JSON.stringify({
      success: true,
      output: output.trim() || `${app} launched successfully`,
      app,
      url: url || undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    // Check if it's a "command failed" error
    if (message.includes('Command failed')) {
      return JSON.stringify({
        success: false,
        error: `Failed to launch "${args.app}". Make sure the app name is correct.`,
        help: 'Check app name in /Applications or use "open -a <AppName>" in terminal to test',
      });
    }
    return JSON.stringify({ success: false, error: message || 'App launch failed' });
  }
}

/** desktop_app_quit - Quit application using osascript */
export async function handleDesktopAppQuit(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const app = String(args.app || '');

    if (!app) {
      return JSON.stringify({ success: false, error: 'app parameter is required' });
    }

    if (isMac) {
      // Use osascript to quit the app
      const script = `quit app "${app}"`;
      const output = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
        encoding: 'utf8',
        timeout: 5000,
      }).toString();

      return JSON.stringify({
        success: true,
        output: output.trim() || `${app} quit successfully`,
        app,
      });
    } else if (isLinux) {
      try {
        execSync(`pkill -x "${app}"`, { encoding: 'utf8', timeout: 3000 });
      } catch {
        try {
          execSync(`killall "${app}"`, { encoding: 'utf8', timeout: 3000 });
        } catch {
          return JSON.stringify({ success: false, error: `Failed to quit ${app}` });
        }
      }
      return JSON.stringify({
        success: true,
        output: `${app} quit successfully`,
        app,
      });
    } else {
      return JSON.stringify({ success: false, error: `Unsupported platform: ${PLATFORM}` });
    }
  } catch (e: unknown) {
    // If osascript/pkill fails, try pkill as fallback
    try {
      execSync(`pkill -x "${args.app}"`, { encoding: 'utf8', timeout: 3000 });
      return JSON.stringify({
        success: true,
        output: `Force quit ${args.app} using pkill`,
        method: 'pkill',
      });
    } catch {
      return JSON.stringify({
        success: false,
        error: (e as Error).message || 'App quit failed',
        help: 'Make sure the app name is correct and the app is running',
      });
    }
  }
}

/** desktop_window_focus - Focus application window using osascript */
export async function handleDesktopWindowFocus(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const app = String(args.app || '');
    const windowTitle = args.window_title ? String(args.window_title) : null;

    if (!app) {
      return JSON.stringify({ success: false, error: 'app parameter is required' });
    }

    let output: string;

    if (isMac) {
      if (windowTitle) {
        // Focus specific window by title
        const script = `
tell application "${app}"
  activate
  tell window "${windowTitle}"
    if exists then
      set index to 1
    end if
  end tell
end tell
`;
        output = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
          encoding: 'utf8',
          timeout: 3000,
        }).toString();
      } else {
        // Simply activate the app (bring to front)
        const script = `tell application "${app}" to activate`;
        output = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
          encoding: 'utf8',
          timeout: 3000,
        }).toString();

        // Also use System Events to ensure it's frontmost
        const frontmostScript = `
tell application "System Events"
  tell process "${app}"
    set frontmost to true
  end tell
end tell
`;
        execSync(`osascript -e '${frontmostScript.replace(/'/g, "'\\''")}'`, {
          encoding: 'utf8',
          timeout: 2000,
        }).toString();
      }

      return JSON.stringify({
        success: true,
        output: output.trim() || `${app} is now focused`,
        app,
        windowTitle: windowTitle || undefined,
      });
    } else if (isLinux) {
      if (await linuxToolAvailable('wmctrl')) {
        if (windowTitle) {
          execSync(`wmctrl -a "${windowTitle}"`, { encoding: 'utf8', timeout: 3000 });
        } else {
          execSync(`wmctrl -a "${app}"`, { encoding: 'utf8', timeout: 3000 });
        }
      } else if (await linuxToolAvailable('xdotool')) {
        execSync(`xdotool search --name "${app}" windowactivate`, { encoding: 'utf8', timeout: 3000 });
      } else {
        return JSON.stringify({ success: false, error: 'wmctrl/xdotool not available. Install: apt install wmctrl xdotool' });
      }
      return JSON.stringify({
        success: true,
        app,
        windowTitle: windowTitle || undefined,
      });
    } else {
      return JSON.stringify({ success: false, error: `Unsupported platform: ${PLATFORM}` });
    }
  } catch (e: unknown) {
    return JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : 'Window focus failed',
      help: 'Make sure the app is running and the name is correct',
    });
  }
}
