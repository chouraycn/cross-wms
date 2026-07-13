import type { SkillEntry } from './skillRegistry';

export type SkillChainStepType = 'skill' | 'tool' | 'prompt' | 'condition' | 'parallel';

export interface SkillChainStep {
  id: string;
  type: SkillChainStepType;
  name: string;
  description?: string;
  skillId?: string;
  toolName?: string;
  prompt?: string;
  condition?: string;
  steps?: SkillChainStep[];
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
  nextStepId?: string;
  errorHandlerStepId?: string;
}

export interface SkillChain {
  id: string;
  name: string;
  description: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  entryStepId: string;
  steps: Record<string, SkillChainStep>;
  tags?: string[];
  category?: string;
  author?: string;
  icon?: string;
}

export interface SkillChainExecutionContext {
  chainId: string;
  currentStepId: string;
  variables: Record<string, unknown>;
  history: Array<{
    stepId: string;
    result: unknown;
    timestamp: number;
    duration: number;
  }>;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  error?: Error;
}

export interface SkillChainExecutionResult {
  success: boolean;
  result?: unknown;
  error?: Error;
  duration: number;
  executedSteps: string[];
}

export class SkillChainManager {
  private chains: Map<string, SkillChain> = new Map();
  private executions: Map<string, SkillChainExecutionContext> = new Map();

  register(chain: SkillChain): void {
    this.chains.set(chain.id, chain);
  }

  unregister(chainId: string): boolean {
    return this.chains.delete(chainId);
  }

  get(chainId: string): SkillChain | undefined {
    return this.chains.get(chainId);
  }

  has(chainId: string): boolean {
    return this.chains.has(chainId);
  }

  list(): SkillChain[] {
    return Array.from(this.chains.values());
  }

