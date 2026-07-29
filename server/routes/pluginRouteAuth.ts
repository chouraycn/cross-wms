/**
 * 插件 HTTP 路由认证中间件（向后兼容 re-export）
 *
 * 实现已迁移至 server/gateway/pluginRouteAuth.ts，此文件仅保留 re-export
 * 以避免破坏既有导入路径。
 */

export {
  pluginRouteAuthMiddleware,
  shouldEnforceGatewayAuthForPluginPath,
  configurePluginRouteAuth,
  requirePluginAuth,
  type PluginRouteAuthOptions,
} from '../gateway/pluginRouteAuth.js';
