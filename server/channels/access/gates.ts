/**
 * Gate definitions for access control evaluation pipeline.
 *
 * Gates evaluate different aspects of inbound access including route matching,
 * sender validation, command authorization, and event type checking.
 */
import type { AccessGroupResolutionContext, Gate, GateEffect, GateResult, GateStage } from "./types.js";

/**
 * Route gate - evaluates whether the route/channel is accessible.
 */
export class RouteGate implements Gate {
  readonly id = "route";
  readonly stage: GateStage = "route";

  async evaluate(context: AccessGroupResolutionContext): Promise<GateResult> {
    // Route gates evaluate channel-specific routing rules
    // By default, allow all routes
    return { effect: "allow", reason: "Route allowed" };
  }
}

/**
 * Sender gate - evaluates whether the sender is authorized.
 */
export class SenderGate implements Gate {
  readonly id = "sender";
  readonly stage: GateStage = "sender";

  async evaluate(context: AccessGroupResolutionContext): Promise<GateResult> {
    // Sender gates evaluate sender allowlist membership
    // By default, allow all senders
    return { effect: "allow", reason: "Sender allowed" };
  }
}

/**
 * Command gate - evaluates whether the command is authorized.
 */
export class CommandGate implements Gate {
  readonly id = "command";
  readonly stage: GateStage = "command";

  async evaluate(context: AccessGroupResolutionContext): Promise<GateResult> {
    // If no command is provided, allow
    if (!context.command) {
      return { effect: "allow", reason: "No command to authorize" };
    }

    // Command gates evaluate command authorization
    // By default, allow all commands
    return { effect: "allow", reason: "Command authorized" };
  }
}

/**
 * Event gate - evaluates whether the event type is authorized.
 */
export class EventGate implements Gate {
  readonly id = "event";
  readonly stage: GateStage = "event";

  async evaluate(context: AccessGroupResolutionContext): Promise<GateResult> {
    // Event gates evaluate event type authorization
    // By default, allow all events
    return { effect: "allow", reason: "Event authorized" };
  }
}

/**
 * Activation gate - evaluates whether the message should be activated/processed.
 */
export class ActivationGate implements Gate {
  readonly id = "activation";
  readonly stage: GateStage = "activation";

  async evaluate(context: AccessGroupResolutionContext): Promise<GateResult> {
    // Activation gates determine if the message should be processed
    // By default, allow activation
    return { effect: "allow", reason: "Activation allowed" };
  }
}

/**
 * Factory for creating default gates.
 */
export function createDefaultGates(): Gate[] {
  return [
    new RouteGate(),
    new SenderGate(),
    new CommandGate(),
    new EventGate(),
    new ActivationGate(),
  ];
}

/**
 * Effect priority for resolving conflicting gate results.
 * Lower values = higher priority.
 */
export const EFFECT_PRIORITY: Record<GateEffect, number> = {
  "block-dispatch": 0,
  "block-command": 1,
  ignore: 2,
  skip: 3,
  observe: 4,
  allow: 5,
};

/**
 * Merges multiple gate results into a single result.
 * Uses effect priority to resolve conflicts.
 * @param results - Array of gate results to merge
 * @returns The merged result
 */
export function mergeGateResults(results: GateResult[]): GateResult {
  if (results.length === 0) {
    return { effect: "allow" };
  }

  // Sort by priority and return the lowest priority effect
  const sorted = [...results].sort(
    (a, b) => EFFECT_PRIORITY[a.effect] - EFFECT_PRIORITY[b.effect],
  );

  return sorted[0];
}
