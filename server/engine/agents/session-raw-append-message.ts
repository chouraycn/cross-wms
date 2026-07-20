/**
 * Ported from openclaw/src/agents/session-raw-append-message.ts
 *
 * Stores and retrieves an unguarded SessionManager appendMessage function.
 */

const RAW_APPEND_MESSAGE = Symbol("openclaw.session.rawAppendMessage");

type SessionManagerLike = {
  appendMessage: (...args: unknown[]) => unknown;
  [RAW_APPEND_MESSAGE]?: (...args: unknown[]) => unknown;
};

/** Return the unguarded appendMessage implementation for a session manager. */
export function getRawSessionAppendMessage(
  sessionManager: SessionManagerLike,
): (...args: unknown[]) => unknown {
  const rawAppend = sessionManager[RAW_APPEND_MESSAGE];
  return rawAppend ?? sessionManager.appendMessage.bind(sessionManager);
}

/** Stores the unguarded appendMessage implementation on a session manager. */
export function setRawSessionAppendMessage(
  sessionManager: SessionManagerLike,
  appendMessage: (...args: unknown[]) => unknown,
): void {
  (sessionManager as SessionManagerLike)[RAW_APPEND_MESSAGE] = appendMessage;
}
