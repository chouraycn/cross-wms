/**
 * Browser Tools — 注册 5 个 browser_* 工具到 toolRegistry
 *
 * v3.0: 通过 browserHostClient IPC 与 BrowserHost 进程通信，
 * 实现 AI 可调用的浏览器自动化工具。
 *
 * 5 个工具:
 *   browser_navigate  — 导航到 URL
 *   browser_snapshot  — 获取页面可访问性快照 (ref + role + name)
 *   browser_click     — 点击元素 (by ref or coordinates)
 *   browser_type      — 输入文本 (by ref or keyboard)
 *   browser_screenshot — 截图 (base64)
 */

import type { ToolDefinition } from '../aiClient.js';
import type { RegisteredTool, ToolHandler } from './toolRegistry.js';
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
};
