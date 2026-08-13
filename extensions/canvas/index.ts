/**
 * Canvas Tool Extension
 *
 * Canvas 控制与 A2UI 渲染表面管理。通过 ExtensionBridge 注册真实可调用工具，
 * Agent 启用本扩展后即可调用以下工具管理 Canvas 渲染表面：
 *   - canvas_create_surface  创建一个渲染表面（名称 + 内容）
 *   - canvas_list_surfaces   列出全部已创建表面
 *   - canvas_get_surface     读取指定表面内容
 *   - canvas_delete_surface  删除指定表面
 *
 * 表面存储在进程内存中（按 host.root 配置分组），适用于成对节点间的 UI 渲染协同。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'canvas',
  name: 'Canvas Tool',
  description: 'Canvas control and A2UI rendering surfaces for paired nodes',
  version: '1.0.0',
  kind: 'tool',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

/** 表面存储：root → Map<name, content> */
interface Surface {
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}
const surfacesByRoot = new Map<string, Map<string, Surface>>();

function getRootStore(root: string): Map<string, Surface> {
  let store = surfacesByRoot.get(root);
  if (!store) {
    store = new Map();
    surfacesByRoot.set(root, store);
  }
  return store;
}

export default class CanvasTool implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Canvas tool extension');

    const cfg = context.config as Record<string, unknown>;
    const hostCfg = (cfg['host'] || {}) as Record<string, unknown>;
    const root = (hostCfg['root'] as string) || '.canvas';
    const liveReload = Boolean(hostCfg['liveReload'] ?? true);

    context.logger.info(`Canvas tool registered with host root: ${root} (liveReload=${liveReload})`);

    // 注册真实可调用工具到 toolRegistry（通过 bridge）
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'canvas_create_surface',
          description: '创建或更新一个 Canvas 渲染表面。表面可用于成对节点间的 A2UI 内容渲染。',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '表面名称（唯一标识）' },
              content: { type: 'string', description: '表面内容（HTML/Markdown/文本）' },
            },
            required: ['name', 'content'],
          },
        },
      },
      async (args) => {
        const name = String(args.name ?? '').trim();
        const content = String(args.content ?? '');
        if (!name) return JSON.stringify({ error: 'name 不能为空' });
        const store = getRootStore(root);
        const now = Date.now();
        const existing = store.get(name);
        const surface: Surface = {
          name,
          content,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        store.set(name, surface);
        return JSON.stringify({
          ok: true,
          surface,
          root,
          action: existing ? 'updated' : 'created',
        });
      },
    );

    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'canvas_list_surfaces',
          description: '列出当前 Canvas root 下全部已创建的渲染表面',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      async () => {
        const store = getRootStore(root);
        const surfaces = Array.from(store.values()).map((s) => ({
          name: s.name,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          contentLength: s.content.length,
        }));
        return JSON.stringify({ ok: true, root, count: surfaces.length, surfaces });
      },
    );

    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'canvas_get_surface',
          description: '读取指定 Canvas 渲染表面的内容',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '表面名称' },
            },
            required: ['name'],
          },
        },
      },
      async (args) => {
        const name = String(args.name ?? '').trim();
        const store = getRootStore(root);
        const surface = store.get(name);
        if (!surface) return JSON.stringify({ error: `表面不存在: ${name}` });
        return JSON.stringify({ ok: true, surface, root });
      },
    );

    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'canvas_delete_surface',
          description: '删除指定的 Canvas 渲染表面',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '表面名称' },
            },
            required: ['name'],
          },
        },
      },
      async (args) => {
        const name = String(args.name ?? '').trim();
        const store = getRootStore(root);
        const existed = store.delete(name);
        return JSON.stringify({ ok: existed, root, name, action: existed ? 'deleted' : 'not_found' });
      },
    );
  }

  unregister(): void {
    // bridge 注册的工具会由 ExtensionLoader 自动注销
    context_logger('Unregistering Canvas tool extension');
  }
}

// 模块级日志兜底（unregister 时 context 不可用）
function context_logger(msg: string): void {
  console.log(`[Canvas] ${msg}`);
}
