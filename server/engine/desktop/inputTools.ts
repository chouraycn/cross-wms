/**
 * Desktop Input Tools — click / type / keypress / scroll
 */

import { isMac, isLinux, PLATFORM } from '../toolTypes.js';
import { escapeForAppleScript, linuxToolAvailable, desktopSnapshotCache } from './helpers.js';

/** desktop_click — 点击元素（ref 优先）或坐标（支持归一化坐标） */
export async function handleDesktopClick(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const ref = args.ref ? String(args.ref) : null;
    let x = args.x !== undefined ? Number(args.x) : null;
    let y = args.y !== undefined ? Number(args.y) : null;
    const nx = args.nx !== undefined ? Number(args.nx) : null;
    const ny = args.ny !== undefined ? Number(args.ny) : null;
    let resolvedFromRef = false;
    let resolvedFromNormalized = false;

    // ref 模式：从缓存查找元素 bounds，计算中心坐标
    if (ref) {
      if (!desktopSnapshotCache || !desktopSnapshotCache.has(ref)) {
        return JSON.stringify({
          success: false,
          error: `未找到 ref "${ref}" 的缓存元素。请先调用 desktop_snapshot 获取元素列表。`,
        });
      }
      const elem = desktopSnapshotCache.get(ref)!;
      x = Math.round(elem.bounds.x + elem.bounds.w / 2);
      y = Math.round(elem.bounds.y + elem.bounds.h / 2);
      resolvedFromRef = true;
    } else if (nx !== null && ny !== null) {
      // v1.5.130: 归一化坐标模式 — 分辨率无关点击
      // nx, ny 在 0.0~1.0 范围，转换为屏幕绝对坐标
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
        return JSON.stringify({
          success: false,
          error: `归一化坐标 nx/ny 必须在 0.0~1.0 范围内，当前 nx=${nx}, ny=${ny}`,
        });
      }

      // 获取屏幕分辨率
      let screenW = 0;
      let screenH = 0;
      try {
        if (isMac) {
          const resolution = execSync(
            `python3 -c "import Quartz; m=Quartz.CGDisplayBounds(Quartz.CGMainDisplayID()); print(f'{m.size.width},{m.size.height}')"`,
            { encoding: 'utf8', timeout: 3000 }
          ).trim();
          const [w, h] = resolution.split(',');
          screenW = parseInt(w) || 0;
          screenH = parseInt(h) || 0;
        } else if (isLinux) {
          const resolution = execSync('xdpyinfo | grep dimensions', { encoding: 'utf8', timeout: 3000 }).trim();
          const match = resolution.match(/(\d+)x(\d+)/);
          if (match) {
            screenW = parseInt(match[1]) || 0;
            screenH = parseInt(match[2]) || 0;
          }
        }
      } catch {
        // 降级：使用默认分辨率
      }

      if (screenW > 0 && screenH > 0) {
        x = Math.round(nx * screenW);
        y = Math.round(ny * screenH);
        resolvedFromNormalized = true;
      } else {
        return JSON.stringify({
          success: false,
          error: '无法获取屏幕分辨率，归一化坐标转换失败。请使用绝对坐标 x/y 或 ref。',
        });
      }
    }

    if (x === null || y === null) {
      return JSON.stringify({ success: false, error: '需要提供 ref、x/y 坐标或 nx/ny 归一化坐标' });
    }

    // 构建返回值附加信息
    const extraInfo: Record<string, unknown> = {};
    if (ref) { extraInfo.ref = ref; extraInfo.resolvedFromRef = resolvedFromRef; }
    if (resolvedFromNormalized) { extraInfo.nx = nx; extraInfo.ny = ny; extraInfo.resolvedFromNormalized = true; }

    if (isMac) {
      // macOS: 使用 Python + Quartz 精确点击
      try {
        const fs = await import('fs');
        const pythonScript = `
import sys, time
try:
    import Quartz
    moveEvent = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, (${x}, ${y}), Quartz.kCGMouseButtonLeft)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, moveEvent)
    time.sleep(0.05)
    downEvent = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, (${x}, ${y}), Quartz.kCGMouseButtonLeft)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, downEvent)
    time.sleep(0.05)
    upEvent = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, (${x}, ${y}), Quartz.kCGMouseButtonLeft)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, upEvent)
    print("OK")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;
        const tmpFile = `/tmp/desktop-click-${Date.now()}.py`;
        fs.writeFileSync(tmpFile, pythonScript);
        const output = execSync(`python3 "${tmpFile}"`, { encoding: 'utf8', timeout: 3000 }).toString();
        try { await fs.promises.unlink(tmpFile); } catch {}
        return JSON.stringify({ success: true, output: output.trim(), x, y, ...extraInfo });
      } catch {
        // Fallback: cliclick
        try {
          execSync(`cliclick c:${x},${y}`, { encoding: 'utf8', timeout: 3000 });
          return JSON.stringify({ success: true, method: 'cliclick', x, y, ...extraInfo });
        } catch {
          return JSON.stringify({ success: false, error: 'Click failed. Grant Accessibility permissions or install cliclick.' });
        }
      }
    } else if (isLinux) {
      // Linux: xdotool
      execSync(`xdotool mousemove ${x} ${y} click 1`, { encoding: 'utf8', timeout: 3000 });
      return JSON.stringify({ success: true, x, y, ...extraInfo });
    } else {
      return JSON.stringify({ success: false, error: `Unsupported platform: ${PLATFORM}` });
    }
  } catch (e: unknown) {
    return JSON.stringify({ success: false, error: (e as Error).message || 'Click failed' });
  }
}

/** desktop_type — 在元素（ref）或当前焦点位置输入文本 */
export async function handleDesktopType(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const text = String(args.text || '');
    const submit = Boolean(args.submit);
    const ref = args.ref ? String(args.ref) : null;

    if (!text) {
      return JSON.stringify({ success: false, error: 'text parameter is required' });
    }

    // ref 模式：先点击元素中心聚焦，再输入
    let focusedViaRef = false;
    if (ref) {
      if (!desktopSnapshotCache || !desktopSnapshotCache.has(ref)) {
        return JSON.stringify({
          success: false,
          error: `未找到 ref "${ref}" 的缓存元素。请先调用 desktop_snapshot。`,
        });
      }
      const elem = desktopSnapshotCache.get(ref)!;
      const cx = Math.round(elem.bounds.x + elem.bounds.w / 2);
      const cy = Math.round(elem.bounds.y + elem.bounds.h / 2);
      // 点击元素中心聚焦
      const clickResult = JSON.parse(await handleDesktopClick({ x: cx, y: cy }));
      if (!clickResult.success) {
        return JSON.stringify({ success: false, error: `聚焦元素失败: ${clickResult.error}` });
      }
      focusedViaRef = true;
      // 短暂等待聚焦完成
      execSync('sleep 0.15', { encoding: 'utf8', timeout: 1000 });
    }

    if (isMac) {
      // Escape text for AppleScript
      const escapedText = escapeForAppleScript(text);

      // Build AppleScript command
      const script = `tell application "System Events" to keystroke "${escapedText}"`;

      // Execute the keystroke
      const output = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
        encoding: 'utf8',
        timeout: 3000,
      }).toString();

      // If submit is true, send return key
      if (submit) {
        const returnScript = `tell application "System Events" to keystroke return`;
        execSync(`osascript -e '${returnScript.replace(/'/g, "'\\''")}'`, {
          encoding: 'utf8',
          timeout: 3000,
        });
      }

      return JSON.stringify({
        success: true,
        output: output.trim(),
        charactersTyped: text.length,
        submitted: submit,
        ...(focusedViaRef ? { ref, focusedViaRef } : {}),
      });
    } else if (isLinux) {
      // xdotool type --delay 0 不支持中文，用 xsel + xdotool key
      const escapedText = text.replace(/'/g, "'\\''");
      if (await linuxToolAvailable('xdotool')) {
        execSync(`xdotool type --clearmodifiers --delay 2 '${escapedText}'`, { encoding: 'utf8', timeout: 5000 });
        if (submit) {
          execSync(`xdotool key Return`, { encoding: 'utf8', timeout: 1000 });
        }
        return JSON.stringify({
          success: true,
          charactersTyped: text.length,
          submitted: submit,
          ...(focusedViaRef ? { ref, focusedViaRef } : {}),
        });
      } else {
        return JSON.stringify({ success: false, error: 'xdotool not available on Linux. Install: apt install xdotool' });
      }
    } else {
      return JSON.stringify({ success: false, error: `Unsupported platform: ${PLATFORM}` });
    }
  } catch (e: unknown) {
    return JSON.stringify({ success: false, error: (e as Error).message || 'Type failed' });
  }
}

