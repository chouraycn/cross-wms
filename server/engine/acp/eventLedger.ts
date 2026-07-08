/**
 * ACP Event Ledger
 * 事件账本 - 持久化记录 ACP 会话事件，支持会话重放
 *
 * 参考 openclaw/src/acp/event-ledger.ts 设计（内存版本）
 */

type ContentBlock = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

type SessionUpdate = {
  sessionUpdate: string;
  content?: ContentBlock;
  title?: string;
  status?: string;
  toolCallId?: string;
  availableCommands?: Array<{ name: string }>;
  [key: string]: unknown;
};

export type AcpEventLedgerEntry = {
  seq: number;
  at: number;
  sessionId: string;
  sessionKey: string;
  runId?: string;
  update: SessionUpdate;
};

export type AcpEventLedgerReplay = {
  complete: boolean;
  sessionId?: string;
  sessionKey?: string;
  events: AcpEventLedgerEntry[];
};

export type AcpEventLedger = {
  startSession: (params: {
    sessionId: string;
    sessionKey: string;
    cwd: string;
    complete: boolean;
    reset?: boolean;
  }) => Promise<void>;
  recordUserPrompt: (params: {
    sessionId: string;
    sessionKey: string;
    runId: string;
    prompt: readonly ContentBlock[];
  }) => Promise<void>;
  recordUpdate: (params: {
    sessionId: string;
    sessionKey: string;
    runId?: string;
    update: SessionUpdate;
  }) => Promise<void>;
  markIncomplete: (params: { sessionId: string; sessionKey: string }) => Promise<void>;
  readReplay: (params: { sessionId: string; sessionKey: string }) => Promise<AcpEventLedgerReplay>;
  readReplayBySessionId: (params: { sessionId: string }) => Promise<AcpEventLedgerReplay>;
  readReplayBySessionKey: (params: { sessionKey: string }) => Promise<AcpEventLedgerReplay>;
};

type LedgerSession = {
  sessionId: string;
  sessionKey: string;
  cwd: string;
  complete: boolean;
  createdAt: number;
  updatedAt: number;
  nextSeq: number;
  events: AcpEventLedgerEntry[];
};

type LedgerStore = {
  version: 1;
  sessions: Record<string, LedgerSession>;
};

type LedgerOptions = {
  maxSessions?: number;
  maxEventsPerSession?: number;
  maxSerializedBytes?: number;
  now?: () => number;
};

type MutableLedgerState = {
  store: LedgerStore;
  maxSessions: number;
  maxEventsPerSession: number;
  maxSerializedBytes: number;
  now: () => number;
};

const LEDGER_VERSION = 1;
const DEFAULT_MAX_SESSIONS = 200;
const DEFAULT_MAX_EVENTS_PER_SESSION = 5_000;
const DEFAULT_MAX_SERIALIZED_BYTES = 16 * 1024 * 1024;

function createEmptyStore(): LedgerStore {
  return {
    version: LEDGER_VERSION,
    sessions: {},
  };
}

function normalizeLedgerOptions(options: LedgerOptions = {}) {
  return {
    maxSessions: Math.max(1, options.maxSessions ?? DEFAULT_MAX_SESSIONS),
    maxEventsPerSession: Math.max(1, options.maxEventsPerSession ?? DEFAULT_MAX_EVENTS_PER_SESSION),
    maxSerializedBytes: Math.max(1_024, options.maxSerializedBytes ?? DEFAULT_MAX_SERIALIZED_BYTES),
    now: options.now ?? Date.now,
  };
}

function cloneJsonValue<T>(value: T): T {
  return structuredClone(value);
}

function createUserPromptUpdates(prompt: readonly ContentBlock[]): SessionUpdate[] {
  return prompt.map((content) => ({
    sessionUpdate: "user_message_chunk",
    content: cloneJsonValue(content),
  }));
}

function serializeLedgerStore(store: LedgerStore): string {
  return JSON.stringify(store);
}

function getSerializedLedgerByteLength(store: LedgerStore): number {
  return Buffer.byteLength(serializeLedgerStore(store), "utf8");
}

