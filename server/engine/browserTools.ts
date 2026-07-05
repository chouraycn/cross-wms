/**
 * Browser Tools — 注册 browser_* 工具到 toolRegistry
 *
 * v3.0: 通过 browserHostClient IPC 与 BrowserHost 进程通信，
 * 实现 AI 可调用的浏览器自动化工具。
 *
 * 基础工具:
 *   browser_navigate  — 导航到 URL
 *   browser_snapshot  — 获取页面可访问性快照 (ref + role + name)
 *   browser_click     — 点击元素 (by ref or coordinates)
 *   browser_type      — 输入文本 (by ref or keyboard)
 *   browser_screenshot — 截图 (base64)
 *   browser_execute_js — 在当前页面执行 JavaScript
 *
 * v3.1 增强:
 *   browser_tab_list   — 列出所有标签页
 *   browser_tab_new    — 新建标签页
 *   browser_tab_switch — 切换标签页
 *   browser_tab_close  — 关闭标签页
 *   browser_wait_for   — 等待元素出现或文本匹配
 *
 * v3.2 增强:
 *   browser_cookies      — 获取/设置/删除 Cookie
 *   browser_local_storage — 操作 localStorage
 *   browser_file_upload  — 上传文件到 input[type=file]
 *   browser_download     — 下载文件到本地
 *   browser_screenshot_base64 — 截图并返回 base64（多模态 AI 分析）
 */

import type { ToolDefinition } from '../aiClient.js';
import type { RegisteredTool, ToolHandler } from './toolTypes.js';
import { sendCommand } from '../services/browserHostClient.js';

// ===================== 工具 Schema 定义 =====================

const browserNavigateDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_navigate',
    description: 'Navigate the browser to a URL. Returns the page title and URL after navigation.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to (must start with http:// or https://)',
        },
      },
      required: ['url'],
    },
  },
};

const browserSnapshotDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_snapshot',
    description: 'Take an accessibility snapshot of the current page. Returns a list of interactive elements with ref IDs, roles, and names. Use refs from this snapshot to interact with elements via browser_click or browser_type.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

const browserClickDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_click',
    description: 'Click an element on the page. Provide either a ref ID from a previous snapshot, or x/y coordinates.',
    parameters: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: "Element reference ID from a snapshot (e.g., 'e1', 'e5'). Use browser_snapshot first to get refs.",
        },
        x: {
          type: 'number',
          description: 'X coordinate for coordinate-based clicking (alternative to ref)',
        },
        y: {
          type: 'number',
          description: 'Y coordinate for coordinate-based clicking (alternative to ref)',
        },
      },
    },
  },
};

const browserTypeDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_type',
    description: 'Type text into an element on the page. Provide a ref ID from a snapshot to target a specific input, or omit ref to type with the keyboard.',
    parameters: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: "Element reference ID from a snapshot (e.g., 'e2'). Omit to type with keyboard.",
        },
        text: {
          type: 'string',
          description: 'The text to type',
        },
        clear: {
          type: 'boolean',
          description: 'Whether to clear the existing text before typing (default: true)',
        },
        pressEnter: {
          type: 'boolean',
          description: 'Whether to press Enter after typing (default: false)',
        },
      },
      required: ['text'],
    },
  },
};

const browserScreenshotDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page. Returns a base64-encoded PNG image.',
    parameters: {
      type: 'object',
      properties: {
        fullPage: {
          type: 'boolean',
          description: 'Whether to capture the full page (default: false, viewport only)',
        },
      },
    },
  },
};

const browserExecuteJsDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_execute_js',
    description: 'Execute JavaScript code on the current browser page. Use this to interact with dynamic SPA content, extract data from rendered pages, scroll to load lazy content, click elements programmatically, or read DOM state. Must call browser_navigate first to open a page.',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'JavaScript code to execute on the page. Runs in the page context (has access to document, window, etc.). Must return a value (use `return` statement). Example: "return document.querySelector(\'#content\').innerText"',
        },
        returnHtml: {
          type: 'boolean',
          description: 'Whether to also return the full page HTML after JS execution (default: false)',
        },
      },
      required: ['script'],
    },
  },
};

// ---- v3.1: Tab 管理与等待机制 ----

const browserTabListDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_tab_list',
    description: 'List all open browser tabs. Returns each tab with its index, URL, and title. The currently active tab is marked.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

const browserTabNewDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_tab_new',
    description: 'Open a new browser tab and navigate to the given URL. The new tab becomes the active tab. Omit URL to open a blank tab.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to navigate to in the new tab (must start with http:// or https://). Omit for a blank tab (about:blank).',
        },
      },
    },
  },
};

const browserTabSwitchDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_tab_switch',
    description: 'Switch to a browser tab by its index (from browser_tab_list). The switched tab becomes the active tab for subsequent browser_* calls.',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'number',
          description: 'Index of the tab to switch to (as returned by browser_tab_list)',
        },
      },
      required: ['index'],
    },
  },
};

const browserTabCloseDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_tab_close',
    description: 'Close a browser tab by index. If the active tab is closed, the first remaining tab becomes active. Closes the active tab when index is omitted.',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'number',
          description: 'Index of the tab to close (from browser_tab_list). Omit to close the currently active tab.',
        },
      },
    },
  },
};

const browserWaitForDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_wait_for',
    description: 'Wait for a condition to be met on the current page — an element matching a CSS selector to appear, or specific text to be present in the page body. Useful for SPA navigation, lazy-loaded content, or async UI updates. Returns whether the condition was met before the timeout.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['selector', 'text', 'timeout'],
          description: 'Wait type: "selector" waits for an element matching the CSS selector; "text" waits for text content to appear in the body; "timeout" simply waits for the given duration.',
        },
        value: {
          type: 'string',
          description: 'CSS selector (for type="selector") or text content (for type="text"). Ignored for type="timeout".',
        },
        timeout: {
          type: 'number',
          description: 'Maximum time to wait in milliseconds (default: 5000)',
          default: 5000,
        },
      },
      required: ['type', 'value'],
    },
  },
};

// ---- v3.2: Cookie / Storage / 文件上传下载 / 截图 base64 ----

const browserCookiesDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_cookies',
    description: 'Get, set, or delete browser cookies for the current context. Use action "get" to list all cookies (or filter by name), "set" to add/update a cookie, or "delete" to remove a cookie.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'delete'],
          description: 'Cookie operation: "get" retrieves cookies, "set" adds/updates a cookie, "delete" removes a cookie.',
        },
        name: {
          type: 'string',
          description: 'Cookie name (required for "set" and "delete"; optional for "get" to filter by name).',
        },
        value: {
          type: 'string',
          description: 'Cookie value (required for "set").',
        },
        domain: {
          type: 'string',
          description: 'Cookie domain (optional, e.g. ".example.com").',
        },
        path: {
          type: 'string',
          description: 'Cookie path (default "/").',
        },
      },
      required: ['action'],
    },
  },
};

const browserLocalStorageDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_local_storage',
    description: 'Operate on the browser localStorage of the current page. Use action "get" to read a key, "set" to write a key, "delete" to remove a key, or "clear" to clear all entries.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'delete', 'clear'],
          description: 'localStorage operation: "get" reads a key, "set" writes a key, "delete" removes a key, "clear" clears all entries.',
        },
        key: {
          type: 'string',
          description: 'Key name (required for "get", "set", "delete").',
        },
        value: {
          type: 'string',
          description: 'Value to store (required for "set").',
        },
      },
      required: ['action'],
    },
  },
};

const browserFileUploadDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_file_upload',
    description: 'Upload a local file to an <input type="file"> element on the page. The element is targeted by its ref ID from a previous browser_snapshot. Triggers a change event after setting the files.',
    parameters: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: "Element reference ID from a snapshot (e.g., 'e3'). Must point to an <input type=\"file\"> element.",
        },
        filePath: {
          type: 'string',
          description: 'Absolute path to the local file to upload.',
        },
      },
      required: ['ref', 'filePath'],
    },
  },
};

const browserDownloadDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_download',
    description: 'Download a file from a URL and save it to the local filesystem. The download is performed within the browser context (using the active page session/cookies) when possible, falling back to a direct fetch.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Download URL (must start with http:// or https://).',
        },
        savePath: {
          type: 'string',
          description: 'Absolute path where the downloaded file should be saved.',
        },
        timeout: {
          type: 'number',
          description: 'Download timeout in milliseconds (default: 30000).',
          default: 30000,
        },
      },
      required: ['url', 'savePath'],
    },
  },
};

