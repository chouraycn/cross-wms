/**
 * sessions_send agent-to-agent reply flow.
 *
 * Runs bounded ping-pong delivery, waits for target replies, and suppresses control-token messages.
 *
 * Ported from openclaw/src/agents/tools/sessions-send-tool.a2a.ts.
 *
 * cross-wms adjustments:
 * - cross-wms `agents/run-wait.js` is a generic wait/poll utility and does not export
 *   `AssistantReplySnapshot` / `readLatestAssistantReplySnapshot` / `waitForAgentRun`.
 *   Local stubs are defined below: `waitForAgentRunStub` returns a non-ok status and
 *   `readLatestAssistantReplySnapshotStub` returns an empty snapshot, so the A2A flow
 *   becomes a no-op (no replies detected, no announcements delivered).
 * - cross-wms `sessions-send-helpers.js` is a degraded stub: `buildAgentToAgentReplyContext`
 *   and `buildAgentToAgentAnnounceContext` take no args and return `null`. They are cast
 *   to the openclaw signatures. The sentinel-token helpers (`isAnnounceSkip`,
 *   `isNonDeliverableSessionsReply`, `isReplySkip`) are imported directly from
 *   `sessions-send-tokens.js` (cross-wms `sessions-send-helpers.js` does not re-export them).
 * - cross-wms `sessions-announce-target.js` `resolveAnnounceTarget` returns `unknown`;
 *   cast to `AnnounceTarget | null` so the action's optional chaining type-checks.
 */
import crypto from "node:crypto";
import type { CallGatewayOptions } from "../../gateway/call.js";
import { callGateway } from "../../gateway/call.js";
import { formatErrorMessage } from "../../infra/errors.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { resolveNestedAgentLaneForSession } from "../lanes.js";
import { runAgentStep } from "../agent-step.js";
import { resolveAnnounceTarget } from "../sessions-announce-target.js";
import {
  buildAgentToAgentAnnounceContext,
  buildAgentToAgentReplyContext,
  type AnnounceTarget,
} from "../sessions-send-helpers.js";
import {
  isAnnounceSkip,
  isNonDeliverableSessionsReply,
  isReplySkip,
} from "../sessions-send-tokens.js";

const log = createSubsystemLogger("agents/sessions-send");

type GatewayCaller = <T = unknown>(opts: CallGatewayOptions) => Promise<T>;

// --- Local stubs for openclaw `agents/run-wait.js` functions not present in cross-wms ---

/** Snapshot of the latest assistant reply (stub — cross-wms has no run-wait helpers). */
type AssistantReplySnapshot = {
  text?: string;
  fingerprint?: string;
};

/** Result of waiting for an agent run (stub — always non-ok in cross-wms). */
type AgentWaitResult = {
  status: "ok" | "timeout" | "error" | "pending";
  error?: string;
};

/**
 * Stub for `waitForAgentRun` from openclaw `agents/run-wait.js`.
 * cross-wms has no agent-run wait infrastructure; returns `timeout` so the A2A flow
 * treats the target as non-responsive and skips reply/announce delivery.
 */
async function waitForAgentRun(_params: {
  runId: string;
  timeoutMs: number;
  callGateway?: GatewayCaller;
}): Promise<AgentWaitResult> {
  return { status: "timeout" };
}

/**
 * Stub for `readLatestAssistantReplySnapshot` from openclaw `agents/run-wait.js`.
 * cross-wms has no transcript reader; returns an empty snapshot so no reply text is
 * detected by the A2A flow.
 */
async function readLatestAssistantReplySnapshot(_params: {
  sessionKey: string;
  limit?: number;
  callGateway?: GatewayCaller;
}): Promise<AssistantReplySnapshot> {
  return {};
}

// --- Casts for cross-wms stub helpers that take no args / return unknown ---

const buildReplyContext = buildAgentToAgentReplyContext as unknown as (params: {
  requesterSessionKey?: string;
  requesterChannel?: GatewayMessageChannel;
  targetSessionKey: string;
  targetChannel: string;
  currentRole: "requester" | "target";
  turn: number;
  maxTurns: number;
}) => string;

const buildAnnounceContext = buildAgentToAgentAnnounceContext as unknown as (params: {
  requesterSessionKey?: string;
  requesterChannel?: GatewayMessageChannel;
  targetSessionKey: string;
  targetChannel: string;
  originalMessage: string;
  roundOneReply?: string;
  latestReply?: string;
}) => string;

const resolveAnnounceTargetTyped = resolveAnnounceTarget as unknown as (params: {
  sessionKey: string;
  displayKey: string;
}) => Promise<AnnounceTarget | null>;

const defaultSessionsSendA2ADeps = {
  callGateway: async <T = unknown>(opts: CallGatewayOptions): Promise<T> => {
    return callGateway<T>(opts);
  },
};

let sessionsSendA2ADeps: {
  callGateway: GatewayCaller;
} = defaultSessionsSendA2ADeps;

async function deliverAnnounceReply(params: {
  announceTarget: AnnounceTarget;
  message: string;
  runContextId: string;
}) {
  const message = params.message.trim();
  if (!message) {
    return;
  }
  try {
    await sessionsSendA2ADeps.callGateway({
      method: "send",
      params: {
        to: params.announceTarget.to,
        message,
        channel: params.announceTarget.channel,
        accountId: params.announceTarget.accountId,
        threadId: params.announceTarget.threadId,
        idempotencyKey: crypto.randomUUID(),
      },
      timeoutMs: 10_000,
    });
  } catch (err) {
    log.warn("sessions_send announce delivery failed", {
      runId: params.runContextId,
      channel: params.announceTarget.channel,
      to: params.announceTarget.to,
      error: formatErrorMessage(err),
    });
  }
}

