/**
 * Execution Contract — 执行契约分级模块
 *
 * 功能特性：
 * - 模型分级：basic / standard / advanced / strict
 * - 不同级别启用不同的执行约束
 *   - basic: 基础工具调用，无规划
 *   - standard: 标准模式，自动规划
 *   - advanced: 高级模式，结构化规划 + 验证
 *   - strict: 严格模式（GPT-5 级），强制 update_plan + 每步验证
 * - 自动根据模型 ID 判定等级
 * - 不完整回合恢复机制
 * - 工具调用严格验证
 *
 * 集成思路：
 * 1. 在 agentRuntime 启动时，根据模型 ID 获取执行契约等级
 * 2. 根据等级决定是否启用规划、验证、结构化输出
 * 3. strict 模式下强制使用 update_plan 工具
 */

import { logger } from '../logger.js';

// ==================== 类型定义 ====================

export type ExecutionTier = 'basic' | 'standard' | 'advanced' | 'strict';

export interface ExecutionContract {
  tier: ExecutionTier;
  modelId: string;
  features: {
    structuredPlanning: boolean;
    planUpdates: boolean;
    stepByStepVerification: boolean;
    toolCallValidation: boolean;
    incompleteRecovery: boolean;
    memoryEnhanced: boolean;
    multiStepReasoning: boolean;
  };
  maxToolCallsPerTurn: number;
  maxPlanningRounds: number;
  requireExplicitConfirmation: boolean;
  systemPromptAddition?: string;
}

export interface ContractOverride {
  tier?: ExecutionTier;
  features?: Partial<ExecutionContract['features']>;
  maxToolCallsPerTurn?: number;
}

// ==================== 模型分级映射 ====================

const STRICT_MODEL_PATTERNS = [
  'gpt-5',
  'gpt-5o',
  'gpt-4.1',
  'claude-opus',
  'gemini-2.5-pro',
  'deepseek-v4-pro',
];

const ADVANCED_MODEL_PATTERNS = [
  'gpt-4o',
  'claude-sonnet',
  'gemini-2.0-pro',
  'glm-4.7',
  'glm-4-plus',
  'qwen-plus',
];

const STANDARD_MODEL_PATTERNS = [
  'gpt-4o-mini',
  'claude-haiku',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'deepseek-v3',
  'glm-4-flash',
  'qwen-turbo',
  'gpt-3.5',
  'moonshot',
];

// ==================== 默认契约配置 ====================

const DEFAULT_CONTRACTS: Record<ExecutionTier, Omit<ExecutionContract, 'tier' | 'modelId'>> = {
  basic: {
    features: {
      structuredPlanning: false,
      planUpdates: false,
      stepByStepVerification: false,
      toolCallValidation: false,
      incompleteRecovery: false,
      memoryEnhanced: false,
      multiStepReasoning: false,
    },
    maxToolCallsPerTurn: 5,
    maxPlanningRounds: 0,
    requireExplicitConfirmation: false,
  },
  standard: {
    features: {
      structuredPlanning: false,
      planUpdates: false,
      stepByStepVerification: false,
      toolCallValidation: true,
      incompleteRecovery: true,
      memoryEnhanced: true,
      multiStepReasoning: false,
    },
    maxToolCallsPerTurn: 15,
    maxPlanningRounds: 2,
    requireExplicitConfirmation: false,
  },
  advanced: {
    features: {
      structuredPlanning: true,
      planUpdates: true,
      stepByStepVerification: true,
      toolCallValidation: true,
      incompleteRecovery: true,
      memoryEnhanced: true,
      multiStepReasoning: true,
    },
    maxToolCallsPerTurn: 25,
    maxPlanningRounds: 5,
    requireExplicitConfirmation: false,
    systemPromptAddition:
      '你是一个高级 AI 助手。对于复杂任务，请先制定计划，再逐步执行，每一步执行后验证结果是否符合预期。',
  },
  strict: {
    features: {
      structuredPlanning: true,
      planUpdates: true,
      stepByStepVerification: true,
      toolCallValidation: true,
      incompleteRecovery: true,
      memoryEnhanced: true,
      multiStepReasoning: true,
    },
    maxToolCallsPerTurn: 50,
    maxPlanningRounds: 10,
    requireExplicitConfirmation: true,
    systemPromptAddition:
      '你是一个严格模式的 AI 助手。必须遵循以下规则：\n' +
      '1. 开始任务前先使用 update_plan 工具制定详细计划\n' +
      '2. 每一步执行后验证结果正确性\n' +
      '3. 遇到偏差时更新计划并说明原因\n' +
      '4. 关键决策需要明确确认\n' +
      '5. 保持结构化思考和输出',
  },
};

