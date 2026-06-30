import { globalRegistry } from './registry.js';
import { LEGACY_ENGINE_CONFIG, createLegacyContextEngine } from './legacyEngine.js';
import { logger } from '../../logger.js';
import type { ContextEngineFactoryContext } from './types.js';

export function initContextEngineRegistry(): void {
  if (globalRegistry.has('legacy')) {
    logger.debug('[ContextEngine] 注册表已初始化，跳过');
    return;
  }

  globalRegistry.register(
    'legacy',
    createLegacyContextEngine,
    LEGACY_ENGINE_CONFIG,
    { isDefault: true }
  );

  logger.info('[ContextEngine] 上下文引擎注册表初始化完成，可用引擎:',
    globalRegistry.listEngines().map(e => `${e.engineId} (${e.displayName})`).join(', '));
}

export function getContextEngine(
  sessionId: string,
  options?: {
    engineId?: string;
    factoryContext?: ContextEngineFactoryContext;
  }
) {
  if (!globalRegistry.has('legacy')) {
    initContextEngineRegistry();
  }
  return globalRegistry.createEngine(sessionId, {
    engineId: options?.engineId,
    factoryContext: options?.factoryContext
  });
}

export { globalRegistry } from './registry.js';
export * from './types.js';
export { LegacyContextEngine, createLegacyContextEngine } from './legacyEngine.js';
