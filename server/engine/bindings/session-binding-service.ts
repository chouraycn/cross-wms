import { normalizeAccountId } from "../routing/account-id.js";
import type {
  ConversationRef,
  SessionBindingBindInput,
  SessionBindingCapabilities,
  SessionBindingErrorCode,
  SessionBindingPlacement,
  SessionBindingRecord,
  SessionBindingUnbindInput,
  SessionBindingAdapter,
} from "./types.js";

export type {
  BindingTargetKind,
  BindingStatus,
  ConversationRef,
  SessionBindingBindInput,
  SessionBindingCapabilities,
  SessionBindingErrorCode,
  SessionBindingPlacement,
  SessionBindingRecord,
  SessionBindingUnbindInput,
  SessionBindingAdapter,
} from "./types.js";

export class SessionBindingError extends Error {
  constructor(
    public readonly code: SessionBindingErrorCode,
    message: string,
    public readonly details?: {
      channel?: string;
      accountId?: string;
      placement?: SessionBindingPlacement;
    },
  ) {
    super(message);
    this.name = "SessionBindingError";
  }
}

export function isSessionBindingError(error: unknown): error is SessionBindingError {
  return error instanceof SessionBindingError;
}

export type SessionBindingService = {
  bind: (input: SessionBindingBindInput) => Promise<SessionBindingRecord>;
  getCapabilities: (params: { channel: string; accountId: string }) => SessionBindingCapabilities;
  listBySession: (targetSessionKey: string) => SessionBindingRecord[];
  resolveByConversation: (ref: ConversationRef) => SessionBindingRecord | null;
  touch: (bindingId: string, at?: number) => void;
  unbind: (input: SessionBindingUnbindInput) => Promise<SessionBindingRecord[]>;
};

function toAdapterKey(params: { channel: string; accountId: string }): string {
  return `${params.channel.toLowerCase()}:${normalizeAccountId(params.accountId)}`;
}

function normalizePlacement(raw: unknown): SessionBindingPlacement | undefined {
  return raw === "current" || raw === "child" ? raw : undefined;
}

function inferDefaultPlacement(ref: ConversationRef): SessionBindingPlacement {
  return ref.conversationId ? "current" : "child";
}

function resolveAdapterPlacements(adapter: SessionBindingAdapter): SessionBindingPlacement[] {
  const configured = adapter.capabilities?.placements?.map((value) => normalizePlacement(value));
  const placements = configured?.filter((value): value is SessionBindingPlacement =>
    Boolean(value),
  );
  if (placements && placements.length > 0) {
    return [...new Set(placements)];
  }
  return ["current", "child"];
}

function resolveAdapterCapabilities(
  adapter: SessionBindingAdapter | null,
): SessionBindingCapabilities {
  if (!adapter) {
    return {
      adapterAvailable: false,
      bindSupported: false,
      unbindSupported: false,
      placements: [],
    };
  }
  const bindSupported = adapter.capabilities?.bindSupported ?? Boolean(adapter.bind);
  return {
    adapterAvailable: true,
    bindSupported,
    unbindSupported: adapter.capabilities?.unbindSupported ?? Boolean(adapter.unbind),
    placements: bindSupported ? resolveAdapterPlacements(adapter) : [],
  };
}

const SESSION_BINDING_ADAPTERS_KEY = Symbol.for("cross-wms.sessionBinding.adapters");

type SessionBindingAdapterRegistration = {
  adapter: SessionBindingAdapter;
  normalizedAdapter: SessionBindingAdapter;
};

const ADAPTERS_BY_CHANNEL_ACCOUNT = (globalThis as unknown as {
  [key: symbol]: Map<string, SessionBindingAdapterRegistration[]>;
})[SESSION_BINDING_ADAPTERS_KEY] ?? new Map<string, SessionBindingAdapterRegistration[]>();

