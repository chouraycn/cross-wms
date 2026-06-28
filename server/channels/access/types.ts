/**
 * Access control layer types.
 *
 * Defines access decision types, identifiers, and core abstractions
 * for validating inbound messages.
 */
import type { AccountId, ChannelId } from "../types.js";

// =============================================================================
// Access Decision Types
// =============================================================================

/**
 * Runtime admission action for an inbound event.
 */
export type InboundAdmission = "dispatch" | "observe" | "skip" | "drop";

/**
 * High-level decision category.
 */
export type InboundDecisionType = "allow" | "block" | "pairing";

/**
 * Complete access decision for an inbound event.
 */
export interface InboundDecision {
  admission: InboundAdmission;
  decision: InboundDecisionType;
  reasonCode: string;
  reason: string;
  gateId: string;
}

// =============================================================================
// Access Identifiers
// =============================================================================

/**
 * Identifier category used in allowlist matching and access group membership.
 */
export type ChannelIngressIdentifierKind =
  | "stable-id"
  | "username"
  | "email"
  | "phone"
  | "role";

/**
 * Public identifier material that can participate in allowlist matching.
 */
export interface ChannelIngressIdentifier {
  kind: ChannelIngressIdentifierKind;
  value: string;
  /**
   * Whether this identifier is considered potentially dangerous.
   */
  dangerous?: boolean;
  /**
   * Sensitivity level of the identifier value.
   */
  sensitivity?: "normal" | "pii";
}

/**
 * Sender representation used by the access control layer.
 */
export interface ChannelIngressSender {
  identifiers: ChannelIngressIdentifier[];
  channel: ChannelId;
  accountId: AccountId;
}

// =============================================================================
// Access Group Types
// =============================================================================

/**
 * Access group with optional dynamic membership resolution.
 */
export interface AccessGroup {
  id: string;
  name: string;
  members: ChannelIngressIdentifier[];
  /**
   * Whether this group uses dynamic membership resolution.
   * If true, members are resolved at runtime via AccessGroupManager.resolveDynamicGroup.
   */
  dynamic?: boolean;
}

/**
 * Access group membership resolution context.
 */
export interface AccessGroupResolutionContext {
  channelId: ChannelId;
  accountId: AccountId;
  sender: ChannelIngressSender;
  eventType: string;
  command?: string;
}

// =============================================================================
// Allowlist Types
// =============================================================================

/**
 * Allowlist organized by channel kind.
 */
export interface Allowlist {
  /**
   * Identifiers allowed for direct/private messages.
   */
  dm: ChannelIngressIdentifier[];
  /**
   * Identifiers allowed for group channels.
   */
  group: ChannelIngressIdentifier[];
}

// =============================================================================
// Gate Types
// =============================================================================

/**
 * Ordered phase for a gate in the access evaluation pipeline.
 */
export type GateStage = "route" | "sender" | "command" | "event" | "activation";

/**
 * Effect produced by a gate when computing final ingress admission.
 */
export type GateEffect =
  | "allow"
  | "block-dispatch"
  | "block-command"
  | "skip"
  | "observe"
  | "ignore";

/**
 * Gate evaluation result.
 */
export interface GateResult {
  effect: GateEffect;
  reason?: string;
}

/**
 * Gate identifier and metadata.
 */
export interface Gate {
  id: string;
  stage: GateStage;
  evaluate(params: AccessGroupResolutionContext): Promise<GateResult>;
}

// =============================================================================
// Reason Codes
// =============================================================================

/**
 * Stable machine-readable reason codes for access diagnostics.
 */
export type AccessReasonCode =
  | "allowed"
  | "route_blocked"
  | "dm_policy_disabled"
  | "dm_policy_open"
  | "dm_policy_allowlisted"
  | "dm_policy_pairing_required"
  | "dm_policy_not_allowlisted"
  | "group_policy_disabled"
  | "group_policy_open"
  | "group_policy_allowed"
  | "group_policy_empty_allowlist"
  | "group_policy_not_allowlisted"
  | "command_authorized"
  | "control_command_unauthorized"
  | "event_authorized"
  | "event_unauthorized"
  | "event_pairing_not_allowed"
  | "sender_not_required"
  | "origin_subject_missing"
  | "origin_subject_not_matched"
  | "activation_allowed"
  | "activation_skipped"
  | "access_group_missing"
  | "access_group_unsupported"
  | "access_group_failed"
  | "mutable_identifier_disabled"
  | "no_policy_match";

export const ACCESS_REASON_MESSAGES: Record<AccessReasonCode, string> = {
  allowed: "Access allowed",
  route_blocked: "Route blocked access",
  dm_policy_disabled: "Direct message policy is disabled",
  dm_policy_open: "Direct message policy is open",
  dm_policy_allowlisted: "Sender is in DM allowlist",
  dm_policy_pairing_required: "Pairing required for direct message",
  dm_policy_not_allowlisted: "Sender is not in DM allowlist",
  group_policy_disabled: "Group policy is disabled",
  group_policy_open: "Group policy is open",
  group_policy_allowed: "Sender is in group allowlist",
  group_policy_empty_allowlist: "Group allowlist is empty",
  group_policy_not_allowlisted: "Sender is not in group allowlist",
  command_authorized: "Command authorized",
  control_command_unauthorized: "Control command not authorized",
  event_authorized: "Event authorized",
  event_unauthorized: "Event not authorized",
  event_pairing_not_allowed: "Event pairing not allowed",
  sender_not_required: "Sender not required",
  origin_subject_missing: "Origin subject missing",
  origin_subject_not_matched: "Origin subject not matched",
  activation_allowed: "Activation allowed",
  activation_skipped: "Activation skipped",
  access_group_missing: "Access group missing",
  access_group_unsupported: "Access group type not supported",
  access_group_failed: "Access group resolution failed",
  mutable_identifier_disabled: "Mutable identifier matching disabled",
  no_policy_match: "No policy matched",
};
