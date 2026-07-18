/**
 * Plugin SDK 统一导出
 *
 * 这是插件作者唯一应该 import 的入口：
 *   import { definePlugin, defineTool, ... } from '<host>/server/engine/plugin-sdk';
 *
 * 参考 openclaw/src/plugin-sdk/index.ts 的边界控制：
 * - 不暴露内部实现细节
 * - 仅暴露稳定的用户面向 API
 */

// 类型
export type {
  PluginDefinition,
  PluginSdkApi,
  PluginSdkToolRegistration,
  PluginDecoratorMetadata,
  PluginCommandDefinition,
  SdkValidationError,
  SdkValidationResult,
  PluginCapabilityKind,
  PluginSource,
  PluginVersionRange,
  PluginDependency,
  PluginManifest,
  PluginToolDefinition,
  PluginTrigger,
  PluginConfigSchema,
  PluginConfigProperty,
  PluginContext,
  PluginLogger,
  PluginStorage,
  PluginFetch,
  PluginFetchInit,
  PluginFetchResponse,
  PluginEventBus,
  PluginConfigAccessor,
  PluginLifecycle,
  PluginEvent,
  PluginPermission,
  PluginPermissionGroup,
  PermissionRequest,
  PermissionRequestState,
  PluginPermissionDescriptor,
  PermissionResolver,
} from './types.js';

// 上下文
export {
  createPluginContext,
  createPluginLogger,
  createPluginStorage,
  createPluginEventBus,
  createPluginConfigAccessor,
  createNoopPluginContext,
} from './context.js';
export type { CreatePluginContextOptions } from './context.js';

// 装饰器 + 函数式 API
export {
  plugin,
  hook,
  tool,
  command,
  getPluginMetadata,
  getHookMetadata,
  getToolMetadata,
  getCommandMetadata,
  definePlugin,
  defineTool,
  defineCommand,
  defineHook,
  isValidPluginId,
} from './decorators.js';

// 校验
export {
  validatePluginDefinition,
  validateToolRegistration,
  validateCommandDefinition,
  validateManifest,
  assertValid,
} from './validation.js';

// 辅助
export {
  generatePluginId,
  definitionToManifest,
  bundlePlugins,
  debounce,
  createDeferred,
  safeRegister,
  summarizeContext,
  isSameManifest,
  manifestToSearchParams,
} from './helpers.js';
