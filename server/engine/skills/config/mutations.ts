import fs from 'node:fs';
import path from 'node:path';
import { deepDiff, applyPatch, reversePatch } from './diff.js';
export { deepDiff, applyPatch, reversePatch } from './diff.js';

export interface SkillConfigMutation {
  id: string;
  timestamp: number;
  skillName: string;
  type: 'create' | 'update' | 'delete';
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  author?: string;
  reason?: string;
}

export interface MutationHistory {
  skillName: string;
  mutations: SkillConfigMutation[];
}

export interface MutationApplyOptions {
  dryRun?: boolean;
  author?: string;
  reason?: string;
}

export interface RollbackResult {
  success: boolean;
  rolledBackCount?: number;
  error?: string;
}

const mutationStore = new Map<string, MutationHistory>();
const configStore = new Map<string, Record<string, unknown>>();

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function recordMutation(
  skillName: string,
  params: Omit<SkillConfigMutation, 'id' | 'timestamp' | 'skillName'>,
): SkillConfigMutation {
  const mutation: SkillConfigMutation = {
    id: generateId(),
    timestamp: Date.now(),
    skillName,
    ...params,
  };

  const history = mutationStore.get(skillName);
  if (history) {
    history.mutations.push(mutation);
  } else {
    mutationStore.set(skillName, { skillName, mutations: [mutation] });
  }

  return mutation;
}

export function getMutationHistory(skillName: string): MutationHistory {
  const history = mutationStore.get(skillName);
  if (!history) {
    return { skillName, mutations: [] };
  }
  return {
    skillName: history.skillName,
    mutations: history.mutations.map((m) => ({ ...m })),
  };
}

export function getRecentMutations(limit = 50): SkillConfigMutation[] {
  const all: SkillConfigMutation[] = [];
  for (const history of mutationStore.values()) {
    all.push(...history.mutations);
  }
  return all
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

export function applyConfigChange(
  skillName: string,
  field: string,
  value: unknown,
  options: MutationApplyOptions = {},
): { success: boolean; mutation?: SkillConfigMutation; previousValue?: unknown } {
  const config = configStore.get(skillName) ?? {};
  const previousValue = config[field];

  if (previousValue === value) {
    return { success: false };
  }

  const type: SkillConfigMutation['type'] =
    !(field in config) ? 'create' : value === undefined ? 'delete' : 'update';

  if (!options.dryRun) {
    const nextConfig = { ...config };
    if (value === undefined) {
      delete nextConfig[field];
    } else {
      nextConfig[field] = value;
    }
    configStore.set(skillName, nextConfig);

    const mutation = recordMutation(skillName, {
      type,
      field,
      oldValue: previousValue,
      newValue: value,
      author: options.author,
      reason: options.reason,
    });

    return { success: true, mutation, previousValue };
  }

  return { success: true, previousValue };
}

export function rollbackToMutation(skillName: string, mutationId: string): RollbackResult {
  const history = mutationStore.get(skillName);
  if (!history || history.mutations.length === 0) {
    return { success: false, error: 'No mutation history found' };
  }

  const index = history.mutations.findIndex((m) => m.id === mutationId);
  if (index === -1) {
    return { success: false, error: 'Mutation not found' };
  }

  const config: Record<string, unknown> = {};
  for (let i = 0; i < index; i++) {
    const m = history.mutations[i];
    if (m.type === 'delete') {
      delete config[m.field];
    } else {
      config[m.field] = m.newValue;
    }
  }
  configStore.set(skillName, config);

  const rolledBackCount = history.mutations.length - index;
  history.mutations = history.mutations.slice(0, index);

  return { success: true, rolledBackCount };
}

export function rollbackLastMutation(skillName: string, count = 1): RollbackResult {
  const history = mutationStore.get(skillName);
  if (!history || history.mutations.length === 0) {
    return { success: false, error: 'No mutation history found' };
  }

  const actualCount = Math.min(count, history.mutations.length);
  const targetIndex = history.mutations.length - actualCount - 1;

  const config: Record<string, unknown> = {};
  if (targetIndex >= 0) {
    for (let i = 0; i <= targetIndex; i++) {
      const m = history.mutations[i];
      if (m.type === 'delete') {
        delete config[m.field];
      } else {
        config[m.field] = m.newValue;
      }
    }
  }
  configStore.set(skillName, config);

  history.mutations = history.mutations.slice(0, Math.max(0, history.mutations.length - actualCount));

  return { success: true, rolledBackCount: actualCount };
}

export function getCurrentConfig(skillName: string): Record<string, unknown> {
  const config = configStore.get(skillName);
  return config ? { ...config } : {};
}

export function compareConfigs(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): import('./diff.js').DiffEntry[] {
  return deepDiff(before, after);
}

export function clearMutationHistory(skillName?: string): void {
  if (skillName) {
    mutationStore.delete(skillName);
    configStore.delete(skillName);
  } else {
    mutationStore.clear();
    configStore.clear();
  }
}

export function saveMutationHistory(skillName: string, filePath: string): boolean {
  try {
    const history = mutationStore.get(skillName);
    if (!history) return false;

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      skillName: history.skillName,
      mutations: history.mutations,
      config: configStore.get(skillName) ?? {},
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function loadMutationHistory(skillName: string, filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (data.mutations) {
      mutationStore.set(skillName, {
        skillName: data.skillName || skillName,
        mutations: data.mutations,
      });
    }
    if (data.config) {
      configStore.set(skillName, data.config);
    }

    return true;
  } catch {
    return false;
  }
}

export function patchSkillConfigEntry(
  skillName: string,
  patch: Record<string, unknown>,
): void {
  const current = getCurrentConfig(skillName);
  const next = { ...current, ...patch };
  configStore.set(skillName, next);

  const diff = deepDiff(current, next);
  if (diff.length > 0) {
    recordMutation(skillName, {
      type: 'update',
      changes: diff,
    } as any);
  }
}

export function updateSkillConfigEntry(
  skillName: string,
  key: string,
  value: unknown,
): void {
  patchSkillConfigEntry(skillName, { [key]: value });
}
