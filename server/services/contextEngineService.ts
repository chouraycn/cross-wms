import { logger } from '../logger.js';
import { initContextEngineRegistry, getContextEngine, globalRegistry } from '../engine/context-engine/index.js';
import type {
  ContextEngine,
  AgentMessage,
  MemorySearchOptions,
  MemorySearchResult,
  ContextEngineStats,
  ContextEngineRuntimeContext,
  AssembleResult,
  ContextEngineFactoryContext,
  ContextEngineHostCapability,
  ContextEngineHostRequirements,
  ContextEngineOperation,
  ContextEngineSessionState,
  ContextEngineProjection,
} from '../engine/context-engine/types.js';
import { initEmbeddingProviders } from '../engine/embedding-providers/index.js';
import { MemoryBudgetManager, type MemoryBudgetStats, type SessionMemoryStats } from '../engine/context-engine/memoryBudget.js';
import { ContextProjectionManager, type ProjectionComputeOptions } from '../engine/context-engine/contextProjection.js';
import { CROSS_WMS_EMBEDDED_HOST, evaluateContextEngineHostSupport, type ContextEngineHostSupportEvaluationResult } from '../engine/context-engine/hostCompat.js';

const activeEngines = new Map<string, ContextEngine>();
const sessionProjections = new Map<string, ContextProjectionManager>();

let initialized = false;
let globalMemoryBudget: MemoryBudgetManager | null = null;

export function ensureContextEngineService(): void {
  if (initialized) return;

  try {
    initContextEngineRegistry();
    initEmbeddingProviders();
    globalMemoryBudget = new MemoryBudgetManager();
    initialized = true;
    logger.info('[ContextEngineService] 上下文引擎服务已初始化');
  } catch (err) {
    logger.error(
      '[ContextEngineService] 初始化失败:',
      err instanceof Error ? err.message : String(err)
    );
    throw err;
  }
}

export function getEngine(sessionId: string): ContextEngine | undefined {
  return activeEngines.get(sessionId);
}

export async function getOrCreateEngine(
  sessionId: string,
  engineIdOrOptions?: string | {
    engineId?: string;
    factoryContext?: ContextEngineFactoryContext;
  }
): Promise<ContextEngine> {
  ensureContextEngineService();

  const existing = activeEngines.get(sessionId);
  if (existing) return existing;

  let engineId: string | undefined;
  let factoryContext: ContextEngineFactoryContext | undefined;

  if (typeof engineIdOrOptions === 'string') {
    engineId = engineIdOrOptions;
  } else if (engineIdOrOptions) {
    engineId = engineIdOrOptions.engineId;
    factoryContext = engineIdOrOptions.factoryContext;
  }

  const engine = await getContextEngine(sessionId, {
    engineId,
    factoryContext,
  });
  activeEngines.set(sessionId, engine);

  logger.debug(`[ContextEngineService] 创建引擎实例: session=${sessionId}, engine=${engineId ?? 'default'}`);
  return engine;
}

export function hasEngine(sessionId: string): boolean {
  return activeEngines.has(sessionId);
}

export function releaseEngine(sessionId: string): void {
  const engine = activeEngines.get(sessionId);
  if (engine) {
    engine.dispose?.().catch(err => {
      logger.error(`[ContextEngineService] 释放引擎失败 (${sessionId}):`, err);
    });
    activeEngines.delete(sessionId);
    logger.debug(`[ContextEngineService] 释放引擎: session=${sessionId}`);
  }
}

export async function evaluateHostCompatibility(
  engineId: string,
  operation: ContextEngineOperation,
  hostCapabilities: ContextEngineHostCapability[]
): Promise<{
  compatible: boolean;
  missingCapabilities: ContextEngineHostCapability[];
  unsupportedMessage?: string;
}> {
  ensureContextEngineService();

  const config = globalRegistry.getConfig(engineId);
  if (!config) {
    return {
      compatible: false,
      missingCapabilities: [],
      unsupportedMessage: `引擎 ${engineId} 未注册`,
    };
  }

  const hostRequirements = config.hostRequirements?.[operation];
  if (!hostRequirements) {
    return {
      compatible: true,
      missingCapabilities: [],
    };
  }

  const hostCapSet = new Set(hostCapabilities);
  const missing = hostRequirements.requiredCapabilities.filter(
    cap => !hostCapSet.has(cap)
  );

  return {
    compatible: missing.length === 0,
    missingCapabilities: missing,
    unsupportedMessage: hostRequirements.unsupportedMessage,
  };
}

