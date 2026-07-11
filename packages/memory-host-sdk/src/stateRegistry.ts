/**
 * Registry state for memory capabilities, corpus supplements, and prompt supplements.
 *
 * Semantic adaptation of openclaw/src/plugins/memory-state.ts.
 * Replaces the plugin-id registration model with a generic registrant-id model
 * so the SDK can track memory capabilities without depending on a plugin system.
 */
import type { MemoryRuntimeBackendConfig, MemoryRuntimeParams } from './runtimeBridge.js';

export type MemoryCitationsMode = 'off' | 'inline' | 'footnote';

export type MemoryPromptSectionBuilder = (params: {
  availableTools: Set<string>;
  citationsMode?: MemoryCitationsMode;
}) => string[];

export interface MemoryCorpusSearchResult {
  corpus: string;
  path: string;
  title?: string;
  kind?: string;
  score: number;
  snippet: string;
  id?: string;
  startLine?: number;
  endLine?: number;
  citation?: string;
  source?: string;
  provenanceLabel?: string;
  sourceType?: string;
  sourcePath?: string;
  updatedAt?: string;
}

export interface MemoryCorpusGetResult {
  corpus: string;
  path: string;
  title?: string;
  kind?: string;
  content: string;
  fromLine: number;
  lineCount: number;
  id?: string;
  provenanceLabel?: string;
  sourceType?: string;
  sourcePath?: string;
  updatedAt?: string;
}

export interface MemoryCorpusSupplement {
  search(params: {
    query: string;
    maxResults?: number;
    agentSessionKey?: string;
  }): Promise<MemoryCorpusSearchResult[]>;
  get(params: {
    lookup: string;
    fromLine?: number;
    lineCount?: number;
    agentSessionKey?: string;
  }): Promise<MemoryCorpusGetResult | null>;
}

export interface MemoryFlushPlan {
  softThresholdTokens: number;
  forceFlushTranscriptBytes: number;
  reserveTokensFloor: number;
  model?: string;
  prompt: string;
  systemPrompt: string;
  relativePath: string;
}

export type MemoryFlushPlanResolver = (params: {
  nowMs?: number;
}) => MemoryFlushPlan | null;

export interface MemoryPluginRuntime {
  getMemorySearchManager(params: MemoryRuntimeParams): Promise<{
    manager: unknown | null;
    error?: string;
  }>;
  resolveMemoryBackendConfig(params: MemoryRuntimeParams): MemoryRuntimeBackendConfig;
  closeMemorySearchManager?(params: MemoryRuntimeParams): Promise<void>;
  closeAllMemorySearchManagers?(): Promise<void>;
}

export interface MemoryPluginCapability {
  promptBuilder?: MemoryPromptSectionBuilder;
  flushPlanResolver?: MemoryFlushPlanResolver;
  runtime?: MemoryPluginRuntime;
}

interface MemoryCapabilityRegistration {
  pluginId: string;
  capability: MemoryPluginCapability;
}

interface MemoryCorpusSupplementRegistration {
  pluginId: string;
  supplement: MemoryCorpusSupplement;
}

interface MemoryPromptSupplementRegistration {
  pluginId: string;
  builder: MemoryPromptSectionBuilder;
}

interface MemoryState {
  capability?: MemoryCapabilityRegistration;
  corpusSupplements: MemoryCorpusSupplementRegistration[];
  promptSupplements: MemoryPromptSupplementRegistration[];
}

function normalizePromptLines(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((line): line is string => typeof line === 'string');
}

/**
 * Registry for memory capabilities, corpus supplements, and prompt supplements.
 *
 * Adapted from openclaw memory-state.ts. The OpenClaw version tracked
 * plugin-owned registrations keyed by plugin id; here the same shape is kept
 * but the "plugin id" is just a generic registrant identifier, so the SDK can
 * compose memory prompts, flush plans, and corpus lookups without a plugin
 * runtime.
 */
export class MemoryStateRegistry {
  private state: MemoryState = {
    corpusSupplements: [],
    promptSupplements: [],
  };

  registerMemoryCapability(pluginId: string, capability: MemoryPluginCapability): void {
    const existingCapability = this.state.capability?.capability;
    this.state.capability = {
      pluginId,
      capability: {
        ...(existingCapability ?? {}),
        ...capability,
      },
    };
  }

  registerMemoryCorpusSupplement(pluginId: string, supplement: MemoryCorpusSupplement): void {
    const next = this.state.corpusSupplements.filter(
      (registration) => registration.pluginId !== pluginId,
    );
    next.push({ pluginId, supplement });
    this.state.corpusSupplements = next;
  }

  registerMemoryPromptSupplement(pluginId: string, builder: MemoryPromptSectionBuilder): void {
    const next = this.state.promptSupplements.filter(
      (registration) => registration.pluginId !== pluginId,
    );
    next.push({ pluginId, builder });
    this.state.promptSupplements = next;
  }

  buildMemoryPromptSection(params: {
    availableTools: Set<string>;
    citationsMode?: MemoryCitationsMode;
  }): string[] {
    const primary = normalizePromptLines(
      this.state.capability?.capability.promptBuilder?.(params) ?? [],
    );
    const supplements = [...this.state.promptSupplements]
      .sort((left, right) => left.pluginId.localeCompare(right.pluginId))
      .flatMap((registration) => normalizePromptLines(registration.builder(params)));
    return [...primary, ...supplements];
  }

  resolveMemoryFlushPlan(params: { nowMs?: number }): MemoryFlushPlan | null {
    return this.state.capability?.capability.flushPlanResolver?.(params) ?? null;
  }

  getMemoryRuntime(): MemoryPluginRuntime | undefined {
    return this.state.capability?.capability.runtime;
  }

  listMemoryCorpusSupplements(): MemoryCorpusSupplementRegistration[] {
    return [...this.state.corpusSupplements];
  }

  listMemoryPromptSupplements(): MemoryPromptSupplementRegistration[] {
    return [...this.state.promptSupplements];
  }

  getMemoryCapabilityRegistration(): MemoryCapabilityRegistration | undefined {
    return this.state.capability
      ? {
          pluginId: this.state.capability.pluginId,
          capability: { ...this.state.capability.capability },
        }
      : undefined;
  }

  clearState(): void {
    this.state.capability = undefined;
    this.state.corpusSupplements = [];
    this.state.promptSupplements = [];
  }
}

export const memoryStateRegistry = new MemoryStateRegistry();
