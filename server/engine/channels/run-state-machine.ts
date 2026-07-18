import { logger } from "../../logger.js";

export type RunState =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "stopping"
  | "stopped"
  | "error"
  | "recovering";

export interface StateMachineTransition {
  from: RunState;
  to: RunState;
  action?: string;
}

export interface RunStateMachine {
  id: string;
  state: RunState;
  previousState?: RunState;
  transitions: StateMachineTransition[];
  startedAt?: number;
  stoppedAt?: number;
  error?: string;
  metadata: Record<string, unknown>;
}

type StateListener = (state: RunState, previousState?: RunState) => void;

const stateMachines = new Map<string, RunStateMachine>();
const stateListeners = new Map<string, Set<StateListener>>();

const validTransitions: Array<{ from: RunState; to: RunState[] }> = [
  { from: "idle", to: ["starting"] },
  { from: "starting", to: ["running", "error", "stopping"] },
  { from: "running", to: ["paused", "stopping", "error"] },
  { from: "paused", to: ["running", "stopping", "error"] },
  { from: "stopping", to: ["stopped", "error"] },
  { from: "stopped", to: ["starting"] },
  { from: "error", to: ["recovering", "stopped"] },
  { from: "recovering", to: ["running", "error", "stopped"] },
];

export function createRunStateMachine(id: string): RunStateMachine {
  const machine: RunStateMachine = {
    id,
    state: "idle",
    transitions: [],
    metadata: {},
  };

  stateMachines.set(id, machine);
  stateListeners.set(id, new Set());
  logger.debug(`[Channels:RunStateMachine] Created state machine ${id}`);
  return machine;
}

export function getRunStateMachine(id: string): RunStateMachine | undefined {
  return stateMachines.get(id);
}

export function transitionState(
  id: string,
  nextState: RunState,
  options?: {
    action?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  }
): { success: boolean; reason?: string } {
  const machine = stateMachines.get(id);
  if (!machine) {
    return { success: false, reason: `State machine not found: ${id}` };
  }

  if (!canTransition(machine.state, nextState)) {
    return {
      success: false,
      reason: `Invalid transition: ${machine.state} -> ${nextState}`,
    };
  }

  const previousState = machine.state;
  machine.state = nextState;
  machine.previousState = previousState;
  machine.transitions.push({
    from: previousState,
    to: nextState,
    action: options?.action,
  });

  if (nextState === "running" && !machine.startedAt) {
    machine.startedAt = Date.now();
  }

  if (nextState === "stopped") {
    machine.stoppedAt = Date.now();
  }

  if (options?.error) {
    machine.error = options.error;
  }

  if (options?.metadata) {
    Object.assign(machine.metadata, options.metadata);
  }

  logger.debug(`[Channels:RunStateMachine] ${id}: ${previousState} -> ${nextState}`);

  const listeners = stateListeners.get(id);
  if (listeners) {
    for (const listener of listeners) {
      try {
        listener(nextState, previousState);
      } catch (err) {
        logger.error(`[Channels:RunStateMachine] Listener error for ${id}`, { error: err });
      }
    }
  }

  return { success: true };
}

export function canTransition(current: RunState, next: RunState): boolean {
  const entry = validTransitions.find((t) => t.from === current);
  return entry ? entry.to.includes(next) : false;
}

export function addStateListener(id: string, listener: StateListener): () => void {
  let listeners = stateListeners.get(id);
  if (!listeners) {
    listeners = new Set();
    stateListeners.set(id, listeners);
  }

  listeners.add(listener);
  return () => listeners!.delete(listener);
}

export function getState(id: string): RunState | undefined {
  return stateMachines.get(id)?.state;
}

export function isRunning(id: string): boolean {
  return stateMachines.get(id)?.state === "running";
}

export function isStopped(id: string): boolean {
  const state = stateMachines.get(id)?.state;
  return state === "stopped" || state === "idle";
}

export function isInError(id: string): boolean {
  return stateMachines.get(id)?.state === "error";
}

export function removeStateMachine(id: string): boolean {
  stateListeners.delete(id);
  return stateMachines.delete(id);
}

export function clearStateMachines(): void {
  stateMachines.clear();
  stateListeners.clear();
}

export function getValidTransitions(current: RunState): RunState[] {
  const entry = validTransitions.find((t) => t.from === current);
  return entry ? [...entry.to] : [];
}
