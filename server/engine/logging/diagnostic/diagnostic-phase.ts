import { formatTimestamp } from '../timestamps.js';

export type DiagnosticPhase = {
  name: string;
  startedAt: number;
  durationMs?: number;
  completed: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
};

type DiagnosticPhaseStack = {
  phases: DiagnosticPhase[];
  currentPhase?: DiagnosticPhase;
};

const phaseStack: DiagnosticPhaseStack = {
  phases: [],
};

export function startDiagnosticPhase(name: string, metadata?: Record<string, unknown>): void {
  const phase: DiagnosticPhase = {
    name,
    startedAt: Date.now(),
    completed: false,
    metadata,
  };
  phaseStack.currentPhase = phase;
  phaseStack.phases.push(phase);
  if (phaseStack.phases.length > 100) {
    phaseStack.phases.shift();
  }
}

export function endDiagnosticPhase(name: string, error?: string): void {
  const phase = phaseStack.phases.find(p => p.name === name && !p.completed);
  if (phase) {
    phase.completed = true;
    phase.durationMs = Date.now() - phase.startedAt;
    phase.error = error;
  }
  if (phaseStack.currentPhase?.name === name) {
    phaseStack.currentPhase = undefined;
  }
}

export function getCurrentDiagnosticPhase(): string | undefined {
  return phaseStack.currentPhase?.name;
}

export function getRecentDiagnosticPhases(limit: number = 10): DiagnosticPhase[] {
  return phaseStack.phases.slice(-limit);
}

export function getDiagnosticPhaseDuration(name: string): number | undefined {
  const phase = phaseStack.phases.find(p => p.name === name);
  if (!phase) return undefined;
  return phase.durationMs ?? (Date.now() - phase.startedAt);
}

export function resetDiagnosticPhasesForTest(): void {
  phaseStack.phases = [];
  phaseStack.currentPhase = undefined;
}

export function formatDiagnosticPhaseSummary(phases: DiagnosticPhase[]): string {
  return phases
    .map(phase => {
      const duration = phase.durationMs ?? (Date.now() - phase.startedAt);
      const status = phase.completed ? (phase.error ? 'failed' : 'done') : 'active';
      return `${phase.name}:${Math.round(duration)}ms[${status}]`;
    })
    .join(',');
}
