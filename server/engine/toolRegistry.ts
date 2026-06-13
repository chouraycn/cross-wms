/**
 * Tool Registry — 工具注册表
 *
 * 统一管理所有可用工具的 schema 定义和执行 handler。
 * 工具按命名空间分组：
 * - system.* — 系统信息查询
 * - file.* — 文件系统操作
 * - db.* — 数据库查询
 * - wms.* — WMS 业务操作
 * - desktop.* — 桌面自动化操作（macOS 原生工具）
 *
 * v1.9.0: 新增 Tool Calling 支持
 * v2.0.0: 新增 desktop:* 命名空间，支持 macOS 桌面自动化
 * v2.1.0: 迁移到 macOS 原生工具（screencapture, osascript, open, pbcopy, pbpaste）
 */

import type { ToolDefinition, ToolCall } from '../aiClient.js';

// ===================== 类型定义 =====================

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

// ===================== 内置工具实现 =====================

/** 获取系统信息 */
async function handleSystemInfo(): Promise<string> {
  const os = await import('os');
  return JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
    hostname: os.hostname(),
  });
}

/** 列出目录内容 */
async function handleListDir(args: Record<string, unknown>): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');
  const dirPath = String(args.path || '.');
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return JSON.stringify(entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
    })));
  } catch (e) {
    return JSON.stringify({ error: `无法读取目录: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 读取文件内容 */
async function handleReadFile(args: Record<string, unknown>): Promise<string> {
  const fs = await import('fs');
  const filePath = String(args.path || '');
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    // 限制返回内容长度，避免超出 token 限制
    const maxLen = 10000;
    if (content.length > maxLen) {
      return content.slice(0, maxLen) + '\n\n[文件过长，已截断...]';
    }
    return content;
  } catch (e) {
    return JSON.stringify({ error: `无法读取文件: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 写入文件（安全限制：仅允许写入用户数据目录和临时目录） */
async function handleWriteFile(args: Record<string, unknown>): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const filePath = String(args.path || '');
  const content = String(args.content || '');

  // 安全检查：解析为绝对路径
  const resolvedPath = path.resolve(filePath);

  // 允许写入的目录白名单
  const homeDir = os.homedir();
  const allowedDirs = [
    path.join(homeDir, '.cdf-know-clow'),  // 应用数据目录
    path.join(homeDir, 'Desktop'),           // 桌面
    path.join(homeDir, 'Documents'),         // 文档
    path.join(homeDir, 'Downloads'),         // 下载
    '/tmp',                                   // 临时目录
  ];

  const isAllowed = allowedDirs.some(dir => resolvedPath.startsWith(dir + path.sep) || resolvedPath.startsWith(dir + '/'));
  if (!isAllowed) {
    return JSON.stringify({
      error: `安全限制：仅允许写入以下目录：${allowedDirs.map(d => d.replace(homeDir, '~')).join(', ')}`,
    });
  }

  // 禁止写入系统关键路径
  const systemPatterns = ['/etc/', '/usr/', '/bin/', '/sbin/', '/System/', '/Library/', '/var/'];
  for (const sysPath of systemPatterns) {
    if (resolvedPath.startsWith(sysPath)) {
      return JSON.stringify({ error: '安全限制：禁止写入系统目录。' });
    }
  }

  // 限制写入内容大小（最大 1MB）
  const maxSize = 1024 * 1024;
  if (content.length > maxSize) {
    return JSON.stringify({ error: `安全限制：写入内容超过 1MB 限制（当前 ${(content.length / 1024).toFixed(1)}KB）。` });
  }

  try {
    // 确保父目录存在
    const dir = path.dirname(resolvedPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(resolvedPath, content, 'utf-8');
    return JSON.stringify({ success: true, path: resolvedPath, bytesWritten: content.length });
  } catch (e) {
    return JSON.stringify({ error: `无法写入文件: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 执行终端命令（安全白名单模式） */
const ALLOWED_COMMANDS = [
  // 文件查看
  'ls', 'cat', 'head', 'tail', 'wc', 'file', 'stat',
  // 目录导航
  'pwd', 'cd',
  // 系统信息
  'whoami', 'date', 'df', 'du', 'ps', 'uname', 'hostname',
  // 文本处理（只读）
  'grep', 'find', 'sort', 'uniq', 'diff', 'echo',
  // 开发工具
  'git', 'npm', 'node', 'npx', 'python3', 'python', 'pip',
  // 网络（只读）
  'curl', 'wget', 'ping', 'nslookup', 'dig',
];

/** 危险参数模式 — 即使命令在白名单中，包含这些参数也会被拒绝 */
const DANGEROUS_ARG_PATTERNS = [
  /rm\s+-rf?\s+/, /-recursive/, /--delete/,
  />\s*\/dev\//, /mkfs/, /dd\s+if=/, /chmod\s+777/,
  /\|\s*sudo/, /;\s*rm/, /\|\s*rm/,
];

async function handleExecCommand(args: Record<string, unknown>): Promise<string> {
  const { spawn } = await import('child_process');
  const command = String(args.command || '');
  const commandArgs = Array.isArray(args.args) ? args.args.map(String) : [];

  // 安全检查：只允许白名单命令
  const cmdName = command.split(' ')[0];
  if (!ALLOWED_COMMANDS.includes(cmdName)) {
    return JSON.stringify({ error: `命令 '${cmdName}' 不在白名单中。允许的命令: ${ALLOWED_COMMANDS.join(', ')}` });
  }

  // 安全检查：检测危险参数组合
  const fullCommand = `${command} ${commandArgs.join(' ')}`;
  for (const pattern of DANGEROUS_ARG_PATTERNS) {
    if (pattern.test(fullCommand)) {
      return JSON.stringify({ error: `安全限制：检测到危险参数组合，执行已拒绝。` });
    }
  }

  // 安全检查：禁止 shell 注入（; | & ` $() 等）
  const shellInjectionPattern = /[;|&`$]/;
  if (shellInjectionPattern.test(fullCommand)) {
    return JSON.stringify({ error: '安全限制：命令中包含不允许的 shell 特殊字符（; | & ` $）。' });
  }

  return new Promise((resolve) => {
    const child = spawn(cmdName, commandArgs, {
      shell: false,  // 禁用 shell，防止参数注入
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout!.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr!.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number | null) => {
      const maxLen = 5000;
      const result = {
        exitCode: code,
        stdout: stdout.length > maxLen ? stdout.slice(0, maxLen) + '\n[输出已截断...]' : stdout,
        stderr: stderr.length > maxLen ? stderr.slice(0, maxLen) + '\n[错误输出已截断...]' : stderr,
      };
      resolve(JSON.stringify(result));
    });

    child.on('error', (err: Error) => {
      resolve(JSON.stringify({ error: `执行失败: ${err.message}` }));
    });
  });
}

/** 查询 SQLite 数据库（安全限制：仅允许 SELECT 语句） */
async function handleDbQuery(args: Record<string, unknown>): Promise<string> {
  const { initDb } = await import('../db.js');
  const sql = String(args.sql || '').trim();

  // 安全检查：仅允许 SELECT 语句
  const normalizedSql = sql.toUpperCase().replace(/\s+/g, ' ');
  if (!normalizedSql.startsWith('SELECT')) {
    return JSON.stringify({ error: '安全限制：仅允许 SELECT 查询语句。不允许 INSERT/UPDATE/DELETE/DROP 等写操作。' });
  }

  // 禁止危险关键字（即使伪装在子查询中）
  const dangerousPatterns = [
    /\bDROP\b/i, /\bDELETE\b/i, /\bINSERT\b/i, /\bUPDATE\b/i,
    /\bALTER\b/i, /\bCREATE\b/i, /\bGRANT\b/i, /\bREVOKE\b/i,
    /\bATTACH\b/i, /\bDETACH\b/i, /\bPRAGMA\b/i,
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(sql)) {
      return JSON.stringify({ error: `安全限制：SQL 中包含不允许的关键字 '${pattern.source}'。` });
    }
  }

  // 限制结果行数，防止大量数据消耗 token
  const limitedSql = normalizedSql.includes('LIMIT') ? sql : `${sql} LIMIT 100`;

  try {
    const db = initDb();
    const results = db.prepare(limitedSql).all();
    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify({ error: `查询失败: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 获取 WMS 库存概览 */
async function handleWmsInventory(): Promise<string> {
  const { initDb } = await import('../db.js');
  try {
    const db = initDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM inventory').get() as { count: number };
    const warehouses = db.prepare('SELECT COUNT(DISTINCT warehouse_id) as count FROM inventory').get() as { count: number };
    const lowStock = db.prepare('SELECT COUNT(*) as count FROM inventory WHERE quantity < safety_stock').get() as { count: number };
    return JSON.stringify({ totalItems: total.count, warehouseCount: warehouses.count, lowStockItems: lowStock.count });
  } catch (e) {
    return JSON.stringify({ error: `查询失败: ${e instanceof Error ? e.message : String(e)}` });
  }
}

// ===================== Desktop Automation Tools (macOS Native Tools) =====================

/**
 * Desktop Tools Architecture:
 * - CrossWMS runs as a desktop app with Node.js Express backend
 * - The backend runs on macOS and uses native tools:
 *   - screencapture: built-in screenshot command
 *   - osascript: AppleScript/JavaScript for Automation
 *   - open: launch applications
 *   - pbcopy/pbpaste: clipboard operations
 * - ZERO dependencies: All tools ship with macOS
 * - All tools return JSON string with { success: boolean, ... }
 */

/** Helper: Escape text for AppleScript string literals */
function escapeForAppleScript(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}

/** Helper: Execute AppleScript with proper error handling */
async function runAppleScript(script: string, timeout: number = 3000): Promise<string> {
  const { execSync } = await import('child_process');
  try {
    const output = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8',
      timeout,
    });
    return output.toString().trim();
  } catch (e: any) {
    throw new Error(`AppleScript execution failed: ${e.message}`);
  }
}

/** desktop:health - Check native tool availability */
async function handleDesktopHealth(): Promise<string> {
  try {
    const { execSync } = await import('child_process');
    const tools = ['screencapture', 'osascript', 'open', 'pbcopy', 'pbpaste'];
    const results: Record<string, boolean> = {};

    for (const tool of tools) {
      try {
        execSync(`which ${tool}`, { encoding: 'utf8', timeout: 1000 });
        results[tool] = true;
      } catch {
        results[tool] = false;
      }
    }

    const allAvailable = Object.values(results).every(v => v === true);

    return JSON.stringify({
      success: allAvailable,
      tools: results,
      message: allAvailable
        ? 'All native macOS tools are available'
        : 'Some tools are missing. Ensure you are running on macOS.',
    });
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.message || 'Health check failed' });
  }
}

/** desktop:screenshot - Take a screenshot and return base64 */
async function handleDesktopScreenshot(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');
  const fs = await import('fs');
  const path = await import('path');

  try {
    const timestamp = Date.now();
    const screenshotPath = `/tmp/desktop-screenshot-${timestamp}.png`;

    // Take screenshot using screencapture
    // -x: suppress countdown sound
    // -t png: specify PNG format
    execSync(`screencapture -x -t png "${screenshotPath}"`, {
      encoding: 'utf8',
      timeout: 5000,
    });

    // Check if file exists
    if (!fs.existsSync(screenshotPath)) {
      return JSON.stringify({ success: false, error: 'Screenshot file not created' });
    }

    // Read and convert to base64
    const imageBuffer = fs.readFileSync(screenshotPath);
    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    // Clean up temp file
    try {
      fs.unlinkSync(screenshotPath);
    } catch {
      // Ignore cleanup errors
    }

    return JSON.stringify({
      success: true,
      image: dataUrl,
      message: 'Screenshot captured using native screencapture. Use this image to identify UI elements and click targets visually.',
    });
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.message || 'Screenshot failed' });
  }
}

/** desktop:click - Click at coordinates using osascript */
async function handleDesktopClick(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    // Validate arguments
    const x = args.x !== undefined ? Number(args.x) : null;
    const y = args.y !== undefined ? Number(args.y) : null;

    if (x === null || y === null) {
      return JSON.stringify({
        success: false,
        error: 'Both x and y coordinates are required for native click',
      });
    }

    // Use osascript to perform click via System Events
    // Note: This requires Accessibility permissions
    const script = `
tell application "System Events"
  set theLocation to {${x}, ${y}}
  set theMouse to theLocation
  tell application process "System Events"
    click at theMouse
  end tell
end tell
`;

    // Alternative: Use AppleScript to move mouse and click
    const moveScript = `tell application "System Events" to set position of mouse to {${x}, ${y}}`;
    const clickScript = `tell application "System Events" to click`;

    try {
      // Move mouse to position
      execSync(`osascript -e '${moveScript.replace(/'/g, "'\\''")}'`, {
        encoding: 'utf8',
        timeout: 3000,
      });

      // Perform click using Python via osascript for better mouse control
      // Using a small Python script for precise clicking
      const pythonScript = `
import sys
import time
try:
    import Quartz
    import ApplicationServices
    from Foundation import NSURL
    
    # Move mouse and click
    moveEvent = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, (${x}, ${y}), Quartz.kCGMouseButtonLeft)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, moveEvent)
    time.sleep(0.05)
    
    # Left mouse down
    downEvent = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, (${x}, ${y}), Quartz.kCGMouseButtonLeft)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, downEvent)
    time.sleep(0.05)
    
    # Left mouse up
    upEvent = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, (${x}, ${y}), Quartz.kCGMouseButtonLeft)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, upEvent)
    
    print("Click successful at {${x}, ${y}}")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;

      // Write Python script to temp file and execute
      const fs = await import('fs');
      const tmpFile = `/tmp/desktop-click-${Date.now()}.py`;
      fs.writeFileSync(tmpFile, pythonScript);

      const output = execSync(`python3 "${tmpFile}"`, {
        encoding: 'utf8',
        timeout: 3000,
      }).toString();

      // Clean up
      try { fs.unlinkSync(tmpFile); } catch {}

      return JSON.stringify({
        success: true,
        output: output.trim(),
        x,
        y,
      });
    } catch (e: any) {
      // Fallback: Try using cliclick if available (common macOS automation tool)
      try {
        execSync(`which cliclick`, { encoding: 'utf8', timeout: 1000 });
        const output = execSync(`cliclick c:${x},${y}`, {
          encoding: 'utf8',
          timeout: 3000,
        }).toString();

        return JSON.stringify({
          success: true,
          output: output.trim(),
          method: 'cliclick',
          x,
          y,
        });
      } catch {
        // cliclick not available
        return JSON.stringify({
          success: false,
          error: 'Click failed. Install cliclick for reliable clicking, or grant Accessibility permissions.',
          help: 'brew install cliclick',
        });
      }
    }
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.message || 'Click failed' });
  }
}

/** desktop:type - Type text using osascript */
async function handleDesktopType(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const text = String(args.text || '');
    const submit = Boolean(args.submit);

    if (!text) {
      return JSON.stringify({ success: false, error: 'text parameter is required' });
    }

    // Escape text for AppleScript
    const escapedText = escapeForAppleScript(text);

    // Build AppleScript command
    let script = `tell application "System Events" to keystroke "${escapedText}"`;

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
    });
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.message || 'Type failed' });
  }
}

/** desktop:key_press - Press key combination using osascript */
async function handleDesktopKeyPress(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const keys = String(args.keys || '');
    const app = args.app ? String(args.app) : null;

    if (!keys) {
      return JSON.stringify({ success: false, error: 'keys parameter is required' });
    }

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
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.message || 'Key press failed' });
  }
}

/** desktop:app_launch - Launch application using `open` command */
async function handleDesktopAppLaunch(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const app = String(args.app || '');
    const url = args.url ? String(args.url) : null;

    if (!app) {
      return JSON.stringify({ success: false, error: 'app parameter is required' });
    }

    let command: string;
    let output: string;

    if (url) {
      // Launch app with URL
      command = `open -a "${app}" "${url}"`;
    } else {
      // Launch app without URL
      command = `open -a "${app}"`;
    }

    output = execSync(command, { encoding: 'utf8', timeout: 5000 }).toString();

    return JSON.stringify({
      success: true,
      output: output.trim() || `${app} launched successfully`,
      app,
      url: url || undefined,
    });
  } catch (e: any) {
    // Check if it's a "command failed" error
    if (e.message && e.message.includes('Command failed')) {
      return JSON.stringify({
        success: false,
        error: `Failed to launch "${args.app}". Make sure the app name is correct.`,
        help: 'Check app name in /Applications or use "open -a <AppName>" in terminal to test',
      });
    }
    return JSON.stringify({ success: false, error: e.message || 'App launch failed' });
  }
}

/** desktop:app_quit - Quit application using osascript */
async function handleDesktopAppQuit(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const app = String(args.app || '');

    if (!app) {
      return JSON.stringify({ success: false, error: 'app parameter is required' });
    }

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
  } catch (e: any) {
    // If osascript fails, try `pkill` as fallback
    try {
      const { execSync } = await import('child_process');
      execSync(`pkill -x "${args.app}"`, { encoding: 'utf8', timeout: 3000 });
      return JSON.stringify({
        success: true,
        output: `Force quit ${args.app} using pkill`,
        method: 'pkill',
      });
    } catch {
      return JSON.stringify({
        success: false,
        error: e.message || 'App quit failed',
        help: 'Make sure the app name is correct and the app is running',
      });
    }
  }
}

/** desktop:window_focus - Focus application window using osascript */
async function handleDesktopWindowFocus(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const app = String(args.app || '');
    const windowTitle = args.window_title ? String(args.window_title) : null;

    if (!app) {
      return JSON.stringify({ success: false, error: 'app parameter is required' });
    }

    let output: string;

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
  } catch (e: any) {
    return JSON.stringify({
      success: false,
      error: e.message || 'Window focus failed',
      help: 'Make sure the app is running and the name is correct',
    });
  }
}

/** desktop:clipboard - Read/write clipboard using pbcopy/pbpaste */
async function handleDesktopClipboard(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const action = String(args.action || 'get');
    const content = args.content ? String(args.content) : null;

    if (action === 'get') {
      // Read from clipboard using pbpaste
      const output = execSync('pbpaste', {
        encoding: 'utf8',
        timeout: 3000,
      }).toString();

      return JSON.stringify({
        success: true,
        action: 'get',
        content: output,
      });
    } else if (action === 'set') {
      if (!content) {
        return JSON.stringify({ success: false, error: 'content parameter is required for set action' });
      }

      // Write to clipboard using pbcopy
      const { spawn } = await import('child_process');
      const child = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'pipe'] });

      // Write content to stdin
      (child.stdin as any).write(content);
      (child.stdin as any).end();

      // Wait for completion
      await new Promise<void>((resolve, reject) => {
        (child as any).on('close', (code: number) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`pbcopy exited with code ${code}`));
          }
        });
        (child as any).on('error', reject);
      });

      return JSON.stringify({
        success: true,
        action: 'set',
        contentLength: content.length,
      });
    } else {
      return JSON.stringify({
        success: false,
        error: `Invalid action: ${action}. Use 'get' or 'set'`,
      });
    }
  } catch (e: any) {
    return JSON.stringify({
      success: false,
      error: e.message || 'Clipboard operation failed',
    });
  }
}

/** desktop:scroll - Scroll using osascript (via keyboard simulation) */
async function handleDesktopScroll(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');

  try {
    const x = Number(args.x) || 0;
    const y = Number(args.y) || 0;
    const amount = Number(args.amount) || 100;

    // Move mouse to position first
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
  } catch (e: any) {
    return JSON.stringify({
      success: false,
      error: e.message || 'Scroll failed',
      help: 'For better scrolling control, install cliclick: brew install cliclick',
    });
  }
}

/** desktop:see - Take screenshot for visual analysis */
async function handleDesktopSee(args: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('child_process');
  const fs = await import('fs');

  try {
    const timestamp = Date.now();
    const screenshotPath = `/tmp/desktop-see-${timestamp}.png`;

    // Take screenshot using screencapture
    execSync(`screencapture -x -t png "${screenshotPath}"`, {
      encoding: 'utf8',
      timeout: 5000,
    });

    // Check if file exists
    if (!fs.existsSync(screenshotPath)) {
      return JSON.stringify({ success: false, error: 'Screenshot file not created' });
    }

    // Read and convert to base64
    const imageBuffer = fs.readFileSync(screenshotPath);
    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    // Clean up temp file
    try {
      fs.unlinkSync(screenshotPath);
    } catch {
      // Ignore cleanup errors
    }

    return JSON.stringify({
      success: true,
      image: dataUrl,
      message: 'Screenshot captured. Use this image to visually identify UI elements, click targets, text fields, and other interactive elements. Provide coordinates for clicking or describe elements you want to interact with.',
      instructions: 'Analyze the screenshot and identify: 1) Clickable buttons (provide x,y coordinates), 2) Text input fields, 3) Menu items, 4) Any labels or text content needed for automation.',
    });
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.message || 'See analysis failed' });
  }
}

// ===================== 工具注册表 =====================

const registry = new Map<string, RegisteredTool>();

function registerTool(tool: RegisteredTool): void {
  registry.set(tool.definition.function.name, tool);
}

/** 初始化默认工具集 */
export async function initDefaultTools(): Promise<void> {
  // system:info
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'system:info',
        description: '获取当前系统的基本信息，包括操作系统、CPU、内存、Node.js 版本等',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    handler: handleSystemInfo,
  });

  // file:listDir
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'file:listDir',
        description: '列出指定目录下的文件和子目录',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '目录路径，默认为当前目录' },
          },
          required: [],
        },
      },
    },
    handler: handleListDir,
  });

  // file:readFile
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'file:readFile',
        description: '读取指定文件的内容（文本文件）',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' },
          },
          required: ['path'],
        },
      },
    },
    handler: handleReadFile,
  });

  // file:writeFile
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'file:writeFile',
        description: '将内容写入指定文件（会覆盖已有内容）',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' },
            content: { type: 'string', description: '要写入的文件内容' },
          },
          required: ['path', 'content'],
        },
      },
    },
    handler: handleWriteFile,
  });

  // shell:exec
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'shell:exec',
        description: '执行终端命令（仅限白名单内的命令：ls, cat, echo, pwd, git, npm, node, python, curl 等）',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: '要执行的命令' },
            args: { type: 'array', items: { type: 'string' }, description: '命令参数列表' },
          },
          required: ['command'],
        },
      },
    },
    handler: handleExecCommand,
  });

  // db:query
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'db:query',
        description: '执行 SQLite 数据库查询（SELECT 语句）',
        parameters: {
          type: 'object',
          properties: {
            sql: { type: 'string', description: 'SQL 查询语句' },
          },
          required: ['sql'],
        },
      },
    },
    handler: handleDbQuery,
  });

  // wms:inventory
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'wms:inventory',
        description: '获取 WMS 库存概览信息（总商品数、仓库数、低库存商品数）',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    handler: handleWmsInventory,
  });

  // ===================== Desktop Automation Tools (macOS Native) =====================

  // desktop:health
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop:health',
        description: '检查 macOS 原生工具是否可用（screencapture, osascript, open, pbcopy, pbpaste）。用于验证桌面自动化功能是否可用。',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    handler: handleDesktopHealth,
  });

  // desktop:screenshot
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop:screenshot',
        description: '截取当前屏幕截图，返回 base64 图片数据。用于 AI 分析屏幕内容后决定下一步操作。可选生成带标注的版本。',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    handler: handleDesktopScreenshot,
  });

  // desktop:click
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop:click',
        description: '在指定坐标点击。提供 x,y 坐标进行点击。可配合 desktop:screenshot 获取屏幕截图后确定坐标。',
        parameters: {
          type: 'object',
          properties: {
            x: { type: 'number', description: '点击位置的 X 坐标' },
            y: { type: 'number', description: '点击位置的 Y 坐标' },
          },
          required: ['x', 'y'],
        },
      },
    },
    handler: handleDesktopClick,
  });

  // desktop:type
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop:type',
        description: '在当前焦点位置输入文本。可选是否在输入后按回车键。',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '要输入的文本内容' },
            submit: { type: 'boolean', description: '是否在输入后按回车键（默认 false）', default: false },
          },
          required: ['text'],
        },
      },
    },
    handler: handleDesktopType,
  });

  // desktop:key_press
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop:key_press',
        description: '按下键盘快捷键组合（如 "cmd,shift,t"）。可选指定目标应用。',
        parameters: {
          type: 'object',
          properties: {
            keys: { type: 'string', description: '按键组合，用逗号分隔（如 "cmd,shift,t" 或 "cmd,v"）' },
            app: { type: 'string', description: '可选，目标应用名称（如 "Safari"）' },
          },
          required: ['keys'],
        },
      },
    },
    handler: handleDesktopKeyPress,
  });

  // desktop:app_launch
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop:app_launch',
        description: '启动 macOS 应用。可选同时打开指定 URL（适用于浏览器等应用）。',
        parameters: {
          type: 'object',
          properties: {
            app: { type: 'string', description: '应用名称（如 "Safari"、"Terminal"、"Visual Studio Code"）' },
            url: { type: 'string', description: '可选，启动时同时打开的 URL' },
          },
          required: ['app'],
        },
      },
    },
    handler: handleDesktopAppLaunch,
  });

  // desktop:app_quit
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop:app_quit',
        description: '退出指定的 macOS 应用。',
        parameters: {
          type: 'object',
          properties: {
            app: { type: 'string', description: '要退出的应用名称（如 "Safari"）' },
          },
          required: ['app'],
        },
      },
    },
    handler: handleDesktopAppQuit,
  });

  // desktop:window_focus
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop:window_focus',
        description: '聚焦到指定应用的窗口。可选指定窗口标题。',
        parameters: {
          type: 'object',
          properties: {
            app: { type: 'string', description: '目标应用名称（如 "Safari"）' },
            window_title: { type: 'string', description: '可选，窗口标题（用于区分同一应用的多个窗口）' },
          },
          required: ['app'],
        },
      },
    },
    handler: handleDesktopWindowFocus,
  });

  // desktop:clipboard
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop:clipboard',
        description: '读取或设置系统剪贴板内容。action 可选 "get"（读取）或 "set"（设置）。',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get', 'set'], description: '操作类型：get（读取）或 set（设置）', default: 'get' },
            content: { type: 'string', description: '当 action 为 "set" 时，要设置到剪贴板的文本内容' },
          },
          required: [],
        },
      },
    },
    handler: handleDesktopClipboard,
  });

  // desktop:scroll
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop:scroll',
        description: '在指定坐标位置滚动鼠标滚轮。amount 为正数向下滚动，负数向上滚动。',
        parameters: {
          type: 'object',
          properties: {
            x: { type: 'number', description: '滚动位置的 X 坐标（默认 0）', default: 0 },
            y: { type: 'number', description: '滚动位置的 Y 坐标（默认 0）', default: 0 },
            amount: { type: 'number', description: '滚动量（像素），正数向下，负数向上（默认 100）', default: 100 },
          },
          required: [],
        },
      },
    },
    handler: handleDesktopScroll,
  });

  // desktop:see
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop:see',
        description: '截取当前屏幕截图并返回 base64 图片。用于 AI 视觉分析屏幕内容，识别可点击元素、文本框、菜单等，然后决定下一步操作（如点击坐标、输入文本等）。',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    handler: handleDesktopSee,
  });

  // app:setBotName — 修改 AI 助手显示名称
  registerTool({
    definition: {
      type: 'function',
      function: {
        name: 'app:setBotName',
        description: '修改 AI 助手的显示名称。当用户要求修改 AI 助手的名字、称呼时调用此工具。',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '新的 AI 助手名称' },
          },
          required: ['name'],
        },
      },
    },
    handler: async (args) => {
      const name = String(args.name || '').trim();
      if (!name) return JSON.stringify({ success: false, error: '名称不能为空' });
      if (name.length > 20) return JSON.stringify({ success: false, error: '名称不能超过 20 个字符' });
      return JSON.stringify({ success: true, action: 'set_bot_name', name });
    },
  });
}

/** 获取所有已注册工具的 definitions（用于传给 LLM） */
export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(registry.values()).map(t => t.definition);
}

/** 执行单个 tool call */
export async function executeToolCall(toolCall: ToolCall): Promise<string> {
  const tool = registry.get(toolCall.function.name);
  if (!tool) {
    return JSON.stringify({ error: `未知工具: ${toolCall.function.name}` });
  }

  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    return JSON.stringify({ error: `工具参数解析失败: ${toolCall.function.arguments}` });
  }

  try {
    return await tool.handler(args);
  } catch (e) {
    return JSON.stringify({ error: `工具执行失败: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 检查工具是否存在 */
export function hasTool(name: string): boolean {
  return registry.has(name);
}

/** 获取工具列表（调试用） */
export function listTools(): string[] {
  return Array.from(registry.keys());
}