/** desktop_key_press - Press key combination */
export async function handleDesktopKeyPress(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const keys = String(args.keys || '');
    const app = args.app ? String(args.app) : null;

    if (!keys) {
      return JSON.stringify({ success: false, error: 'keys parameter is required' });
    }

    if (isMac) {
      // Parse key combination (e.g., "cmd,shift,t" or "cmd,v")
      const keyArray = keys.split(',').map(k => k.trim().toLowerCase());

      // Last element is the key, others are modifiers
      const key = keyArray[keyArray.length - 1];
      const modifiers = keyArray.slice(0, keyArray.length - 1);

      // Map modifiers to AppleScript syntax
      const modifierMap: Record<string, string> = {
        'cmd': 'command down',
        'command': 'command down',
        'shift': 'shift down',
        'ctrl': 'control down',
        'control': 'control down',
        'option': 'option down',
        'alt': 'option down',
        'cmd+': 'command down',  // Support "cmd+t" format
      };

      // Build using clause for modifiers
      let usingClause = '';
      if (modifiers.length > 0) {
        const appleModifiers = modifiers.map(m => {
          // Handle "cmd+t" format where cmd is part of the key
          if (m.includes('+')) {
            const parts = m.split('+');
            return parts.map(p => modifierMap[p] || p).join(', ');
          }
          return modifierMap[m] || m;
        }).filter(Boolean);

        if (appleModifiers.length > 0) {
          usingClause = ` using {${appleModifiers.join(', ')}}`;
        }
      }

      // Build AppleScript command
      let script: string;
      if (app) {
        // Target specific app
        script = `tell application "${app}" to activate`;
        execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
          encoding: 'utf8',
          timeout: 2000,
        });

        // Small delay to ensure app is active
        execSync(`sleep 0.2`, { encoding: 'utf8', timeout: 1000 });
      }

      // Send the keystroke with modifiers
      script = `tell application "System Events" to keystroke "${key}"${usingClause}`;
      const output = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
        encoding: 'utf8',
        timeout: 3000,
      }).toString();

      return JSON.stringify({
        success: true,
        output: output.trim(),
        keys,
        parsed: { key, modifiers },
      });
    } else if (isLinux) {
      // 转换按键格式: "ctrl,shift,t" → "ctrl+shift+t"
      const keyStr = keys.replace(/,/g, '+');
      // 映射 macOS 按键名到 Linux
      const linuxKeys = keyStr
        .replace(/cmd\+?/gi, 'ctrl')
        .replace(/option\+?/gi, 'alt')
        .replace(/command\+?/gi, 'ctrl')
        .replace(/return/gi, 'Return')
        .replace(/enter/gi, 'Return');
      execSync(`xdotool key '${linuxKeys}'`, { encoding: 'utf8', timeout: 3000 });
      return JSON.stringify({
        success: true,
        keys,
        linuxKeys,
      });
    } else {
      return JSON.stringify({ success: false, error: `Unsupported platform: ${PLATFORM}` });
    }
  } catch (e: unknown) {
    return JSON.stringify({ success: false, error: (e as Error).message || 'Key press failed' });
  }
}