const browserScreenshotBase64Def: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_screenshot_base64',
    description: 'Take a screenshot of the current page and return the base64-encoded image data directly (suitable for multimodal AI vision analysis). Returns a JPEG image as base64, optionally resized to a maximum width.',
    parameters: {
      type: 'object',
      properties: {
        fullPage: {
          type: 'boolean',
          description: 'Whether to capture the full scrollable page (default: false, viewport only).',
          default: false,
        },
        maxWidth: {
          type: 'number',
          description: 'Maximum image width in pixels. If the screenshot is wider, it will be resized. Default: 1280.',
          default: 1280,
        },
        quality: {
          type: 'number',
          description: 'JPEG quality (1-100). Default: 80.',
          default: 80,
        },
      },
    },
  },
};

// ===================== 工具 Handler 实现 =====================

/**
 * browser_navigate handler
 */
async function handleBrowserNavigate(args: Record<string, unknown>): Promise<string> {
  const response = await sendCommand('browser_navigate', args);
  if (!response.ok) {
    return JSON.stringify({ error: response.error || 'Navigation failed' });
  }
  return JSON.stringify(response.output);
}

/**
 * browser_snapshot handler
 */
async function handleBrowserSnapshot(_args: Record<string, unknown>): Promise<string> {
  const response = await sendCommand('browser_snapshot');
  if (!response.ok) {
    return JSON.stringify({ error: response.error || 'Snapshot failed' });
  }

  const snapshot = response.output;

  // 格式化输出给 AI: 精简版 (元素列表文本)
  if (!snapshot || !snapshot.elements) {
    return JSON.stringify({ error: 'No snapshot data available' });
  }

  // 精简输出: 仅保留关键信息，控制 token 消耗
  const elementsText = snapshot.elements
    .slice(0, 50) // 限制元素数量
    .map((el: any) => {
      let desc = `[${el.ref}] ${el.role}`;
      if (el.name) desc += ` "${el.name}"`;
      if (el.value) desc += ` value="${String(el.value).substring(0, 30)}"`;
      if (el.disabled) desc += ' (disabled)';
      if (el.href) desc += ` href="${el.href.substring(0, 60)}"`;
      return desc;
    })
    .join('\n');

  const result = {
    url: snapshot.url,
    title: snapshot.title,
    elementCount: snapshot.elements.length,
    truncated: snapshot.truncated,
    elements: elementsText,
  };

  return JSON.stringify(result);
}

/**
 * browser_click handler
 * 当使用 ref 点击失败且错误暗示 ref 无效时，添加友好提示
 */
async function handleBrowserClick(args: Record<string, unknown>): Promise<string> {
  const response = await sendCommand('browser_click', args);
  if (!response.ok) {
    let errorMsg = response.error || 'Click failed';
    // 如果提供了 ref 且错误暗示 ref 无效/过期，提示 AI 先获取快照
    if (args.ref && typeof args.ref === 'string') {
      const lowerError = errorMsg.toLowerCase();
      if (lowerError.includes('not found') || lowerError.includes('no element') ||
          lowerError.includes('ref') || lowerError.includes('stale') ||
          lowerError.includes('detached') || lowerError.includes('invalid')) {
        errorMsg += ' — Please run browser_snapshot first to get updated refs.';
      }
    }
    return JSON.stringify({ error: errorMsg });
  }
  return JSON.stringify(response.output);
}

/**
 * browser_type handler
 * 当使用 ref 输入失败且错误暗示 ref 无效时，添加友好提示
 */
async function handleBrowserType(args: Record<string, unknown>): Promise<string> {
  const response = await sendCommand('browser_type', args);
  if (!response.ok) {
    let errorMsg = response.error || 'Type failed';
    // 如果提供了 ref 且错误暗示 ref 无效/过期，提示 AI 先获取快照
    if (args.ref && typeof args.ref === 'string') {
      const lowerError = errorMsg.toLowerCase();
      if (lowerError.includes('not found') || lowerError.includes('no element') ||
          lowerError.includes('ref') || lowerError.includes('stale') ||
          lowerError.includes('detached') || lowerError.includes('invalid')) {
        errorMsg += ' — Please run browser_snapshot first to get updated refs.';
      }
    }
    return JSON.stringify({ error: errorMsg });
  }
  return JSON.stringify(response.output);
}

