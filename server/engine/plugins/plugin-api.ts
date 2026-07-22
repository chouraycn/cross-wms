/**
 * Plugin API — 插件 SDK HTTP API 层
 *
 * 提供 HTTP 路由处理器，封装 SDK 功能为 RESTful API。
 * 与 ./api.ts 互补：
 * - api.ts 是 OpenClaw 移植的 API 层
 * - 本文件是 SDK 层的 API 处理器，调用 plugin-runtime.ts / install-pipeline.ts 等
 *
 * 路由设计：
 * GET    /api/plugins          - 列出插件
 * GET    /api/plugins/:id      - 获取插件详情
 * POST   /api/plugins/install  - 安装插件
 * POST   /api/plugins/:id/toggle - 启用/禁用插件
 * DELETE /api/plugins/:id      - 卸载插件
 * GET    /api/plugins/health   - 健康检查
 * GET    /api/plugins/capabilities - 列出能力提供者
 */

import { logger } from '../../logger.js';
import type { PluginManifest, PluginCapabilityKind } from './types.js';
import type {
  PluginInstallRequest,
  PluginInstallResult,
  PluginToggleRequest,
  PluginHealthResponse,
  PluginListQuery,
  PluginSdkErrorResponse,
} from './plugin-types.js';
import {
  toSdkErrorResponse,
} from './plugin-types.js';
import {
  PluginSdkError,
  PluginInstallError,
  toPluginSdkError,
} from './plugin-errors.js';
import {
  DEFAULT_LIST_PAGE_SIZE,
  MAX_LIST_PAGE_SIZE,
} from './plugin-constants.js';
import { capabilityProviderRegistry, healthCheckAllCapabilities } from './capability-provider.js';

// ===================== API 上下文 =====================

/** API 处理上下文 */
export interface PluginApiContext {
  /** 获取运行时（延迟加载以避免循环依赖） */
  getRuntime?: () => {
    list(): Array<{ pluginId: string; manifest: PluginManifest; status: string; capabilities: PluginCapabilityKind[] }>;
    find(pluginId: string): { pluginId: string; manifest: PluginManifest; status: string; capabilities: PluginCapabilityKind[] } | undefined;
    install(manifest: PluginManifest, config?: unknown): Promise<void>;
    activate(pluginId: string): Promise<void>;
    deactivate(pluginId: string): Promise<void>;
    uninstall(pluginId: string): Promise<void>;
    getHealth(): Promise<{ total: number; healthy: number; unhealthy: number; details: unknown[] }>;
  };
}

// ===================== API 处理器 =====================

/** 列出插件 */
export async function handleListPlugins(
  query: PluginListQuery,
  ctx: PluginApiContext,
): Promise<{
  status: number;
  body: { plugins: Array<{ pluginId: string; name: string; version: string; status: string; capabilities: PluginCapabilityKind[] }>; total: number; page: number; pageSize: number } | PluginSdkErrorResponse;
}> {
  try {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(MAX_LIST_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_LIST_PAGE_SIZE));

    if (!ctx.getRuntime) {
      return { status: 200, body: { plugins: [], total: 0, page, pageSize } };
    }

    const runtime = ctx.getRuntime();
    let plugins = runtime.list();

    // 过滤
    if (query.status) {
      plugins = plugins.filter((p) => p.status === query.status);
    }
    if (query.capability) {
      plugins = plugins.filter((p) => p.capabilities.includes(query.capability!));
    }
    if (query.search) {
      const search = query.search.toLowerCase();
      plugins = plugins.filter((p) =>
        p.pluginId.toLowerCase().includes(search) ||
        p.manifest.name.toLowerCase().includes(search) ||
        (p.manifest.description ?? '').toLowerCase().includes(search),
      );
    }

    // 分页
    const total = plugins.length;
    const offset = (page - 1) * pageSize;
    const paged = plugins.slice(offset, offset + pageSize);

    return {
      status: 200,
      body: {
        plugins: paged.map((p) => ({
          pluginId: p.pluginId,
          name: p.manifest.name,
          version: p.manifest.version,
          status: p.status,
          capabilities: p.capabilities,
        })),
        total,
        page,
        pageSize,
      },
    };
  } catch (err) {
    return { status: 500, body: toSdkErrorResponse(toPluginSdkError(err)) };
  }
}

