import type { PluginCapabilityKind } from './types.js';

export type PluginSlotKey = 'memory' | 'contextEngine';

type SlotPluginRecord = {
  id: string;
  kind?: PluginCapabilityKind | PluginCapabilityKind[];
};

const SLOT_BY_KIND: Record<PluginCapabilityKind, PluginSlotKey> = {
  tool: 'contextEngine',
  provider: 'contextEngine',
  'embedding-provider': 'contextEngine',
  'memory-host': 'memory',
  channel: 'contextEngine',
  hook: 'contextEngine',
  command: 'contextEngine',
  service: 'contextEngine',
};

const DEFAULT_SLOT_BY_KEY: Record<PluginSlotKey, string> = {
  memory: 'memory-core',
  contextEngine: 'legacy',
};

export function normalizeKinds(kind?: PluginCapabilityKind | PluginCapabilityKind[]): PluginCapabilityKind[] {
  if (!kind) {
    return [];
  }
  return Array.isArray(kind) ? kind : [kind];
}

export function hasKind(kind: PluginCapabilityKind | PluginCapabilityKind[] | undefined, target: PluginCapabilityKind): boolean {
  if (!kind) {
    return false;
  }
  return Array.isArray(kind) ? kind.includes(target) : kind === target;
}

export function kindsEqual(
  a: PluginCapabilityKind | PluginCapabilityKind[] | undefined,
  b: PluginCapabilityKind | PluginCapabilityKind[] | undefined,
): boolean {
  const aN = normalizeKinds(a).toSorted();
  const bN = normalizeKinds(b).toSorted();
  return aN.length === bN.length && aN.every((k, i) => k === bN[i]);
}

export function slotKeysForPluginKind(kind?: PluginCapabilityKind | PluginCapabilityKind[]): PluginSlotKey[] {
  return normalizeKinds(kind)
    .map((k) => SLOT_BY_KIND[k])
    .filter((k): k is PluginSlotKey => k != null);
}

export function defaultSlotIdForKey(slotKey: PluginSlotKey): string {
  return DEFAULT_SLOT_BY_KEY[slotKey];
}

export type SlotSelectionResult = {
  slots: Record<PluginSlotKey, string>;
  warnings: string[];
  changed: boolean;
};

export function applyExclusiveSlotSelection(params: {
  currentSlots: Record<PluginSlotKey, string>;
  selectedId: string;
  selectedKind?: PluginCapabilityKind | PluginCapabilityKind[];
  registry?: { plugins: SlotPluginRecord[] };
}): SlotSelectionResult {
  const slotKeys = slotKeysForPluginKind(params.selectedKind);
  if (slotKeys.length === 0) {
    return { slots: params.currentSlots, warnings: [], changed: false };
  }

  const warnings: string[] = [];
  const slots = { ...params.currentSlots };
  let anyChanged = false;

  for (const slotKey of slotKeys) {
    const prevSlot = slots[slotKey];
    slots[slotKey] = params.selectedId;

    const inferredPrevSlot = prevSlot ?? defaultSlotIdForKey(slotKey);
    if (inferredPrevSlot && inferredPrevSlot !== params.selectedId) {
      warnings.push(
        `Exclusive slot "${slotKey}" switched from "${inferredPrevSlot}" to "${params.selectedId}".`,
      );
    }

    if (prevSlot !== params.selectedId) {
      anyChanged = true;
    }
  }

  if (!anyChanged) {
    return { slots: params.currentSlots, warnings: [], changed: false };
  }

  return {
    slots,
    warnings,
    changed: true,
  };
}