export async function runSessionsSendA2AFlow(params: {
  targetSessionKey: string;
  displayKey: string;
  message: string;
  announceTimeoutMs: number;
  maxPingPongTurns: number;
  requesterSessionKey?: string;
  requesterChannel?: GatewayMessageChannel;
  baseline?: AssistantReplySnapshot;
  roundOneReply?: string;
  waitRunId?: string;
}) {
  const runContextId = params.waitRunId ?? "unknown";
  try {
    let primaryReply = params.roundOneReply;
    let latestReply = params.roundOneReply;
    if (!primaryReply && params.waitRunId) {
      const wait = await waitForAgentRun({
        runId: params.waitRunId,
        timeoutMs: Math.min(params.announceTimeoutMs, 60_000),
        callGateway: sessionsSendA2ADeps.callGateway,
      });
      if (wait.status === "ok") {
        const latestSnapshot = await readLatestAssistantReplySnapshot({
          sessionKey: params.targetSessionKey,
          callGateway: sessionsSendA2ADeps.callGateway,
        });
        const baselineFingerprint = params.baseline?.fingerprint;
        primaryReply =
          latestSnapshot.text &&
          (!baselineFingerprint || latestSnapshot.fingerprint !== baselineFingerprint)
            ? latestSnapshot.text
            : undefined;
        latestReply = primaryReply;
      }
    }
    if (!latestReply) {
      return;
    }
    if (isNonDeliverableSessionsReply(latestReply)) {
      return;
    }

    const announceTarget = await resolveAnnounceTargetTyped({
      sessionKey: params.targetSessionKey,
      displayKey: params.displayKey,
    });
    const targetChannel = announceTarget?.channel ?? "unknown";

    // A same-session send is a human-facing source-channel reply, not a true
    // agent-to-agent announcement. Asking the same session to decide whether to
    // announce can learn stale ANNOUNCE_SKIP patterns from its own history and
    // silently drop a normal channel response.
    if (
      announceTarget &&
      params.requesterSessionKey &&
      params.requesterSessionKey === params.targetSessionKey &&
      params.requesterChannel === announceTarget.channel
    ) {
      if (params.waitRunId && !params.roundOneReply && !params.baseline) {
        return;
      }
      await deliverAnnounceReply({
        announceTarget,
        message: latestReply,
        runContextId,
      });
      return;
    }

    if (
      params.maxPingPongTurns > 0 &&
      params.requesterSessionKey &&
      params.requesterSessionKey !== params.targetSessionKey
    ) {
      let currentSessionKey = params.requesterSessionKey;
      let nextSessionKey = params.targetSessionKey;
      let incomingMessage = latestReply;
      for (let turn = 1; turn <= params.maxPingPongTurns; turn += 1) {
        const currentRole =
          currentSessionKey === params.requesterSessionKey ? "requester" : "target";
        const replyPrompt = buildReplyContext({
          requesterSessionKey: params.requesterSessionKey,
          requesterChannel: params.requesterChannel,
          targetSessionKey: params.displayKey,
          targetChannel,
          currentRole,
          turn,
          maxTurns: params.maxPingPongTurns,
        });
        const replyText = await runAgentStep({
          sessionKey: currentSessionKey,
          message: incomingMessage,
          extraSystemPrompt: replyPrompt,
          timeoutMs: params.announceTimeoutMs,
          lane: resolveNestedAgentLaneForSession(currentSessionKey),
          sourceSessionKey: nextSessionKey,
          sourceChannel:
            nextSessionKey === params.requesterSessionKey ? params.requesterChannel : targetChannel,
          sourceTool: "sessions_send",
        });
        if (!replyText || isReplySkip(replyText) || isNonDeliverableSessionsReply(replyText)) {
          break;
        }
        latestReply = replyText;
        incomingMessage = replyText;
        const swap = currentSessionKey;
        currentSessionKey = nextSessionKey;
        nextSessionKey = swap;
      }
    }

    const announcePrompt = buildAnnounceContext({
      requesterSessionKey: params.requesterSessionKey,
      requesterChannel: params.requesterChannel,
      targetSessionKey: params.displayKey,
      targetChannel,
      originalMessage: params.message,
      roundOneReply: primaryReply,
      latestReply,
    });
    const announceReply = await runAgentStep({
      sessionKey: params.targetSessionKey,
      message: "Agent-to-agent announce step.",
      extraSystemPrompt: announcePrompt,
      timeoutMs: params.announceTimeoutMs,
      lane: resolveNestedAgentLaneForSession(params.targetSessionKey),
      transcriptMessage: "",
      sourceSessionKey: params.requesterSessionKey,
      sourceChannel: params.requesterChannel,
      sourceTool: "sessions_send",
    });
    if (
      announceTarget &&
      announceReply &&
      announceReply.trim() &&
      !isAnnounceSkip(announceReply) &&
      !isNonDeliverableSessionsReply(announceReply)
    ) {
      await deliverAnnounceReply({
        announceTarget,
        message: announceReply,
        runContextId,
      });
    }
  } catch (err) {
    log.warn("sessions_send announce flow failed", {
      runId: runContextId,
      error: formatErrorMessage(err),
    });
  }
}

export const testing = {
  setDepsForTest(overrides?: Partial<{ callGateway: GatewayCaller }>) {
    sessionsSendA2ADeps = overrides
      ? {
          ...defaultSessionsSendA2ADeps,
          ...overrides,
        }
      : defaultSessionsSendA2ADeps;
  },
};
export { testing as __testing };
