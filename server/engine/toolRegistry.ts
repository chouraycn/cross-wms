/**
 * Tool Registry — 内置本地工具注册表核心
 *
 * 此文件仅管理**内置本地工具**（system.* / file.* / db.* / wms.* / desktop.* / web.* 等）。
 * MCP 工具通过 mcpClientManager 独立管理，不在此注册表中。
 * Plugin 工具通过 registerPluginTool() 动态注册到此注册表（Plugin 算内置本地扩展）。
 *
 * 架构分工：
 * - [内置本地工具] → 通过 toolRegistry.executeToolCall() 直接执行
 * - [外部第三方工具] → 统一走 MCP 协议（mcpClientManager.executeMcpTool()）
 *
 * v1.9.0: 新增 Tool Calling 支持
 * v2.0.0: 新增 desktop:* 命名空间，支持 macOS 桌面自动化
 * v2.1.0: 迁移到 macOS 原生工具（screencapture, osascript, open, pbcopy, pbpaste）
 * v2.2.0: 新增 Linux 支持（import/scrot 截图, xdotool 点击/输入, xclip 剪贴板）
 */

import type { ToolDefinition, ToolCall } from '../aiClient.js';
import { isMcpToolName } from './mcpTypes.js';
import { handleWebSearch, handleWebFetch, handleWebApiCall } from './webTools.js';
import { handleWebSearchV3, getWebSearchToolDefinition } from './web-search-new.js';
import { handleWebFetchV3, getWebFetchToolDefinition } from './web-fetch.js';
import { logger } from '../logger.js';
import { initWebProviders } from '../plugins/providers/index.js';
import { initContentExtractors } from '../plugins/extractors/index.js';

import { ToolHandler, type RegisteredTool } from './toolTypes.js';
export type { ToolHandler, RegisteredTool } from './toolTypes.js';

import { handleSystemInfo } from './systemTools.js';
import { handleListDir, handleReadFile, handleWriteFile, handleExecCommand } from './fileTools.js';
import { handleDbQuery, handleWmsInventory } from './dbTools.js';
import { handleDesktopHealth } from './desktop/helpers.js';
import { handleDesktopClick, handleDesktopType, handleDesktopKeyPress, handleDesktopScroll } from './desktop/inputTools.js';
import { handleDesktopAppLaunch, handleDesktopAppQuit, handleDesktopWindowFocus } from './desktop/appTools.js';
import { handleDesktopScreenshot, handleDesktopSee, handleDesktopSnapshot, handleDesktopFind, handleDesktopClickSmart } from './desktop/visionTools.js';
import { handleDesktopClipboard } from './desktop/clipboardTools.js';
import { handleAppSetBotName } from './appTools.js';

// ===================== 内置工具注册表 =====================

const builtinRegistry = new Map<string, RegisteredTool>();

function registerBuiltinTool(tool: RegisteredTool): void {
  builtinRegistry.set(tool.definition.function.name, tool);
}

