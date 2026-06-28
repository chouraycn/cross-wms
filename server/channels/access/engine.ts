/**
 * Access control decision engine.
 *
 * Evaluates inbound requests through the gate pipeline and produces
 * final access decisions.
 */
import type { AppConfig } from "../types.js";
import type {
  AccessGroupResolutionContext,
  ChannelIngressSender,
  Gate,
  GateResult,
  InboundAdmission,
  InboundDecision,
  InboundDecisionType,
} from "./types.js";
import { AccessGroupManager } from "./groups.js";
import { AllowlistManager } from "./allowlist.js";
import {
  createDefaultGates,
  EFFECT_PRIORITY,
  mergeGateResults,
} from "./gates.js";

/**
 * Access control engine parameters.
 */
export interface AccessControlEngineParams {
  /**
   * Access group manager instance.
   */
  groups: AccessGroupManager;
  /**
   * Allowlist manager instance.
   */
  allowlist: AllowlistManager;
  /**
   * Optional custom gates. If not provided, default gates are used.
   */
  gates?: Gate[];
}

/**
 * Evaluation parameters for inbound requests.
 */
export interface EvaluateParams {
  /**
   * The sender of the message.
   */
  sender: ChannelIngressSender;
  /**
   * The type of event (e.g., "message", "reaction", "button").
   */
  eventType: string;
  /**
   * Optional command to authorize.
   */
  command?: string;
  /**
   * App configuration for access control.
   */
  config: AppConfig;
}

/**
 * Access control engine for evaluating inbound access requests.
 */
export class AccessControlEngine {
  private groups: AccessGroupManager;
  private allowlist: AllowlistManager;
  private gates: Gate[];

  constructor(params: AccessControlEngineParams) {
    this.groups = params.groups;
    this.allowlist = params.allowlist;
    this.gates = params.gates ?? createDefaultGates();
  }

  /**
   * Builds the resolution context for gate evaluation.
   */
  private buildContext(params: EvaluateParams): AccessGroupResolutionContext {
    return {
      channelId: params.sender.channel,
      accountId: params.sender.accountId,
      sender: params.sender,
      eventType: params.eventType,
      command: params.command,
    };
  }

  /**
   * Evaluates an inbound request through the gate pipeline.
   * @param params - Evaluation parameters
   * @returns The inbound decision
   */
  async evaluate(params: EvaluateParams): Promise<InboundDecision> {
    const context = this.buildContext(params);
    const results: Array<{ gate: Gate; result: GateResult }> = [];

    // Evaluate all gates in order
    for (const gate of this.gates) {
      const result = await gate.evaluate(context);
      results.push({ gate, result });
    }

    // Find the decisive gate (first gate with non-allow effect)
    const sortedResults = [...results].sort(
      (a, b) => EFFECT_PRIORITY[a.result.effect] - EFFECT_PRIORITY[b.result.effect],
    );

    const decisive = sortedResults[0];
    const admission = this.effectToAdmission(decisive.result.effect);
    const decision = this.effectToDecisionType(decisive.result.effect);

    return {
      admission,
      decision,
      reasonCode: this.effectToReasonCode(decisive.gate.id, decisive.result.effect),
      reason: decisive.result.reason ?? "No reason provided",
      gateId: decisive.gate.id,
    };
  }

  /**
   * Converts a gate effect to an inbound admission.
   */
  private effectToAdmission(effect: GateResult["effect"]): InboundAdmission {
    switch (effect) {
      case "allow":
        return "dispatch";
      case "observe":
        return "observe";
      case "skip":
        return "skip";
      case "block-dispatch":
      case "block-command":
      case "ignore":
        return "drop";
      default:
        return "dispatch";
    }
  }

  /**
   * Converts a gate effect to a decision type.
   */
  private effectToDecisionType(effect: GateResult["effect"]): InboundDecisionType {
    switch (effect) {
      case "allow":
      case "observe":
      case "skip":
        return "allow";
      case "block-dispatch":
      case "block-command":
        return "block";
      case "ignore":
        return "block";
      default:
        return "allow";
    }
  }

  /**
   * Converts gate ID and effect to a reason code.
   */
  private effectToReasonCode(gateId: string, effect: GateResult["effect"]): string {
    const codeMap: Record<string, string> = {
      "route:block-dispatch": "route_blocked",
      "route:allow": "allowed",
      "sender:block-dispatch": "dm_policy_not_allowlisted",
      "sender:allow": "allowed",
      "command:block-command": "control_command_unauthorized",
      "command:allow": "command_authorized",
      "event:block-dispatch": "event_unauthorized",
      "event:allow": "event_authorized",
      "activation:skip": "activation_skipped",
      "activation:allow": "activation_allowed",
    };

    return codeMap[`${gateId}:${effect}`] ?? "no_policy_match";
  }

  /**
   * Checks if a decision should result in dispatch.
   * @param decision - The inbound decision
   * @returns True if the message should be dispatched
   */
  shouldDispatch(decision: InboundDecision): boolean {
    return decision.admission === "dispatch";
  }

  /**
   * Checks if a decision should result in observation only.
   * @param decision - The inbound decision
   * @returns True if the message should be observed
   */
  shouldObserve(decision: InboundDecision): boolean {
    return decision.admission === "observe";
  }

  /**
   * Checks if a decision should result in the message being skipped.
   * @param decision - The inbound decision
   * @returns True if the message should be skipped
   */
  shouldSkip(decision: InboundDecision): boolean {
    return decision.admission === "skip";
  }

  /**
   * Checks if a decision should result in the message being dropped.
   * @param decision - The inbound decision
   * @returns True if the message should be dropped
   */
  shouldDrop(decision: InboundDecision): boolean {
    return decision.admission === "drop";
  }

  /**
   * Adds a custom gate to the pipeline.
   * @param gate - The gate to add
   */
  addGate(gate: Gate): void {
    // Insert gate in correct stage order
    const stageOrder: Gate["stage"][] = ["route", "sender", "command", "event", "activation"];
    const insertIndex = stageOrder.findIndex((s) => s === gate.stage);

    if (insertIndex < 0) {
      this.gates.push(gate);
    } else {
      // Find the last gate with the same or lower stage
      let index = 0;
      for (let i = 0; i < this.gates.length; i++) {
        const gateStageIndex = stageOrder.indexOf(this.gates[i].stage);
        if (gateStageIndex > insertIndex) {
          index = i;
          break;
        }
        index = i + 1;
      }
      this.gates.splice(index, 0, gate);
    }
  }

  /**
   * Removes a gate by ID.
   * @param gateId - The gate ID to remove
   * @returns True if the gate was removed
   */
  removeGate(gateId: string): boolean {
    const index = this.gates.findIndex((g) => g.id === gateId);
    if (index >= 0) {
      this.gates.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Gets all registered gates.
   * @returns Array of gates
   */
  getGates(): Gate[] {
    return [...this.gates];
  }
}