/**
 * browser_screenshot handler
 */
async function handleBrowserScreenshot(args: Record<string, unknown>): Promise<string> {
  const response = await sendCommand('browser_screenshot', args);
  if (!response.ok) {
    return JSON.stringify({ error: response.error || 'Screenshot failed' });
  }
  // 截图太大不适合返回到 AI 对话，返回摘要
  const output = response.output;
  return JSON.stringify({
    success: true,
    mimeType: output.mimeType,
    sizeBytes: output.size,
    sizeKB: Math.round(output.size / 1024),
    message: `Screenshot captured (${Math.round(output.size / 1024)}KB PNG). Image available for display.`,
  });
}

/**
 * browser_execute_js handler
 * v1.5.131: 在当前页面上执行 JavaScript
 */
async function handleBrowserExecuteJs(args: Record<string, unknown>): Promise<string> {
  const { executeJs } = await import('../services/browserHostClient.js');
  const result = await executeJs({
    script: String(args.script || ''),
    returnHtml: args.returnHtml === true,
  });
  if (!result.ok) {
    return JSON.stringify({ error: result.error || 'JS execution failed' });
  }
  return JSON.stringify({
    success: true,
    result: result.result,
    url: result.url,
    ...(result.html ? { htmlLength: result.html.length } : {}),
  });
}

/**
 * browser_tab_list handler
 * v3.1: 列出所有打开的标签页
 */
async function handleBrowserTabList(_args: Record<string, unknown>): Promise<string> {
  const response = await sendCommand('browser_tab_list');
  if (!response.ok) {
    return JSON.stringify({ error: response.error || 'Tab list failed' });
  }
  return JSON.stringify(response.output);
}

/**
 * browser_tab_new handler
 * v3.1: 新建标签页并可选导航到 URL
 */
async function handleBrowserTabNew(args: Record<string, unknown>): Promise<string> {
  const response = await sendCommand('browser_tab_new', args);
  if (!response.ok) {
    return JSON.stringify({ error: response.error || 'Tab new failed' });
  }
  return JSON.stringify(response.output);
}

/**
 * browser_tab_switch handler
 * v3.1: 切换到指定索引的标签页
 */
async function handleBrowserTabSwitch(args: Record<string, unknown>): Promise<string> {
  if (args.index === undefined || args.index === null || typeof args.index !== 'number') {
    return JSON.stringify({ error: 'index parameter is required (must be a number)' });
  }
  const response = await sendCommand('browser_tab_switch', args);
  if (!response.ok) {
    return JSON.stringify({ error: response.error || 'Tab switch failed' });
  }
  return JSON.stringify(response.output);
}

/**
 * browser_tab_close handler
 * v3.1: 关闭指定标签页（默认关闭当前活跃标签页）
 */
async function handleBrowserTabClose(args: Record<string, unknown>): Promise<string> {
  const response = await sendCommand('browser_tab_close', args);
  if (!response.ok) {
    return JSON.stringify({ error: response.error || 'Tab close failed' });
  }
  return JSON.stringify(response.output);
}

/**
 * browser_wait_for handler
 * v3.1: 等待元素出现、文本匹配或简单超时
 */
async function handleBrowserWaitFor(args: Record<string, unknown>): Promise<string> {
  const type = String(args.type || '');
  if (!type) {
    return JSON.stringify({ error: 'type parameter is required (selector | text | timeout)' });
  }
  if (type !== 'timeout' && (args.value === undefined || args.value === null)) {
    return JSON.stringify({ error: 'value parameter is required for type="selector" or "text"' });
  }
  const response = await sendCommand('browser_wait_for', {
    type,
    value: args.value !== undefined ? String(args.value) : '',
    timeout: typeof args.timeout === 'number' ? args.timeout : 5000,
  });
  if (!response.ok) {
    return JSON.stringify({ error: response.error || 'Wait failed' });
  }
  return JSON.stringify(response.output);
}

/**
 * browser_cookies handler
 * v3.2: 获取/设置/删除 Cookie
 */
