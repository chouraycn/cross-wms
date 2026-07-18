// User-turn transcript target/recorder type contracts.
// 移植自 openclaw/src/sessions/user-turn-transcript.types.ts
// 补充 sessions/types.ts 中未包含的高级类型

import type { InputProvenance } from "./input-provenance.js";
import type { PersistedUserTurnMessage } from "./types.js";

export type UserTurnSessionEntry = {
  sessionId: string;
  updatedAt: number;
  sessionFile?: string;
  threadId?: string | number;
} & Record<string, unknown>;

export type UserTurnBeforeMessageWrite = (params: {
  message: PersistedUserTurnMessage;
  agentId?: string;
  sessionKey?: string;
}) => PersistedUserTurnMessage | null;

type UserTurnTranscriptPersistenceTarget = {
  sessionId: string;
  sessionKey: string;
  sessionEntry: UserTurnSessionEntry | undefined;
  sessionStore?: Record<string, UserTurnSessionEntry>;
  storePath?: string;
  agentId: string;
  threadId?: string | number;
  cwd?: string;
  config?: unknown;
  beforeMessageWrite?: UserTurnBeforeMessageWrite;
};

export type UserTurnTranscriptFileTarget = {
  transcriptPath: string;
  sessionId?: string;
  agentId?: string;
  sessionKey?: string;
  cwd?: string;
  config?: unknown;
};

export type UserTurnTranscriptTarget =
  | UserTurnTranscriptPersistenceTarget
  | UserTurnTranscriptFileTarget;

export type UserTurnTranscriptTargetResolver =
  | UserTurnTranscriptTarget
  | (() => UserTurnTranscriptTarget | undefined | Promise<UserTurnTranscriptTarget | undefined>);

export type UserTurnTranscriptRecorder = {
  readonly message: PersistedUserTurnMessage | undefined;
  resolveMessage: () => Promise<PersistedUserTurnMessage | undefined>;
  markRuntimePersistencePending: (pending: Promise<void>) => void;
  markRuntimePersisted: (message?: PersistedUserTurnMessage) => void;
  markBlocked: () => void;
  hasPersisted: () => boolean;
  isBlocked: () => boolean;
  hasRuntimePersistencePending: () => boolean;
  waitForRuntimePersistence: () => Promise<void>;
  persistApproved: (params?: {
    target?: UserTurnTranscriptTargetResolver;
    updateMode?: import("./types.js").UserTurnTranscriptUpdateMode;
  }) => Promise<import("./types.js").UserTurnTranscriptPersistResult | undefined>;
  persistFallback: (params?: {
    target?: UserTurnTranscriptTargetResolver;
    updateMode?: import("./types.js").UserTurnTranscriptUpdateMode;
  }) => Promise<import("./types.js").UserTurnTranscriptPersistResult | undefined>;
};
