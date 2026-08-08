// Shares SQLite row mapping helpers between task registry persistence modules.
import { isRecord } from "../shared/safe-record.js";
import {
  normalizeDeliveryContext,
  type DeliveryContext,
} from "../channels/delivery-context.js";

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Persisted JSON columns are typed by the receiving field.
function parseSqliteJsonValue<T>(raw: string | null): T | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function parseDeliveryContextJson(raw: string | null): DeliveryContext | undefined {
  const parsed = parseSqliteJsonValue<any>(raw);
  if (!isRecord(parsed)) {
    return undefined;
  }
  return normalizeDeliveryContext({
    channel: typeof parsed.channel === "string" ? parsed.channel : undefined,
    to: typeof parsed.to === "string" ? parsed.to : undefined,
    accountId: typeof parsed.accountId === "string" ? parsed.accountId : undefined,
    threadId:
      typeof parsed.threadId === "string" || typeof parsed.threadId === "number"
        ? parsed.threadId
        : undefined,
  });
}