/** 获取插件详情 */
export async function handleGetPlugin(
  pluginId: string,
  ctx: PluginApiContext,
): Promise<{
  status: number;
  body: { plugin?: PluginManifest; status?: string; capabilities?: PluginCapabilityKind[] } | PluginSdkErrorResponse;
}> {
  try {
    if (!ctx.getRuntime) {
      return { status: 404, body: toSdkErrorResponse(new PluginSdkError(`未找到插件: ${pluginId}`, 'PLUGIN_NOT_FOUND', pluginId)) };
    }
    const runtime = ctx.getRuntime();
    const entry = runtime.find(pluginId);
    if (!entry) {
      return { status: 404, body: toSdkErrorResponse(new PluginSdkError(`未找到插件: ${pluginId}`, 'PLUGIN_NOT_FOUND', pluginId)) };
    }
    return {
      status: 200,
      body: {
        plugin: entry.manifest,
        status: entry.status,
        capabilities: entry.capabilities,
      },
    };
  } catch (err) {
    return { status: 500, body: toSdkErrorResponse(toPluginSdkError(err)) };
  }
}

/** 安装插件 */
export async function handleInstallPlugin(
  request: PluginInstallRequest,
  _ctx: PluginApiContext,
): Promise<{ status: number; body: PluginInstallResult | PluginSdkErrorResponse }> {
  try {
    if (!request.sourceUrl) {
      return {
        status: 400,
        body: toSdkErrorResponse(new PluginInstallError('sourceUrl 不能为空', 'validation')),
      };
    }

    // 安装管道由 install-pipeline.ts 处理
    // 这里仅做基本验证，实际安装由调用方传入的 stepHandlers 处理
    logger.info(`[PluginAPI] 安装请求: source=${request.source} url=${request.sourceUrl}`);

    return {
      status: 202,
      body: {
        ok: true,
        warnings: ['安装已提交，请通过 WebSocket 或轮询获取进度'],
      },
    };
  } catch (err) {
    return {
      status: 500,
      body: toSdkErrorResponse(toPluginSdkError(err)),
    };
  }
}

/** 启用/禁用插件 */
export async function handleTogglePlugin(
  request: PluginToggleRequest,
  ctx: PluginApiContext,
): Promise<{ status: number; body: { ok: boolean; pluginId: string; status: string } | PluginSdkErrorResponse }> {
  try {
    if (!request.pluginId) {
      return {
        status: 400,
        body: toSdkErrorResponse(new PluginSdkError('pluginId 不能为空', 'VALIDATION_ERROR')),
      };
    }
    if (!ctx.getRuntime) {
      return { status: 503, body: toSdkErrorResponse(new PluginSdkError('运行时不可用', 'RUNTIME_UNAVAILABLE')) };
    }

    const runtime = ctx.getRuntime();
    const entry = runtime.find(request.pluginId);
    if (!entry) {
      return { status: 404, body: toSdkErrorResponse(new PluginSdkError(`未找到插件: ${request.pluginId}`, 'PLUGIN_NOT_FOUND', request.pluginId)) };
    }

    if (request.enabled) {
      await runtime.activate(request.pluginId);
    } else {
      await runtime.deactivate(request.pluginId);
    }

    return {
      status: 200,
      body: {
        ok: true,
        pluginId: request.pluginId,
        status: request.enabled ? 'enabled' : 'disabled',
      },
    };
  } catch (err) {
    return { status: 500, body: toSdkErrorResponse(toPluginSdkError(err)) };
  }
}