function normalizeEvent(raw: unknown): AcpEventLedgerEntry | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const seq = record.seq;
  const at = record.at;
  const sessionId = record.sessionId;
  const sessionKey = record.sessionKey;
  const runId = record.runId;
  const update = record.update;

  if (
    typeof seq !== "number" ||
    !Number.isInteger(seq) ||
    seq < 0 ||
    typeof at !== "number" ||
    !Number.isFinite(at) ||
    typeof sessionId !== "string" ||
    typeof sessionKey !== "string" ||
    typeof update !== "object" ||
    update === null ||
    typeof (update as Record<string, unknown>).sessionUpdate !== "string"
  ) {
    return undefined;
  }

  return {
    seq,
    at,
    sessionId,
    sessionKey,
    ...(typeof runId === "string" && runId ? { runId } : {}),
    update: cloneJsonValue(update) as SessionUpdate,
  };
}

function normalizeSession(raw: unknown): LedgerSession | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const sessionId = record.sessionId;
  const sessionKey = record.sessionKey;
  const cwd = record.cwd;
  const createdAt = record.createdAt;
  const updatedAt = record.updatedAt;
  const nextSeq = record.nextSeq;

  if (
    typeof sessionId !== "string" ||
    typeof sessionKey !== "string" ||
    typeof cwd !== "string" ||
    typeof createdAt !== "number" ||
    !Number.isFinite(createdAt) ||
    typeof updatedAt !== "number" ||
    !Number.isFinite(updatedAt) ||
    typeof nextSeq !== "number" ||
    !Number.isInteger(nextSeq) ||
    nextSeq < 1
  ) {
    return undefined;
  }

  const events = Array.isArray(record.events)
    ? record.events.map(normalizeEvent).filter((event): event is AcpEventLedgerEntry => Boolean(event))
    : [];

  return {
    sessionId,
    sessionKey,
    cwd,
    complete: record.complete === true,
    createdAt,
    updatedAt,
    nextSeq,
    events,
  };
}

function normalizeStore(raw: unknown): LedgerStore {
  if (
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw) ||
    (raw as Record<string, unknown>).version !== LEDGER_VERSION ||
    typeof (raw as Record<string, unknown>).sessions !== "object"
  ) {
    return createEmptyStore();
  }

  const sessions: Record<string, LedgerSession> = {};
  const rawSessions = (raw as Record<string, unknown>).sessions as Record<string, unknown>;

  for (const [sessionId, value] of Object.entries(rawSessions)) {
    const session = normalizeSession(value);
    if (!session || session.sessionId !== sessionId) {
      continue;
    }
    sessions[sessionId] = session;
  }

  return { version: LEDGER_VERSION, sessions };
}

function getOrCreateSession(
  state: MutableLedgerState,
  params: {
    sessionId: string;
    sessionKey: string;
    cwd: string;
    complete: boolean;
    reset?: boolean;
  },
): LedgerSession {
  const now = state.now();
  const existing = state.store.sessions[params.sessionId];

  if (!params.reset && existing) {
    existing.sessionKey = params.sessionKey;
    if (params.cwd) {
      existing.cwd = params.cwd;
    }
    existing.complete = existing.complete || params.complete;
    existing.updatedAt = now;
    return existing;
  }

  const session: LedgerSession = {
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    cwd: params.cwd,
    complete: params.complete,
    createdAt: now,
    updatedAt: now,
    nextSeq: 1,
    events: [],
  };

  state.store.sessions[params.sessionId] = session;
  return session;
}