/** 初始化默认工具集（内置本地工具） */
export async function initDefaultTools(): Promise<void> {
  // 初始化 Web Provider 和内容提取器插件系统
  initWebProviders();
  initContentExtractors();
  logger.debug('[Tool Registry] Web providers and content extractors initialized');

  // system_info
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'system_info',
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

  // file_listDir
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'file_listDir',
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

  // file_readFile
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'file_readFile',
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

  // file_writeFile
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'file_writeFile',
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

  // shell_exec
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'shell_exec',
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

  // db_query
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'db_query',
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

  // wms_inventory
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'wms_inventory',
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

  // desktop_health
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_health',
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

  // desktop_screenshot
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_screenshot',
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

  // desktop_click
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_click',
        description: '点击桌面 UI 元素或坐标。三种定位方式：1) ref（来自 desktop_snapshot，最精确）2) nx/ny 归一化坐标（0.0~1.0，分辨率无关，推荐用于截图后点击）3) x/y 绝对坐标。优先级：ref > nx/ny > x/y。',
        parameters: {
          type: 'object',
          properties: {
            ref: { type: 'string', description: '元素引用 ID（如 "d1"、"d2"），来自 desktop_snapshot。优先级最高。' },
            nx: { type: 'number', description: '归一化 X 坐标（0.0~1.0），基于屏幕宽度自动转换。分辨率无关，推荐用于截图后点击。' },
            ny: { type: 'number', description: '归一化 Y 坐标（0.0~1.0），基于屏幕高度自动转换。分辨率无关，推荐用于截图后点击。' },
            x: { type: 'number', description: '点击位置的绝对 X 坐标（像素）。当不使用 ref 或 nx/ny 时使用。' },
            y: { type: 'number', description: '点击位置的绝对 Y 坐标（像素）。当不使用 ref 或 nx/ny 时使用。' },
          },
          required: [],
        },
      },
    },
    handler: handleDesktopClick,
  });

  // desktop_type
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_type',
        description: '在指定 UI 元素（ref）或当前焦点位置输入文本。使用 ref 时会先点击元素聚焦再输入。可选输入后按回车。',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '要输入的文本内容' },
            ref: { type: 'string', description: '目标元素引用 ID（如 "d3"），来自 desktop_snapshot。提供 ref 时先聚焦元素再输入。' },
            submit: { type: 'boolean', description: '是否在输入后按回车键（默认 false）', default: false },
          },
          required: ['text'],
        },
      },
    },
    handler: handleDesktopType,
  });

  // desktop_key_press
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_key_press',
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

  // desktop_app_launch
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_app_launch',
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

  // desktop_app_quit
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_app_quit',
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

  // desktop_window_focus
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_window_focus',
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

  // desktop_clipboard
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_clipboard',
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

  // desktop_scroll
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_scroll',
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

  // desktop_see
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_see',
        description: '截取当前屏幕截图并返回 base64 图片及屏幕分辨率。用于 AI 视觉分析屏幕内容，识别可点击元素、文本框、菜单等。返回的 screenWidth/screenHeight 用于归一化坐标转换。点击时推荐使用 desktop_click(nx, ny) 归一化坐标或 desktop_click_smart(description) 语义点击，避免分辨率变化导致坐标偏移。',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    handler: handleDesktopSee,
  });

  // desktop_snapshot — 获取前台应用 UI 元素树（基于 macOS Accessibility API）
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_snapshot',
        description: '获取当前前台应用的 UI 元素树，返回结构化元素列表（含 ref、role、name、bounds）。类似于浏览器端的 accessibility snapshot。调用后可用 ref (d1, d2, ...) 通过 desktop_click(ref) 或 desktop_type(ref) 精确操作元素，无需依赖坐标。推荐在桌面自动化前先调用此工具获取元素列表。',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    handler: handleDesktopSnapshot,
  });

  // desktop_find — 从缓存快照中搜索元素
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_find',
        description: '在 desktop_snapshot 缓存的元素列表中按 role 或 name 模糊搜索。返回匹配的元素及其 ref。用于在大量元素中快速定位目标。',
        parameters: {
          type: 'object',
          properties: {
            role: { type: 'string', description: '元素角色关键词（模糊匹配，如 "button"、"text"）' },
            name: { type: 'string', description: '元素名称关键词（模糊匹配，如 "登录"、"搜索"）' },
          },
          required: [],
        },
      },
    },
    handler: handleDesktopFind,
  });

  // desktop_click_smart — 语义点击（ONNX embedding 匹配 UI 元素）
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'desktop_click_smart',
        description: '语义点击：用自然语言描述要点击的元素（如"提交按钮"、"搜索框"、"取消"），自动获取 UI 元素快照并用 ONNX 语义匹配找到最佳元素后点击。分辨率无关，无需提供坐标。如果匹配失败会返回候选元素列表。',
        parameters: {
          type: 'object',
          properties: {
            description: { type: 'string', description: '要点击的元素的自然语言描述（如"提交按钮"、"搜索输入框"、"关闭"）' },
            auto_snapshot: { type: 'boolean', description: '是否自动刷新 UI 快照（默认 true）。设为 false 可复用上次快照缓存。', default: true },
          },
          required: ['description'],
        },
      },
    },
    handler: handleDesktopClickSmart,
  });

  // app_setBotName — 修改 AI 助手显示名称
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'app_setBotName',
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
    handler: handleAppSetBotName,
  });

  // ===================== Web Tools =====================

  // web_search_legacy — 旧版搜索工具（已弃用，保留用于向后兼容）
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'web_search_legacy',
        description: '[LEGACY] 旧版搜索工具（DuckDuckGo HTML 解析）。已被 web_search 替代，新工具支持 15+ 搜索 Provider、智能缓存、更好的错误处理。仅用于向后兼容。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
            maxResults: { type: 'number', description: '最大结果数（默认 8，最大 20）' },
            renderJs: { type: 'boolean', description: '是否使用 JS 渲染搜索页面（适用于动态渲染的搜索引擎，默认 false）' },
          },
          required: ['query'],
        },
      },
    },
    handler: handleWebSearch,
  });

  // web_search — 新版搜索（Provider 插件系统 + 15+ Provider + 回退链 + 缓存）
  const webSearchV2Def = getWebSearchToolDefinition();
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'web_search',
        description: webSearchV2Def.function.description,
        parameters: webSearchV2Def.function.parameters,
      },
    },
    handler: handleWebSearchV3,
  });

  // web_fetch_legacy — 旧版抓取工具（已弃用，保留用于向后兼容）
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'web_fetch_legacy',
        description: '[LEGACY] 旧版抓取工具（正则表达式转换）。已被 web_fetch 替代，新工具支持 Readability 正文提取、SSRF 安全防护、多 Provider 回退、高质量 Markdown 转换。仅用于向后兼容。',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: '要抓取的网页 URL（支持 http/https）' },
            maxLength: { type: 'number', description: '最大返回内容长度（字节，默认 80000，最大 200000）' },
            renderJs: { type: 'boolean', description: '是否使用 Playwright JS 渲染（适用于 SPA/动态页面，默认 false）' },
            selector: { type: 'string', description: 'CSS 选择器，renderJs=true 时等待该元素出现在页面上再提取内容' },
            waitUntil: { type: 'string', enum: ['domcontentloaded', 'networkidle', 'load'], description: 'renderJs=true 时的页面加载等待策略' },
            executeJs: { type: 'string', description: 'renderJs=true 时在页面上执行的 JavaScript 代码' },
          },
          required: ['url'],
        },
      },
    },
    handler: handleWebFetch,
  });

  // web_fetch — 新版抓取（Provider 插件系统 + SSRF 防护 + Readability 内容提取 + 缓存）
  const webFetchV2Def = getWebFetchToolDefinition();
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'web_fetch',
        description: webFetchV2Def.function.description,
        parameters: webFetchV2Def.function.parameters,
      },
    },
    handler: handleWebFetchV3,
  });

  // web_api_call — 调用外部 REST API（域名白名单）/ API 模板（保留向后兼容）
  registerBuiltinTool({
    definition: {
      type: 'function',
      function: {
        name: 'web_api_call',
        description: '调用外部 REST API 或 API 模板。支持两种模式：(1) 直接调用：传入 url、method、headers、body；(2) 模板调用：传入 templateId 和 variables，使用预配置的 API 模板执行。仅允许白名单内的域名。renderJs=true 时对 HTML 响应使用 Playwright 渲染。',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'API 端点 URL（必须匹配白名单域名，直接调用模式必填）' },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], description: 'HTTP 方法（默认 GET）' },
            headers: { type: 'object', description: '自定义请求头（可选）' },
            body: { type: 'string', description: '请求体（可选，用于 POST/PUT）' },
            templateId: { type: 'string', description: 'API 模板 ID（模板调用模式，与 url 二选一）' },
            variables: { type: 'object', description: '模板变量映射（模板调用模式使用，key-value 对）' },
            renderJs: { type: 'boolean', description: '是否对 HTML 响应使用 Playwright JS 渲染（默认 false）' },
          },
        },
      },
    },
    handler: handleWebApiCall,
  });

  // v3.0: Browser 工具注册 (5 tools)
  try {
    const { getBrowserToolDefinitions, getBrowserToolHandlers } = await import('./browserTools.js');
    const browserDefs = getBrowserToolDefinitions();
    const browserHandlers = getBrowserToolHandlers();
    for (const def of browserDefs) {
      const handler = browserHandlers.get(def.function.name);
      if (handler) {
        registerBuiltinTool({ definition: def, handler });
      }
    }
    logger.debug('[Tool Registry] Browser tools registered:', browserDefs.map(d => d.function.name).join(', '));
  } catch (err) {
    // Playwright 可能未安装，优雅降级
    logger.warn('[Tool Registry] Browser tools not registered (playwright may not be installed):', err instanceof Error ? err.message : String(err));
  }

  // v3.0: Webhook 工具注册
  try {
    const { getWebhookToolDefinitions, getWebhookToolHandlers } = await import('./webhookTools.js');
    const whDefs = getWebhookToolDefinitions();
    const whHandlers = getWebhookToolHandlers();
    for (const def of whDefs) {
      const handler = whHandlers.get(def.function.name);
      if (handler) registerBuiltinTool({ definition: def, handler });
    }
    logger.debug('[Tool Registry] Webhook tools registered:', whDefs.map(d => d.function.name).join(', '));
  } catch (err) {
    logger.warn('[Tool Registry] Webhook tools not registered:', err instanceof Error ? err.message : String(err));
  }
}

