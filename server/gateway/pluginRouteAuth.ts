/**
 * 插件 HTTP 路由认证中间件（Gateway 层）
 *
 * 参考 openclaw/src/gateway/server/plugins-http/route-auth.ts：
 * - 决定某个插件路由路径是否需要 gateway auth
 * - 默认所有写操作（POST/PUT/DELETE/PATCH）需要认证
 * - GET 请求默认放行（health/config 暴露面通常只读）
 * - 可通过 requirePluginAuth(pathPrefix) 自定义强制认证路径
 *
 * 与 gatewayAuth.ts 配合使用：
 * - gatewayAuth 处理 /v1/* OpenAI 兼容入口
 * - pluginRouteAuth 处理 /api/plugins/* 与 /api/extensions/* 等插件管理入口
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { authenticateRequest } from './gatewayAuth.js';
import { logger } from '../logger.js';

// ==================== 配置 ====================

/** 需要强制认证的路径前缀（小写比较） */
const PROTECTED_PREFIXES = new Set<string>([
  '/api/plugins/install',
  '/api/plugins/uninstall',
  '/api/plugins/enable',
  '/api/plugins/disable',
  '/api/plugins/reload',
  '/api/plugins/:id/config',
  '/api/plugins/:id/dependencies',
  '/api/extensions/install',
]);

/** 默认需要认证的 HTTP 方法（写操作） */
const PROTECTED_METHODS = new Set<string>([
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);

export interface PluginRouteAuthOptions {
  /** 强制认证的路径前缀列表 */
  protectedPrefixes?: string[];
  /** 强制放行的路径前缀列表（优先级高于 protected） */
  publicPrefixes?: string[];
  /** 完全禁用认证（开发模式） */
  disabled?: boolean;
}

const options: PluginRouteAuthOptions = {
  disabled: false,
};

export function configurePluginRouteAuth(opts: Partial<PluginRouteAuthOptions>): void {
  Object.assign(options, opts);
  if (opts.protectedPrefixes) {
    for (const p of opts.protectedPrefixes) PROTECTED_PREFIXES.add(p);
  }
  logger.info(
    `[PluginRouteAuth] 配置更新: disabled=${options.disabled} protected=${PROTECTED_PREFIXES.size} public=${options.publicPrefixes?.length ?? 0}`,
  );
}

// ==================== 路径判定 ====================

/**
 * 判断插件路径是否需要 gateway auth（纯路径字符串判定）。
 * - 显式放行路径 → false
 * - 强制认证路径 → true
 * - 其余路径：默认 false（方法级判定在中间件中处理）
 */
export function shouldEnforceGatewayAuthForPluginPath(path: string): boolean {
  if (options.disabled) return false;
  const normalized = path?.toLowerCase() ?? '';

  // 1) 显式放行路径优先
  if (options.publicPrefixes) {
    for (const prefix of options.publicPrefixes) {
      if (normalized.startsWith(prefix.toLowerCase())) return false;
    }
  }

  // 2) 强制认证路径
  for (const prefix of PROTECTED_PREFIXES) {
    if (normalized.startsWith(prefix.toLowerCase())) return true;
  }

  // 3) 路径本身不在强制列表中，返回 false；方法级判定在中间件中补充
  return false;
}

/**
 * 判断请求是否需要 gateway auth（综合路径 + HTTP 方法）。
 */
function shouldEnforceGatewayAuthForPluginRequest(req: Request): boolean {
  if (options.disabled) return false;
  const path = req.path?.toLowerCase() ?? '';
  const method = req.method?.toUpperCase() ?? 'GET';

  // 1) 显式放行路径优先
  if (options.publicPrefixes) {
    for (const prefix of options.publicPrefixes) {
      if (path.startsWith(prefix.toLowerCase())) return false;
    }
  }

  // 2) 强制认证路径
  if (shouldEnforceGatewayAuthForPluginPath(req.path ?? '')) return true;

  // 3) 默认：写操作需要认证
  return PROTECTED_METHODS.has(method);
}

// ==================== Express 中间件 ====================

/**
 * 插件路由认证中间件。
 * 需要认证时调用 gatewayAuth.authenticateRequest；通过则 next()，否则 401。
 */
export const pluginRouteAuthMiddleware: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!shouldEnforceGatewayAuthForPluginRequest(req)) {
    next();
    return;
  }
  try {
    const result = await authenticateRequest(req);
    if (result.authenticated) {
      next();
    } else {
      res.status(401).json({
        error: result.error ?? 'Unauthorized',
        code: 'PLUGIN_AUTH_REQUIRED',
      });
    }
  } catch (err) {
    logger.error('[PluginRouteAuth] 认证异常:', err);
    res.status(500).json({ error: 'auth middleware error' });
  }
};

/** 为指定前缀创建强制认证中间件（用于 app.use(prefix, ...) 之前插入） */
export function requirePluginAuth(prefix: string): RequestHandler {
  PROTECTED_PREFIXES.add(prefix.toLowerCase());
  return pluginRouteAuthMiddleware;
}