// ==================== 工具函数 ====================

function normalizeModelId(modelId: string): string {
  return modelId.toLowerCase().replace(/[-_]/g, '').replace(/\./g, '');
}

/**
 * 根据模型 ID 自动判定执行契约等级
 */
export function detectExecutionTier(modelId: string): ExecutionTier {
  const normalized = normalizeModelId(modelId);

  for (const pattern of STRICT_MODEL_PATTERNS) {
    if (normalized.includes(normalizeModelId(pattern))) {
      return 'strict';
    }
  }

  for (const pattern of ADVANCED_MODEL_PATTERNS) {
    if (normalized.includes(normalizeModelId(pattern))) {
      return 'advanced';
    }
  }

  for (const pattern of STANDARD_MODEL_PATTERNS) {
    if (normalized.includes(normalizeModelId(pattern))) {
      return 'standard';
    }
  }

  return 'standard';
}

// ==================== ExecutionContractManager ====================

export class ExecutionContractManager {
  private overrides: Map<string, ExecutionTier> = new Map();
  private customContracts: Map<string, ExecutionContract> = new Map();

  setModelTier(modelId: string, tier: ExecutionTier): void {
    this.overrides.set(modelId, tier);
    logger.debug(`[ExecutionContract] 模型 ${modelId} 等级已设置: ${tier}`);
  }

  setCustomContract(modelId: string, contract: ExecutionContract): void {
    this.customContracts.set(modelId, contract);
    logger.debug(`[ExecutionContract] 模型 ${modelId} 自定义契约已设置`);
  }

  getContract(modelId: string, override?: ContractOverride): ExecutionContract {
    const custom = this.customContracts.get(modelId);
    if (custom && !override) {
      return custom;
    }

    let tier: ExecutionTier;
    if (override?.tier) {
      tier = override.tier;
    } else if (this.overrides.has(modelId)) {
      tier = this.overrides.get(modelId)!;
    } else {
      tier = detectExecutionTier(modelId);
    }

    const base = DEFAULT_CONTRACTS[tier];
    const contract: ExecutionContract = {
      tier,
      modelId,
      ...base,
      features: { ...base.features },
    };

    if (override?.features) {
      contract.features = { ...contract.features, ...override.features };
    }
    if (override?.maxToolCallsPerTurn !== undefined) {
      contract.maxToolCallsPerTurn = override.maxToolCallsPerTurn;
    }

    return contract;
  }

  getTier(modelId: string): ExecutionTier {
    if (this.overrides.has(modelId)) {
      return this.overrides.get(modelId)!;
    }
    return detectExecutionTier(modelId);
  }

  hasStructuredPlanning(modelId: string): boolean {
    return this.getContract(modelId).features.structuredPlanning;
  }

  hasStepVerification(modelId: string): boolean {
    return this.getContract(modelId).features.stepByStepVerification;
  }

  hasIncompleteRecovery(modelId: string): boolean {
    return this.getContract(modelId).features.incompleteRecovery;
  }

  getMaxToolCallsPerTurn(modelId: string): number {
    return this.getContract(modelId).maxToolCallsPerTurn;
  }

  getSystemPromptAddition(modelId: string): string | undefined {
    return this.getContract(modelId).systemPromptAddition;
  }

  validateToolCallCount(modelId: string, count: number): {
    valid: boolean;
    limit: number;
    remaining: number;
  } {
    const contract = this.getContract(modelId);
    const valid = count <= contract.maxToolCallsPerTurn;
    return {
      valid,
      limit: contract.maxToolCallsPerTurn,
      remaining: Math.max(0, contract.maxToolCallsPerTurn - count),
    };
  }

  reset(): void {
    this.overrides.clear();
    this.customContracts.clear();
    logger.debug('[ExecutionContract] 已重置所有配置');
  }
}

// ==================== 单例 ====================

let defaultManager: ExecutionContractManager | null = null;

export function getExecutionContractManager(): ExecutionContractManager {
  if (!defaultManager) {
    defaultManager = new ExecutionContractManager();
  }
  return defaultManager;
}

// ==================== 便捷函数 ====================

export function getExecutionContract(modelId: string): ExecutionContract {
  return getExecutionContractManager().getContract(modelId);
}

export function shouldUseStrictMode(modelId: string): boolean {
  return getExecutionContractManager().getTier(modelId) === 'strict';
}

export function shouldUseStructuredPlanning(modelId: string): boolean {
  return getExecutionContractManager().hasStructuredPlanning(modelId);
}