/** 获取所有已注册内置工具的 definitions（用于传给 LLM） */
export function getBuiltinToolDefinitions(): ToolDefinition[] {
  return Array.from(builtinRegistry.values()).map(t => t.definition);
}

/** @deprecated 使用 getBuiltinToolDefinitions 替代 */
export function getToolDefinitions(): ToolDefinition[] {
  return getBuiltinToolDefinitions();
}

/** 执行单个内置 tool call（断言：MCP 工具不应路由到此处） */
export async function executeToolCall(toolCall: ToolCall): Promise<string> {
  // 断言：MCP 工具不应路由到此处，应通过 mcpClientManager 执行
  if (isMcpToolName(toolCall.function.name)) {
    throw new Error(`内部错误: MCP 工具 '${toolCall.function.name}' 被错误路由到 toolRegistry，应通过 mcpClientManager 执行。`);
  }

  const tool = builtinRegistry.get(toolCall.function.name);
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

/** 检查内置工具是否存在 */
export function hasTool(name: string): boolean {
  return builtinRegistry.has(name);
}

/** 获取内置工具列表（调试用） */
export function listTools(): string[] {
  return Array.from(builtinRegistry.keys());
}

// ===================== Plugin Tool 动态注册（v3.0） =====================

/**
 * 注册 Plugin 工具（动态注册到内置注册表，Plugin 算内置本地扩展）。
 * 返回 unregister 函数，可用于清理。
 */
export function registerPluginTool(
  name: string,
  definition: ToolDefinition,
  handler: ToolHandler
): () => void {
  const tool: RegisteredTool = { definition, handler };
  builtinRegistry.set(name, tool);
  return () => { builtinRegistry.delete(name); };
}

/**
 * 注销 Plugin 工具。
 */
export function unregisterPluginTool(name: string): boolean {
  return builtinRegistry.delete(name);
}

/**
 * 列出所有 Plugin 工具名（以 plugin_ 前缀的）。
 */
export function listPluginTools(): string[] {
  return Array.from(builtinRegistry.keys()).filter(name => name.startsWith('plugin_'));
}
