/**
 * Plugins Gateway Methods — 插件 UI 描述符与会话动作 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw server/engine/gateway/server-methods/plugin-host-hooks.ts
 * - 适配 cross-wms 的 GatewayMethodHandler 签名（params, ctx）=> result
 * - 接入 server/engine/plugins/runtime.ts 的 getActivePluginRegistry()
 * - plugins.uiDescriptors：返回已注册插件的控制 UI 描述符列表
 * - plugins.sessionAction：查找并调用插件声明的会话动作
 *
 * 注意：cross-wms 的 GatewayMethodContext 不携带 WS 客户端 scopes，
 * 因此本精简版跳过 openclaw 的 scope 鉴权（由调用方在传输层保障）。
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { getActivePluginRegistry } from '../engine/plugins/runtime.js';
import { isPluginJsonValue } from '../engine/plugins/host-hooks.js';
import { logger } from '../logger.js';

type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// ==================== Plugins UI Descriptors ====================

async function pluginsUiDescriptors(_params: unknown, _ctx: GatewayMethodContext) {
  const registry = getActivePluginRegistry();
  const entries = (registry?.controlUiDescriptors ?? []) as Array<{
    pluginId: string;
    pluginName?: string;
    descriptor: {
      id: string;
      surface?: string;
      label?: string;
      description?: string;
      placement?: unknown;
      schema?: unknown;
      requiredScopes?: string[];
    };
  }>;

  const descriptors = entries.map((entry) => {
    const descriptor: Record<string, unknown> = {
      id: entry.descriptor.id,
      pluginId: entry.pluginId,
      pluginName: entry.pluginName,
      surface: entry.descriptor.surface,
      label: entry.descriptor.label,
    };
    if (entry.descriptor.description !== undefined) {
      descriptor.description = entry.descriptor.description;
    }
    if (entry.descriptor.placement !== undefined) {
      descriptor.placement = entry.descriptor.placement;
    }
    if (entry.descriptor.schema !== undefined) {
      descriptor.schema = entry.descriptor.schema;
    }
    if (entry.descriptor.requiredScopes !== undefined) {
      descriptor.requiredScopes = entry.descriptor.requiredScopes;
    }
    return descriptor;
  });

  return {
    ok: true,
    descriptors,
    total: descriptors.length,
  };
}

// ==================== Plugins Session Action ====================

async function pluginsSessionAction(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as {
    pluginId?: string;
    actionId?: string;
    sessionKey?: string;
    payload?: unknown;
  };

  const pluginId = typeof p.pluginId === 'string' ? p.pluginId.trim() : '';
  const actionId = typeof p.actionId === 'string' ? p.actionId.trim() : '';
  const sessionKey = typeof p.sessionKey === 'string' ? p.sessionKey.trim() : '';

  if (!pluginId || !actionId) {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'plugins.sessionAction pluginId and actionId must be non-empty',
      },
    };
  }

  const registry = getActivePluginRegistry();
  const pluginLoaded = Boolean(
    (registry?.plugins ?? []).some(
      (plugin: { id: string; status: string }) => plugin.id === pluginId && plugin.status === 'loaded',
    ),
  );

  const registration = (registry?.sessionActions ?? []).find(
    (entry: { pluginId: string; action: { id: string } }) =>
      entry.pluginId === pluginId && entry.action.id === actionId,
  ) as
    | {
        pluginId: string;
        action: {
          id: string;
          requiredScopes?: string[];
          schema?: unknown;
          handler: (args: {
            pluginId: string;
            actionId: string;
            sessionKey?: string;
            payload?: unknown;
            client?: { scopes: string[] };
          }) => Promise<Record<string, unknown> | undefined>;
        };
      }
    | undefined;

  if (!registration || !pluginLoaded) {
    return {
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        message: `unknown plugin session action: ${pluginId}/${actionId}`,
      },
    };
  }

  // 校验 payload 为 JSON 兼容
  if (p.payload !== undefined && !isPluginJsonValue(p.payload)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'plugin session action payload must be JSON-compatible',
      },
    };
  }

  // 注：cross-wms GatewayMethodContext 不携带 scopes，因此跳过 scope 鉴权
  // （openclaw 版本通过 client.connect.scopes 进行细粒度权限控制）
  try {
    const result = await registration.action.handler({
      pluginId,
      actionId,
      ...(sessionKey ? { sessionKey } : {}),
      ...(p.payload !== undefined ? { payload: p.payload } : {}),
      client: { scopes: [] },
    });

    if (result !== undefined && (typeof result !== 'object' || result === null || Array.isArray(result))) {
      return {
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'plugin session action result must be an object',
        },
      };
    }

    // 插件返回 ok:false 视为业务级失败，仍以 RPC 成功返回（保留 error 字段）
    if (result && result.ok === false) {
      return {
        ok: true,
        ok_action: false,
        error: result.error,
        ...(result.code !== undefined ? { code: result.code } : {}),
        ...(result.details !== undefined ? { details: result.details } : {}),
      };
    }

    return {
      ok: true,
      ...(result?.result !== undefined ? { result: result.result } : {}),
      ...(result?.continueAgent !== undefined ? { continueAgent: result.continueAgent } : {}),
      ...(result?.reply !== undefined ? { reply: result.reply } : {}),
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn(
      `[gateway] plugin session action failed plugin=${pluginId} action=${actionId}: ${errMsg}`,
    );
    return {
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'plugin session action failed',
      },
    };
  }
}

/**
 * 注册所有 Plugins 域方法
 */
export function registerPluginsMethods(registry: GatewayMethodRegistry): void {
  registry.register('plugins.uiDescriptors', pluginsUiDescriptors);
  registry.register('plugins.sessionAction', pluginsSessionAction);
}