if (!(SESSION_BINDING_ADAPTERS_KEY in globalThis)) {
  (globalThis as unknown as { [key: symbol]: Map<string, SessionBindingAdapterRegistration[]> })[SESSION_BINDING_ADAPTERS_KEY] = ADAPTERS_BY_CHANNEL_ACCOUNT;
}

function getActiveAdapterForKey(key: string): SessionBindingAdapter | null {
  const registrations = ADAPTERS_BY_CHANNEL_ACCOUNT.get(key);
  return registrations?.at(-1)?.normalizedAdapter ?? null;
}

export function registerSessionBindingAdapter(adapter: SessionBindingAdapter): void {
  const normalizedAdapter = {
    ...adapter,
    channel: adapter.channel.toLowerCase(),
    accountId: normalizeAccountId(adapter.accountId),
  };
  const key = toAdapterKey({
    channel: normalizedAdapter.channel,
    accountId: normalizedAdapter.accountId,
  });
  const existing = ADAPTERS_BY_CHANNEL_ACCOUNT.get(key);
  const registrations = existing ? [...existing] : [];
  registrations.push({
    adapter,
    normalizedAdapter,
  });
  ADAPTERS_BY_CHANNEL_ACCOUNT.set(key, registrations);
}

export function unregisterSessionBindingAdapter(params: {
  channel: string;
  accountId: string;
  adapter?: SessionBindingAdapter;
}): void {
  const key = toAdapterKey(params);
  const registrations = ADAPTERS_BY_CHANNEL_ACCOUNT.get(key);
  if (!registrations || registrations.length === 0) {
    return;
  }
  const nextRegistrations = [...registrations];
  if (params.adapter) {
    const registrationIndex = nextRegistrations.findLastIndex(
      (registration) => registration.adapter === params.adapter,
    );
    if (registrationIndex < 0) {
      return;
    }
    nextRegistrations.splice(registrationIndex, 1);
  } else {
    nextRegistrations.pop();
  }
  if (nextRegistrations.length === 0) {
    ADAPTERS_BY_CHANNEL_ACCOUNT.delete(key);
    return;
  }
  ADAPTERS_BY_CHANNEL_ACCOUNT.set(key, nextRegistrations);
}

function resolveAdapterForConversation(ref: ConversationRef): SessionBindingAdapter | null {
  return resolveAdapterForChannelAccount({
    channel: ref.channel,
    accountId: ref.accountId,
  });
}

function resolveAdapterForChannelAccount(params: {
  channel: string;
  accountId: string;
}): SessionBindingAdapter | null {
  const key = toAdapterKey({
    channel: params.channel,
    accountId: params.accountId,
  });
  return getActiveAdapterForKey(key);
}

function getActiveRegisteredAdapters(): SessionBindingAdapter[] {
  return [...ADAPTERS_BY_CHANNEL_ACCOUNT.values()]
    .map((registrations) => registrations.at(-1)?.normalizedAdapter ?? null)
    .filter((adapter): adapter is SessionBindingAdapter => Boolean(adapter));
}

function dedupeBindings(records: SessionBindingRecord[]): SessionBindingRecord[] {
  const byId = new Map<string, SessionBindingRecord>();
  for (const record of records) {
    if (!record?.bindingId) {
      continue;
    }
    byId.set(record.bindingId, record);
  }
  return [...byId.values()];
}

const bindingsByConversationKey = new Map<string, SessionBindingRecord>();
const bindingsBySessionKey = new Map<string, SessionBindingRecord[]>();

function buildConversationKey(ref: ConversationRef): string {
  return [ref.channel.toLowerCase(), normalizeAccountId(ref.accountId), ref.conversationId].join(":");
}

function buildBindingId(ref: ConversationRef): string {
  return `binding:${buildConversationKey(ref)}`;
}