async function handleBrowserCookies(args: Record<string, unknown>): Promise<string> {
  const action = String(args.action || '');
  if (!action) {
    return JSON.stringify({ error: 'action parameter is required (get | set | delete)' });
  }
  if (!['get', 'set', 'delete'].includes(action)) {
    return JSON.stringify({ error: `Invalid action: ${action} (expected get | set | delete)` });
  }
  if (action === 'set') {
    if (!args.name || typeof args.name !== 'string') {
      return JSON.stringify({ error: 'name parameter is required for action="set"' });
    }
    if (args.value === undefined || args.value === null) {
      return JSON.stringify({ error: 'value parameter is required for action="set"' });
    }
  }
  if (action === 'delete') {
    if (!args.name || typeof args.name !== 'string') {
      return JSON.stringify({ error: 'name parameter is required for action="delete"' });
    }
  }
  const response = await sendCommand('browser_cookies', {
    action,
    ...(args.name !== undefined ? { name: String(args.name) } : {}),
    ...(args.value !== undefined ? { value: String(args.value) } : {}),
    ...(args.domain !== undefined ? { domain: String(args.domain) } : {}),
    ...(args.path !== undefined ? { path: String(args.path) } : {}),
  });
  if (!response.ok) {
    return JSON.stringify({ error: response.error || 'Cookies operation failed' });
  }
  return JSON.stringify(response.output);
}

/**
 * browser_local_storage handler
 * v3.2: 操作 localStorage
 */
async function handleBrowserLocalStorage(args: Record<string, unknown>): Promise<string> {
  const action = String(args.action || '');
  if (!action) {
    return JSON.stringify({ error: 'action parameter is required (get | set | delete | clear)' });
  }
  if (!['get', 'set', 'delete', 'clear'].includes(action)) {
    return JSON.stringify({ error: `Invalid action: ${action} (expected get | set | delete | clear)` });
  }
  if (action !== 'clear') {
    if (!args.key || typeof args.key !== 'string') {
      return JSON.stringify({ error: `key parameter is required for action="${action}"` });
    }
  }
  if (action === 'set') {
    if (args.value === undefined || args.value === null) {
      return JSON.stringify({ error: 'value parameter is required for action="set"' });
    }
  }
  const response = await sendCommand('browser_local_storage', {
    action,
    ...(args.key !== undefined ? { key: String(args.key) } : {}),
    ...(args.value !== undefined ? { value: String(args.value) } : {}),
  });
  if (!response.ok) {
    return JSON.stringify({ error: response.error || 'localStorage operation failed' });
  }
  return JSON.stringify(response.output);
}

/**
 * browser_file_upload handler
 * v3.2: 上传文件到 input[type=file]
 */
async function handleBrowserFileUpload(args: Record<string, unknown>): Promise<string> {
  const ref = args.ref;
  const filePath = args.filePath;
  if (!ref || typeof ref !== 'string') {
    return JSON.stringify({ error: 'ref parameter is required (string from snapshot)' });
  }
  if (!filePath || typeof filePath !== 'string') {
    return JSON.stringify({ error: 'filePath parameter is required (absolute local file path)' });
  }
  const response = await sendCommand('browser_file_upload', { ref, filePath });
  if (!response.ok) {
    let errorMsg = response.error || 'File upload failed';
    const lowerError = errorMsg.toLowerCase();
    if (lowerError.includes('not found') || lowerError.includes('no element') ||
        lowerError.includes('ref') || lowerError.includes('stale') ||
        lowerError.includes('detached') || lowerError.includes('invalid')) {
      errorMsg += ' — Please run browser_snapshot first to get updated refs.';
    }
    return JSON.stringify({ error: errorMsg });
  }
  return JSON.stringify(response.output);
}

/**
 * browser_download handler
 * v3.2: 下载文件到本地路径
 */
async function handleBrowserDownload(args: Record<string, unknown>): Promise<string> {
  const url = args.url;
  const savePath = args.savePath;
  if (!url || typeof url !== 'string') {
    return JSON.stringify({ error: 'url parameter is required (must start with http/https)' });
  }
  if (!savePath || typeof savePath !== 'string') {
    return JSON.stringify({ error: 'savePath parameter is required (absolute local path)' });
  }
  const response = await sendCommand('browser_download', {
    url,
    savePath,
    timeout: typeof args.timeout === 'number' ? args.timeout : 30000,
  });
  if (!response.ok) {
    return JSON.stringify({ error: response.error || 'Download failed' });
  }
  return JSON.stringify(response.output);
}