export function getEngineHostRequirements(
  engineId: string
): Partial<Record<ContextEngineOperation, ContextEngineHostRequirements>> | null {
  ensureContextEngineService();
  const config = globalRegistry.getConfig(engineId);
  return config?.hostRequirements ?? null;
}

export async function bootstrapSession(
  sessionId: string,
  initialMessages?: AgentMessage[],
  engineId?: string,
  runtimeContext?: ContextEngineRuntimeContext
): Promise<void> {
  const engine = await getOrCreateEngine(sessionId, engineId);
  if (engine.bootstrap) {
    await engine.bootstrap({
      sessionId,
      initialMessages,
      runtimeContext,
    });
  }
}

export async function ingestMessages(
  sessionId: string,
  messages: AgentMessage[],
  runtimeContext?: ContextEngineRuntimeContext
): Promise<{ added: number; skipped: number; tokensAdded: number }> {
  const engine = await getOrCreateEngine(sessionId);

  if (engine.ingestBatch) {
    const result = await engine.ingestBatch({
      sessionId,
      messages,
      runtimeContext,
    });
    return {
      added: result.added ?? result.ingestedCount ?? 0,
      skipped: result.skipped ?? 0,
      tokensAdded: result.tokensAdded ?? 0,
    };
  }

  let added = 0;
  let skipped = 0;
  let tokensAdded = 0;

  for (const message of messages) {
    const result = await engine.ingest({
      sessionId,
      message,
      runtimeContext,
    });
    added += result.added ?? (result.ingested ? 1 : 0);
    skipped += result.skipped ?? (result.ingested ? 0 : 1);
    tokensAdded += result.tokensAdded ?? 0;
  }

  return { added, skipped, tokensAdded };
}

export async function assembleContext(
  sessionId: string,
  options?: {
    messages?: AgentMessage[];
    tokenBudget?: number;
    availableTools?: Set<string>;
    model?: string;
    prompt?: string;
  },
  runtimeContext?: ContextEngineRuntimeContext
): Promise<AssembleResult> {
  const engine = await getOrCreateEngine(sessionId);
  return engine.assemble({
    sessionId,
    messages: options?.messages ?? [],
    tokenBudget: options?.tokenBudget,
    availableTools: options?.availableTools,
    model: options?.model,
    prompt: options?.prompt,
    runtimeContext,
  });
}

export async function afterTurn(
  sessionId: string,
  userMessage: AgentMessage,
  assistantReply: AgentMessage,
  runtimeContext?: ContextEngineRuntimeContext
): Promise<void> {
  const engine = await getOrCreateEngine(sessionId);
  if (engine.afterTurn) {
    await engine.afterTurn({
      sessionId,
      messages: [userMessage, assistantReply],
      prePromptMessageCount: 0,
      runtimeContext,
    });
  } else {
    await ingestMessages(sessionId, [userMessage, assistantReply], runtimeContext);
  }
}

export async function compactContext(
  sessionId: string,
  force: boolean = false,
  runtimeContext?: ContextEngineRuntimeContext
): Promise<{
  didCompact: boolean;
  reason?: string;
  messagesRemoved: number;
  tokensSaved: number;
  summaryLength?: number;
  strategy?: string;
}> {
  const engine = await getOrCreateEngine(sessionId);
  const result = await engine.compact({
    sessionId,
    force,
    runtimeContext,
  });

  return {
    didCompact: result.didCompact ?? result.compacted ?? false,
    reason: result.reason,
    messagesRemoved: result.messagesRemoved ?? 0,
    tokensSaved: result.tokensSaved ?? 0,
    summaryLength: result.summaryLength,
    strategy: result.strategy,
  };
}

export async function searchMemory(
  sessionId: string,
  options: MemorySearchOptions,
  runtimeContext?: ContextEngineRuntimeContext
): Promise<MemorySearchResult[]> {
  const engine = await getOrCreateEngine(sessionId);
  if (engine.searchMemory) {
    return engine.searchMemory({
      sessionId,
      query: options.query,
      topK: options.topK,
      minScore: options.minScore,
      runtimeContext,
    });
  }
  return [];
}

export async function getEngineStats(sessionId: string): Promise<ContextEngineStats | null> {
  const engine = activeEngines.get(sessionId);
  if (!engine) return null;
  if (engine.getStats) {
    return engine.getStats();
  }
  return null;
}

export async function getEngineSessionState(sessionId: string): Promise<ContextEngineSessionState | null> {
  const engine = activeEngines.get(sessionId);
  if (!engine) return null;
  if (engine.getSessionState) {
    return engine.getSessionState();
  }
  return null;
}

