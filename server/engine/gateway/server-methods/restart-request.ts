// @ts-nocheck
// Restart request parsing keeps restart sentinel payloads limited to resumable
// session, delivery, thread, and delay fields.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { stringifyRouteThreadId } from "../../plugin-sdk/channel-route.js";

type RestartDeliveryContext = {
  channel?: string;
  to?: string;
  accountId?: string;
};

function parseRestartDeliveryContext(params: any): {
  deliveryContext: RestartDeliveryContext | undefined;
  threadId: string | undefined;
} {
  const raw = (params as { deliveryContext?: any }).deliveryContext;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { deliveryContext: undefined, threadId: undefined };
  }
  const context = raw as {
    channel?: any;
    to?: any;
    accountId?: any;
    threadId?: any;
  };
  const deliveryContext: RestartDeliveryContext = {
    channel: normalizeOptionalString(context.channel),
    to: normalizeOptionalString(context.to),
    accountId: normalizeOptionalString(context.accountId),
  };
  const normalizedContext =
    deliveryContext.channel || deliveryContext.to || deliveryContext.accountId
      ? deliveryContext
      : undefined;
  const threadId = stringifyRouteThreadId(context.threadId);
  return { deliveryContext: normalizedContext, threadId };
}

// Restart sentinels can resume a channel turn after the gateway comes back.
// Keep only routable delivery fields plus a normalized thread id so malformed
// UI/tool payloads do not leak arbitrary data into the sentinel file.
export function parseRestartRequestParams(params: any): {
  sessionKey: string | undefined;
  deliveryContext: RestartDeliveryContext | undefined;
  threadId: string | undefined;
  note: string | undefined;
  continuationMessage: string | undefined;
  restartDelayMs: number | undefined;
} {
  const sessionKey = normalizeOptionalString((params as { sessionKey?: any }).sessionKey);
  const { deliveryContext, threadId } = parseRestartDeliveryContext(params);
  const note = normalizeOptionalString((params as { note?: any }).note);
  const continuationMessage = normalizeOptionalString(
    (params as { continuationMessage?: any }).continuationMessage,
  );
  const restartDelayMsRaw = (params as { restartDelayMs?: any }).restartDelayMs;
  const restartDelayMs =
    typeof restartDelayMsRaw === "number" && Number.isFinite(restartDelayMsRaw)
      ? Math.max(0, Math.floor(restartDelayMsRaw))
      : undefined;
  return { sessionKey, deliveryContext, threadId, note, continuationMessage, restartDelayMs };
}
