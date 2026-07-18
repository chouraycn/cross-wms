import type { CrestodianOverview } from './types.js';

export type CrestodianPlannerBackend = {
  id: string;
  label: string;
  type: 'local' | 'remote' | 'embedded';
  available: boolean;
  priority: number;
};

const KNOWN_BACKENDS: CrestodianPlannerBackend[] = [
  {
    id: 'local-model',
    label: 'Local Model',
    type: 'local',
    available: false,
    priority: 1,
  },
  {
    id: 'embedded-runtime',
    label: 'Embedded Runtime',
    type: 'embedded',
    available: false,
    priority: 2,
  },
  {
    id: 'rule-based',
    label: 'Rule Based',
    type: 'local',
    available: true,
    priority: 3,
  },
];

export function getCrestodianPlannerBackends(): CrestodianPlannerBackend[] {
  return [...KNOWN_BACKENDS].sort((a, b) => a.priority - b.priority);
}

export function selectCrestodianLocalPlannerBackends(
  _overview: CrestodianOverview,
): CrestodianPlannerBackend[] {
  return KNOWN_BACKENDS.filter((b) => b.available && b.type !== 'remote');
}

export function getBestAvailableBackend(): CrestodianPlannerBackend | null {
  const available = KNOWN_BACKENDS.filter((b) => b.available).sort((a, b) => a.priority - b.priority);
  return available[0] ?? null;
}

export function isBackendAvailable(backendId: string): boolean {
  return KNOWN_BACKENDS.some((b) => b.id === backendId && b.available);
}

export function setBackendAvailability(backendId: string, available: boolean): void {
  const backend = KNOWN_BACKENDS.find((b) => b.id === backendId);
  if (backend) {
    backend.available = available;
  }
}