/** desktop_scroll - Scroll using osascript (via keyboard simulation) */
export async function handleDesktopScroll(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const x = Number(args.x) || 0;
    const y = Number(args.y) || 0;
    const amount = Number(args.amount) || 100;

    // Move mouse to position first
    if (isMac) {
      const moveScript = `tell application "System Events" to set position of mouse to {${x}, ${y}}`;
      execSync(`osascript -e '${moveScript.replace(/'/g, "'\\''")}'`, {
        encoding: 'utf8',
        timeout: 2000,
      });

      // Determine scroll direction and number of key presses
      // Positive amount = scroll down, Negative = scroll up
      // We'll simulate Page Up/Down keys
      const isScrollDown = amount > 0;
      const keyCode = isScrollDown ? 121 : 116; // 121 = Page Down, 116 = Page Up
      const numPresses = Math.ceil(Math.abs(amount) / 500); // Rough conversion

      // Simulate pressing Page Up/Down multiple times
      for (let i = 0; i < numPresses; i++) {
        const script = `tell application "System Events" to key code ${keyCode}`;
        execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
          encoding: 'utf8',
          timeout: 1000,
        });
        // Small delay between key presses
        execSync(`sleep 0.1`, { encoding: 'utf8', timeout: 500 });
      }

      return JSON.stringify({
        success: true,
        x,
        y,
        amount,
        direction: isScrollDown ? 'down' : 'up',
        keyPresses: numPresses,
        note: 'Scrolling simulated via Page Up/Down keys. For pixel-precise scrolling, consider installing cliclick.',
      });
    } else if (isLinux) {
      const scrollAmount = amount > 0 ? Math.abs(amount) : Math.abs(amount);
      const button = amount > 0 ? 5 : 4; // 5=scroll down, 4=scroll up
      execSync(`xdotool mousemove ${x} ${y} click --repeat ${Math.ceil(scrollAmount / 50)} ${button}`, { encoding: 'utf8', timeout: 3000 });
      return JSON.stringify({
        success: true,
        x,
        y,
        amount,
        direction: amount > 0 ? 'down' : 'up',
      });
    } else {
      return JSON.stringify({ success: false, error: `Unsupported platform: ${PLATFORM}` });
    }
  } catch (e: unknown) {
    return JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : 'Scroll failed',
      help: 'For better scrolling control, install cliclick: brew install cliclick',
    });
  }
}