function bindGenericCurrentConversation(
  input: SessionBindingBindInput,
): SessionBindingRecord | null {
  const targetSessionKey = input.targetSessionKey.trim();
  if (!input.conversation.channel || !input.conversation.conversationId || !targetSessionKey) {
    return null;
  }
  const now = Date.now();
  const ttlMs =
    typeof input.ttlMs === "number" && Number.isFinite(input.ttlMs)
      ? Math.max(0, Math.floor(input.ttlMs))
      : undefined;
  const expiresAt =
    ttlMs === undefined
      ? undefined
      : ttlMs === 0
        ? now
        : now + ttlMs;
  const key = buildConversationKey(input.conversation);
  const record: SessionBindingRecord = {
    bindingId: buildBindingId(input.conversation),
    targetSessionKey,
    targetKind: input.targetKind,
    conversation: input.conversation,
    status: "active",
    boundAt: now,
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    metadata: {
      ...input.metadata,
      lastActivityAt: now,
    },
  };
  bindingsByConversationKey.set(key, record);
  const sessionBindings = bindingsBySessionKey.get(targetSessionKey) ?? [];
  sessionBindings.push(record);
  bindingsBySessionKey.set(targetSessionKey, sessionBindings);
  return record;
}

function getGenericCurrentConversationBindingCapabilities(_params: {
  channel: string;
  accountId: string;
}): SessionBindingCapabilities {
  return {
    adapterAvailable: true,
    bindSupported: true,
    unbindSupported: true,
    placements: ["current"],
  };
}

function resolveGenericCurrentConversationBinding(ref: ConversationRef): SessionBindingRecord | null {
  return bindingsByConversationKey.get(buildConversationKey(ref)) ?? null;
}

function listGenericCurrentConversationBindingsBySession(targetSessionKey: string): SessionBindingRecord[] {
  return bindingsBySessionKey.get(targetSessionKey) ?? [];
}

function touchGenericCurrentConversationBinding(bindingId: string, at = Date.now()): void {
  for (const record of bindingsByConversationKey.values()) {
    if (record.bindingId === bindingId) {
      bindingsByConversationKey.set(buildConversationKey(record.conversation), {
        ...record,
        metadata: {
          ...record.metadata,
          lastActivityAt: at,
        },
      });
      break;
    }
  }
}

function unbindGenericCurrentConversationBindings(input: SessionBindingUnbindInput): SessionBindingRecord[] {
  const removed: SessionBindingRecord[] = [];
  if (input.bindingId) {
    for (const [key, record] of bindingsByConversationKey.entries()) {
      if (record.bindingId === input.bindingId) {
        bindingsByConversationKey.delete(key);
        const sessionBindings = bindingsBySessionKey.get(record.targetSessionKey) ?? [];
        bindingsBySessionKey.set(
          record.targetSessionKey,
          sessionBindings.filter((b) => b.bindingId !== input.bindingId),
        );
        removed.push(record);
        break;
      }
    }
    return removed;
  }
  if (input.targetSessionKey) {
    const sessionBindings = bindingsBySessionKey.get(input.targetSessionKey) ?? [];
    for (const record of sessionBindings) {
      bindingsByConversationKey.delete(buildConversationKey(record.conversation));
      removed.push(record);
    }
    bindingsBySessionKey.delete(input.targetSessionKey);
  }
  return removed;
}