function trimLedger(state: MutableLedgerState): void {
  for (const session of Object.values(state.store.sessions)) {
    if (session.events.length <= state.maxEventsPerSession) {
      continue;
    }
    session.events = session.events.slice(-state.maxEventsPerSession);
    session.complete = false;
  }

  const sessions = Object.values(state.store.sessions);
  if (sessions.length > state.maxSessions) {
    for (const session of sessions
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .slice(state.maxSessions)) {
      delete state.store.sessions[session.sessionId];
    }
  }

  let serializedBytes = getSerializedLedgerByteLength(state.store);
  while (serializedBytes > state.maxSerializedBytes) {
    const session = Object.values(state.store.sessions)
      .filter((candidate) => candidate.events.length > 0)
      .toSorted((a, b) => a.updatedAt - b.updatedAt)[0];

    if (!session) {
      break;
    }

    session.events.shift();
    session.complete = false;
    serializedBytes = getSerializedLedgerByteLength(state.store);
  }

  while (serializedBytes > state.maxSerializedBytes) {
    const session = Object.values(state.store.sessions).toSorted(
      (a, b) => a.updatedAt - b.updatedAt,
    )[0];

    if (!session) {
      break;
    }

    delete state.store.sessions[session.sessionId];
    serializedBytes = getSerializedLedgerByteLength(state.store);
  }
}

function appendUpdate(
  state: MutableLedgerState,
  params: {
    sessionId: string;
    sessionKey: string;
    runId?: string;
    update: SessionUpdate;
  },
): void {
  const session = getOrCreateSession(state, {
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    cwd: "",
    complete: false,
  });

  const now = state.now();
  session.updatedAt = now;
  session.events.push({
    seq: session.nextSeq,
    at: now,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    ...(params.runId ? { runId: params.runId } : {}),
    update: cloneJsonValue(params.update),
  });
  session.nextSeq += 1;
  trimLedger(state);
}

function createLedgerApi(params: {
  state: MutableLedgerState;
  mutate: (fn: () => void) => Promise<void>;
  read: <T>(fn: () => T) => Promise<T>;
}): AcpEventLedger {
  const buildReplay = (session: LedgerSession): AcpEventLedgerReplay => ({
    complete: true,
    sessionId: session.sessionId,
    sessionKey: session.sessionKey,
    events: session.events.map((event) => cloneJsonValue(event)),
  });

  return {
    async startSession(sessionParams) {
      await params.mutate(() => {
        getOrCreateSession(params.state, sessionParams);
        trimLedger(params.state);
      });
    },

    async recordUserPrompt(promptParams) {
      await params.mutate(() => {
        for (const update of createUserPromptUpdates(promptParams.prompt)) {
          appendUpdate(params.state, {
            sessionId: promptParams.sessionId,
            sessionKey: promptParams.sessionKey,
            runId: promptParams.runId,
            update,
          });
        }
      });
    },

    async recordUpdate(updateParams) {
      await params.mutate(() => {
        appendUpdate(params.state, updateParams);
      });
    },

    async markIncomplete(markParams) {
      await params.mutate(() => {
        const session = params.state.store.sessions[markParams.sessionId];
        if (!session || session.sessionKey !== markParams.sessionKey) {
          return;
        }
        session.complete = false;
        session.updatedAt = params.state.now();
      });
    },

    async readReplay(replayParams) {
      return params.read(() => {
        const session = params.state.store.sessions[replayParams.sessionId];
        if (!session || session.sessionKey !== replayParams.sessionKey || !session.complete) {
          return { complete: false, events: [] };
        }
        return buildReplay(session);
      });
    },

    async readReplayBySessionId(replayParams) {
      return params.read(() => {
        const session = params.state.store.sessions[replayParams.sessionId];
        if (!session || !session.complete) {
          return { complete: false, events: [] };
        }
        return buildReplay(session);
      });
    },

    async readReplayBySessionKey(replayParams) {
      return params.read(() => {
        const session = Object.values(params.state.store.sessions)
          .filter(
            (candidate) => candidate.sessionKey === replayParams.sessionKey && candidate.complete,
          )
          .toSorted((a, b) => b.updatedAt - a.updatedAt)[0];

        if (!session) {
          return { complete: false, events: [] };
        }
        return buildReplay(session);
      });
    },
  };
}

export function createInMemoryAcpEventLedger(options: LedgerOptions = {}): AcpEventLedger {
  const normalized = normalizeLedgerOptions(options);
  const state: MutableLedgerState = {
    store: createEmptyStore(),
    ...normalized,
  };

  return createLedgerApi({
    state,
    mutate: async (fn) => {
      fn();
    },
    read: async (fn) => fn(),
  });
}

export const eventLedger = createInMemoryAcpEventLedger();