  search(query: string): SkillChain[] {
    const lowerQuery = query.toLowerCase();
    return this.list().filter(chain =>
      chain.name.toLowerCase().includes(lowerQuery) ||
      chain.description.toLowerCase().includes(lowerQuery) ||
      chain.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  validateChain(chain: SkillChain): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!chain.id) errors.push('Chain id is required');
    if (!chain.name) errors.push('Chain name is required');
    if (!chain.entryStepId) errors.push('Entry step id is required');
    if (!chain.steps || Object.keys(chain.steps).length === 0) {
      errors.push('Chain must have at least one step');
    }

    if (chain.entryStepId && chain.steps && !chain.steps[chain.entryStepId]) {
      errors.push(`Entry step "${chain.entryStepId}" not found in steps`);
    }

    if (chain.steps) {
      for (const [stepId, step] of Object.entries(chain.steps)) {
        if (step.nextStepId && !chain.steps[step.nextStepId]) {
          errors.push(`Step "${stepId}" references non-existent next step "${step.nextStepId}"`);
        }
        if (step.errorHandlerStepId && !chain.steps[step.errorHandlerStepId]) {
          errors.push(`Step "${stepId}" references non-existent error handler step "${step.errorHandlerStepId}"`);
        }
        if (step.type === 'skill' && !step.skillId) {
          errors.push(`Skill step "${stepId}" must have a skillId`);
        }
        if (step.type === 'tool' && !step.toolName) {
          errors.push(`Tool step "${stepId}" must have a toolName`);
        }
        if (step.type === 'prompt' && !step.prompt) {
          errors.push(`Prompt step "${stepId}" must have a prompt`);
        }
        if (step.type === 'condition' && !step.condition) {
          errors.push(`Condition step "${stepId}" must have a condition`);
        }
        if (step.type === 'parallel' && (!step.steps || step.steps.length === 0)) {
          errors.push(`Parallel step "${stepId}" must have sub-steps`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  createExecution(chainId: string, initialVariables: Record<string, unknown> = {}): SkillChainExecutionContext | null {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    const executionId = `${chainId}-${Date.now()}`;
    const context: SkillChainExecutionContext = {
      chainId,
      currentStepId: chain.entryStepId,
      variables: { ...initialVariables },
      history: [],
      status: 'idle',
    };

    this.executions.set(executionId, context);
    return context;
  }

  getExecution(executionId: string): SkillChainExecutionContext | undefined {
    return this.executions.get(executionId);
  }

  getChainStepsFlat(chain: SkillChain): SkillChainStep[] {
    const steps: SkillChainStep[] = [];
    const visited = new Set<string>();

    function walk(step: SkillChainStep) {
      if (visited.has(step.id)) return;
      visited.add(step.id);
      steps.push(step);

      if (step.steps) {
        for (const subStep of step.steps) {
          walk(subStep);
        }
      }
      if (step.nextStepId && chain.steps[step.nextStepId]) {
        walk(chain.steps[step.nextStepId]);
      }
    }

    const entryStep = chain.steps[chain.entryStepId];
    if (entryStep) {
      walk(entryStep);
    }

    return steps;
  }

  getRequiredSkills(chain: SkillChain): string[] {
    const skillIds = new Set<string>();
    const steps = this.getChainStepsFlat(chain);
    
    for (const step of steps) {
      if (step.type === 'skill' && step.skillId) {
        skillIds.add(step.skillId);
      }
    }

    return Array.from(skillIds);
  }

  canExecute(chain: SkillChain, availableSkills: Map<string, SkillEntry>): {
    canExecute: boolean;
    missingSkills: string[];
  } {
    const requiredSkills = this.getRequiredSkills(chain);
    const missingSkills = requiredSkills.filter(skillId => !availableSkills.has(skillId));
    return {
      canExecute: missingSkills.length === 0,
      missingSkills,
    };
  }

  updateChain(chainId: string, updates: Partial<SkillChain>): SkillChain | null {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    const updated: SkillChain = {
      ...chain,
      ...updates,
      id: chainId,
      updatedAt: Date.now(),
    };

    this.chains.set(chainId, updated);
    return updated;
  }

  addStep(chainId: string, step: SkillChainStep, afterStepId?: string): SkillChain | null {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    const updatedSteps = { ...chain.steps, [step.id]: step };

    if (afterStepId && updatedSteps[afterStepId]) {
      const prevStep = updatedSteps[afterStepId];
      step.nextStepId = prevStep.nextStepId;
      prevStep.nextStepId = step.id;
    }

    const updated: SkillChain = {
      ...chain,
      steps: updatedSteps,
      updatedAt: Date.now(),
    };

    this.chains.set(chainId, updated);
    return updated;
  }

  removeStep(chainId: string, stepId: string): SkillChain | null {
    const chain = this.chains.get(chainId);
    if (!chain) return null;
    if (!chain.steps[stepId]) return null;
    if (stepId === chain.entryStepId) return null;

    const updatedSteps = { ...chain.steps };

    for (const step of Object.values(updatedSteps)) {
      if (step.nextStepId === stepId) {
        step.nextStepId = updatedSteps[stepId]?.nextStepId;
      }
    }

    delete updatedSteps[stepId];

    const updated: SkillChain = {
      ...chain,
      steps: updatedSteps,
      updatedAt: Date.now(),
    };

    this.chains.set(chainId, updated);
    return updated;
  }

  duplicateChain(chainId: string, newName?: string): SkillChain | null {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    const newId = `${chain.id}-copy-${Date.now()}`;
    const duplicated: SkillChain = {
      ...chain,
      id: newId,
      name: newName || `${chain.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: JSON.parse(JSON.stringify(chain.steps)),
    };

    this.chains.set(newId, duplicated);
    return duplicated;
  }

  exportChain(chainId: string): string | null {
    const chain = this.chains.get(chainId);
    if (!chain) return null;
    return JSON.stringify(chain, null, 2);
  }

  importChain(json: string): SkillChain | null {
    try {
      const chain = JSON.parse(json) as SkillChain;
      const validation = this.validateChain(chain);
      if (!validation.valid) {
        console.warn('Invalid chain imported:', validation.errors);
        return null;
      }
      this.chains.set(chain.id, chain);
      return chain;
    } catch (e) {
      console.error('Failed to import chain:', e);
      return null;
    }
  }
}

export const skillChainManager = new SkillChainManager();