function createDefaultSessionBindingService(): SessionBindingService {
  return {
    bind: async (input) => {
      const adapter = resolveAdapterForConversation(input.conversation);
      if (!adapter) {
        const genericCapabilities = getGenericCurrentConversationBindingCapabilities({
          channel: input.conversation.channel,
          accountId: input.conversation.accountId,
        });
        if (genericCapabilities?.bindSupported) {
          const placement =
            normalizePlacement(input.placement) ?? inferDefaultPlacement(input.conversation);
          if (placement !== "current") {
            throw new SessionBindingError(
              "BINDING_CAPABILITY_UNSUPPORTED",
              `Session binding placement "${placement}" is not supported`,
              {
                channel: input.conversation.channel,
                accountId: input.conversation.accountId,
                placement,
              },
            );
          }
          const bound = bindGenericCurrentConversation(input);
          if (!bound) {
            throw new SessionBindingError(
              "BINDING_CREATE_FAILED",
              "Session binding adapter failed to bind target conversation",
              {
                channel: input.conversation.channel,
                accountId: input.conversation.accountId,
              },
            );
          }
          return bound;
        }
        throw new SessionBindingError(
          "BINDING_ADAPTER_UNAVAILABLE",
          `Session binding adapter unavailable`,
          {
            channel: input.conversation.channel,
            accountId: input.conversation.accountId,
          },
        );
      }
      if (!adapter.bind) {
        throw new SessionBindingError(
          "BINDING_CAPABILITY_UNSUPPORTED",
          "Session binding adapter does not support binding",
          {
            channel: input.conversation.channel,
            accountId: input.conversation.accountId,
          },
        );
      }
      const placement =
        normalizePlacement(input.placement) ?? inferDefaultPlacement(input.conversation);
      const supportedPlacements = resolveAdapterPlacements(adapter);
      if (!supportedPlacements.includes(placement)) {
        throw new SessionBindingError(
          "BINDING_CAPABILITY_UNSUPPORTED",
          `Session binding placement "${placement}" is not supported`,
          {
            channel: input.conversation.channel,
            accountId: input.conversation.accountId,
            placement,
          },
        );
      }
      const bound = await adapter.bind(input);
      if (!bound) {
        throw new SessionBindingError(
          "BINDING_CREATE_FAILED",
          "Session binding adapter failed to bind target conversation",
          {
            channel: input.conversation.channel,
            accountId: input.conversation.accountId,
          },
        );
      }
      return bound;
    },
    getCapabilities: (params) => {
      const adapter = resolveAdapterForChannelAccount({
        channel: params.channel,
        accountId: params.accountId,
      });
      if (!adapter) {
        return getGenericCurrentConversationBindingCapabilities(params);
      }
      return resolveAdapterCapabilities(adapter);
    },
    listBySession: (targetSessionKey) => {
      const key = targetSessionKey.trim();
      if (!key) {
        return [];
      }
      const results: SessionBindingRecord[] = [];
      for (const adapter of getActiveRegisteredAdapters()) {
        const entries = adapter.listBySession(key);
        if (entries.length > 0) {
          results.push(...entries);
        }
      }
      results.push(...listGenericCurrentConversationBindingsBySession(key));
      return dedupeBindings(results);
    },
    resolveByConversation: (ref) => {
      const adapter = resolveAdapterForConversation(ref);
      if (!adapter) {
        return resolveGenericCurrentConversationBinding(ref);
      }
      return adapter.resolveByConversation(ref);
    },
    touch: (bindingId, at) => {
      for (const adapter of getActiveRegisteredAdapters()) {
        adapter.touch?.(bindingId, at);
      }
      touchGenericCurrentConversationBinding(bindingId, at);
    },
    unbind: async (input) => {
      const removed: SessionBindingRecord[] = [];
      for (const adapter of getActiveRegisteredAdapters()) {
        if (!adapter.unbind) {
          continue;
        }
        const entries = await adapter.unbind(input);
        if (entries.length > 0) {
          removed.push(...entries);
        }
      }
      removed.push(...unbindGenericCurrentConversationBindings(input));
      return dedupeBindings(removed);
    },
  };
}

const DEFAULT_SESSION_BINDING_SERVICE = createDefaultSessionBindingService();

export function getSessionBindingService(): SessionBindingService {
  return DEFAULT_SESSION_BINDING_SERVICE;
}

export const testing = {
  resetSessionBindingAdaptersForTests() {
    ADAPTERS_BY_CHANNEL_ACCOUNT.clear();
    bindingsByConversationKey.clear();
    bindingsBySessionKey.clear();
  },
  getRegisteredAdapterKeys() {
    return [...ADAPTERS_BY_CHANNEL_ACCOUNT.keys()];
  },
};
export { testing as __testing };