/** 卸载插件 */
export async function handleUninstallPlugin(
  pluginId: string,
  ctx: PluginApiContext,
): Promise<{ status: number; body: { ok: boolean; pluginId: string } | PluginSdkErrorResponse }> {
  try {
    if (!pluginId) {
      return {
        status: 400,
        body: toSdkErrorResponse(new PluginSdkError('pluginId 不能为空', 'VALIDATION_ERROR')),
      };
    }
    if (!ctx.getRuntime) {
      return { status: 503, body: toSdkErrorResponse(new PluginSdkError('运行时不可用', 'RUNTIME_UNAVAILABLE')) };
    }

    const runtime = ctx.getRuntime();
    await runtime.uninstall(pluginId);

    return { status: 200, body: { ok: true, pluginId } };
  } catch (err) {
    return { status: 500, body: toSdkErrorResponse(toPluginSdkError(err)) };
  }
}

/** 健康检查 */
export async function handleHealthCheck(
  ctx: PluginApiContext,
): Promise<{ status: number; body: PluginHealthResponse | PluginSdkErrorResponse }> {
  try {
    if (!ctx.getRuntime) {
      // 仅返回能力提供者的健康状态
      const capResults = await healthCheckAllCapabilities();
      const healthy = capResults.filter((r) => r.ok).length;
      const unhealthy = capResults.filter((r) => !r.ok).length;
      return {
        status: 200,
        body: {
          total: capResults.length,
          enabled: capResults.length,
          healthy,
          unhealthy,
          errorCount: unhealthy,
          plugins: capResults.map((r) => ({
            pluginId: `${r.kind}/${r.providerId}`,
            name: `${r.kind}/${r.providerId}`,
            healthy: r.ok,
            ...(r.error !== undefined ? { lastError: r.error } : {}),
            errorCount: r.ok ? 0 : 1,
          })),
        },
      };
    }

    const runtime = ctx.getRuntime();
    const health = await runtime.getHealth();
    return {
      status: 200,
      body: {
        total: health.total,
        enabled: health.total,
        healthy: health.healthy,
        unhealthy: health.unhealthy,
        errorCount: health.unhealthy,
        plugins: (health.details as PluginHealthResponse['plugins']) ?? [],
      },
    };
  } catch (err) {
    return { status: 500, body: toSdkErrorResponse(toPluginSdkError(err)) };
  }
}

/** 列出能力提供者 */
export async function handleListCapabilities(): Promise<{
  status: number;
  body: Array<{ kind: PluginCapabilityKind; providerId: string; pluginId: string; displayName?: string }>;
}> {
  const all = capabilityProviderRegistry.listAll();
  const result: Array<{ kind: PluginCapabilityKind; providerId: string; pluginId: string; displayName?: string }> = [];
  for (const { kind, entries } of all) {
    for (const entry of entries) {
      const provider = entry.provider as { id: string; displayName?: string };
      result.push({
        kind,
        providerId: provider.id,
        pluginId: entry.pluginId,
        ...(provider.displayName !== undefined ? { displayName: provider.displayName } : {}),
      });
    }
  }
  return { status: 200, body: result };
}

// ===================== 路由注册辅助 =====================

/** API 路由定义 */
export interface PluginApiRoute {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
  path: string;
  handler: string;
  description: string;
}

/** 所有插件 API 路由 */
export const PLUGIN_API_ROUTES: readonly PluginApiRoute[] = [
  { method: 'GET', path: '/api/plugins', handler: 'handleListPlugins', description: '列出插件' },
  { method: 'GET', path: '/api/plugins/:id', handler: 'handleGetPlugin', description: '获取插件详情' },
  { method: 'POST', path: '/api/plugins/install', handler: 'handleInstallPlugin', description: '安装插件' },
  { method: 'POST', path: '/api/plugins/:id/toggle', handler: 'handleTogglePlugin', description: '启用/禁用插件' },
  { method: 'DELETE', path: '/api/plugins/:id', handler: 'handleUninstallPlugin', description: '卸载插件' },
  { method: 'GET', path: '/api/plugins/health', handler: 'handleHealthCheck', description: '健康检查' },
  { method: 'GET', path: '/api/plugins/capabilities', handler: 'handleListCapabilities', description: '列出能力提供者' },
];