/**
 * browser_screenshot_base64 handler
 * v3.2: 截图并返回 base64（用于多模态 AI 分析）
 */
async function handleBrowserScreenshotBase64(args: Record<string, unknown>): Promise<string> {
  const response = await sendCommand('browser_screenshot_base64', {
    fullPage: args.fullPage === true,
    maxWidth: typeof args.maxWidth === 'number' ? args.maxWidth : 1280,
    quality: typeof args.quality === 'number' ? args.quality : 80,
  });
  if (!response.ok) {
    return JSON.stringify({ error: response.error || 'Screenshot failed' });
  }
  // 返回包含 base64 数据的完整结构，供多模态 AI 直接消费
  const output = response.output;
  return JSON.stringify({
    success: true,
    mimeType: output.mimeType,
    base64: output.base64,
    sizeBytes: output.size,
    sizeKB: Math.round(output.size / 1024),
    width: output.width,
    height: output.height,
  });
}

// ===================== 注册接口 =====================

/**
 * 获取所有 browser_* 工具的定义
 * 供 toolRegistry.ts 调用注册
 */
export function getBrowserToolDefinitions(): ToolDefinition[] {
  return [
    browserNavigateDef,
    browserSnapshotDef,
    browserClickDef,
    browserTypeDef,
    browserScreenshotDef,
    browserExecuteJsDef,
    // v3.1: Tab 管理与等待机制
    browserTabListDef,
    browserTabNewDef,
    browserTabSwitchDef,
    browserTabCloseDef,
    browserWaitForDef,
    // v3.2: Cookie / Storage / 文件上传下载 / 截图 base64
    browserCookiesDef,
    browserLocalStorageDef,
    browserFileUploadDef,
    browserDownloadDef,
    browserScreenshotBase64Def,
  ];
}

/**
 * 获取所有 browser_* 工具的 handler 映射
 * key = tool name, value = handler function
 */
export function getBrowserToolHandlers(): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  handlers.set('browser_navigate', handleBrowserNavigate);
  handlers.set('browser_snapshot', handleBrowserSnapshot);
  handlers.set('browser_click', handleBrowserClick);
  handlers.set('browser_type', handleBrowserType);
  handlers.set('browser_screenshot', handleBrowserScreenshot);
  handlers.set('browser_execute_js', handleBrowserExecuteJs);
  // v3.1: Tab 管理与等待机制
  handlers.set('browser_tab_list', handleBrowserTabList);
  handlers.set('browser_tab_new', handleBrowserTabNew);
  handlers.set('browser_tab_switch', handleBrowserTabSwitch);
  handlers.set('browser_tab_close', handleBrowserTabClose);
  handlers.set('browser_wait_for', handleBrowserWaitFor);
  // v3.2: Cookie / Storage / 文件上传下载 / 截图 base64
  handlers.set('browser_cookies', handleBrowserCookies);
  handlers.set('browser_local_storage', handleBrowserLocalStorage);
  handlers.set('browser_file_upload', handleBrowserFileUpload);
  handlers.set('browser_download', handleBrowserDownload);
  handlers.set('browser_screenshot_base64', handleBrowserScreenshotBase64);
  return handlers;
}

/**
 * Browser 工具的风险等级
 * 默认 'confirm' — 浏览器操作需要用户确认
 */
export const BROWSER_TOOL_RISK_LEVELS: Record<string, 'auto' | 'confirm' | 'high-risk'> = {
  browser_navigate: 'confirm',
  browser_snapshot: 'auto',
  browser_click: 'confirm',
  browser_type: 'confirm',
  browser_screenshot: 'auto',
  browser_execute_js: 'confirm',  // v1.5.131: JS 执行可能修改页面，需确认
  // v3.1: Tab 管理 & 等待机制
  browser_tab_list: 'auto',
  browser_tab_new: 'confirm',
  browser_tab_switch: 'auto',
  browser_tab_close: 'confirm',
  browser_wait_for: 'auto',
  // v3.2: Cookie / Storage / 文件上传下载 / 截图 base64
  browser_cookies: 'confirm',
  browser_local_storage: 'confirm',
  browser_file_upload: 'high-risk',      // 上传文件可能涉及敏感数据
  browser_download: 'high-risk',          // 下载文件到本地文件系统
  browser_screenshot_base64: 'auto',
};