export function listEngines() {
  ensureContextEngineService();
  return globalRegistry.listEngines();
}

export function listEnginesWithHealth() {
  ensureContextEngineService();
  return globalRegistry.listEnginesWithHealth();
}

export function getEngineHealth(engineId: string) {
  ensureContextEngineService();
  return globalRegistry.getHealth(engineId);
}

export function resetEngineHealth(engineId: string): boolean {
  ensureContextEngineService();
  return globalRegistry.resetHealth(engineId);
}

export function getActiveSessionCount(): number {
  return activeEngines.size;
}

export function getAllActiveSessions(): string[] {
  return Array.from(activeEngines.keys());
}

export function getMemoryBudgetStats(): MemoryBudgetStats {
  ensureContextEngineService();
  return globalMemoryBudget!.getStats();
}

export function getSessionMemoryBudgetStats(sessionId: string): SessionMemoryStats | null {
  ensureContextEngineService();
  return globalMemoryBudget!.getSessionStats(sessionId);
}

export function getOrCreateProjectionManager(sessionId: string): ContextProjectionManager {
  ensureContextEngineService();
  let manager = sessionProjections.get(sessionId);
  if (!manager) {
    manager = new ContextProjectionManager('per_turn');
    sessionProjections.set(sessionId, manager);
  }
  return manager;
}

export function getContextProjection(sessionId: string): ContextEngineProjection | null {
  ensureContextEngineService();
  const manager = sessionProjections.get(sessionId);
  if (!manager) return null;
  const fingerprint = manager.getCurrentFingerprint();
  return {
    mode: manager.getMode(),
    epoch: manager.getCurrentEpoch(),
    fingerprint: fingerprint ?? undefined,
  };
}

export function computeContextProjection(
  sessionId: string,
  options: ProjectionComputeOptions
): ContextEngineProjection {
  ensureContextEngineService();
  const manager = getOrCreateProjectionManager(sessionId);
  return manager.computeProjection(options);
}

export function releaseProjectionManager(sessionId: string): void {
  const manager = sessionProjections.get(sessionId);
  if (manager) {
    manager.dispose();
    sessionProjections.delete(sessionId);
  }
}

export function evaluateHostCompatibilityForEngine(
  engineId: string,
  operation: ContextEngineOperation = 'agent-run'
): ContextEngineHostSupportEvaluationResult & { engineId: string } {
  ensureContextEngineService();
  const engineConfig = globalRegistry.getConfig(engineId);
  if (!engineConfig) {
    return {
      engineId,
      supported: false,
      operation,
      hostId: CROSS_WMS_EMBEDDED_HOST.hostId,
      missingCapabilities: [],
      hasRequirements: false,
      unsupportedMessage: `引擎 ${engineId} 未注册`,
    };
  }
  const engineInfo = {
    id: engineConfig.engineId,
    name: engineConfig.displayName,
    version: engineConfig.version,
    description: engineConfig.description,
    hostRequirements: engineConfig.hostRequirements,
  };
  const result = evaluateContextEngineHostSupport(engineInfo as import("../engine/context-engine/types.js").ContextEngineInfo, operation, CROSS_WMS_EMBEDDED_HOST);
  return { engineId, ...result };
}

export function getAllEnginesHostCompatibility(
  operation: ContextEngineOperation = 'agent-run'
): Array<ContextEngineHostSupportEvaluationResult & { engineId: string }> {
  ensureContextEngineService();
  const engines = globalRegistry.listEngines();
  return engines.map(engineConfig => {
    const engineInfo = {
      id: engineConfig.engineId,
      name: engineConfig.displayName,
      version: engineConfig.version,
      description: engineConfig.description,
      hostRequirements: engineConfig.hostRequirements,
    };
    const result = evaluateContextEngineHostSupport(
      engineInfo as import("../engine/context-engine/types.js").ContextEngineInfo,
      operation,
      CROSS_WMS_EMBEDDED_HOST
    );
    return { engineId: engineConfig.engineId, ...result };
  });
}

setInterval(() => {
  if (activeEngines.size === 0) return;

  logger.debug(`[ContextEngineService] 活跃会话数: ${activeEngines.size}`);
}, 5 * 60 * 1000);

process.on('exit', () => {
  for (const sessionId of activeEngines.keys()) {
    try {
      const engine = activeEngines.get(sessionId);
      engine?.dispose?.();
    } catch {
      void 0;
    }
  }
  activeEngines.clear();
});
