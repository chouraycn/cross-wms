/**
 * Ported from openclaw/src/agents/session-raw-append-message.ts
 *
 * Stores and retrieves an unguarded SessionManager appendMessage function.
 */

const RAW_APPEND_MESSAGE = Symbol("openclaw.session.rawAppendMessage");

type SessionManagerLike = {
  appendMessage: (...args: any[]) => unknown;
  [RAW_APPEND_MESSAGE]?: (...args: any[]) => unknown;
};

/** Return the unguarded appendMessage implementation for a session manager. */
export function getRawSessionAppendMessage(
  sessionManager: SessionManagerLike,
): (...args: any[]) => unknown {
  const rawAppend = sessionManager[RAW_APPEND_MESSAGE];
  return rawAppend ?? sessionManager.appendMessage.bind(sessionManager);
}

/** Stores the unguarded appendMessage implementation on a session manager. */
export function setRawSessionAppendMessage(
  sessionManager: SessionManagerLike,
  appendMessage: (...args: any[]) => unknown,
): void {
  (sessionManager as SessionManagerLike)[RAW_APPEND_MESSAGE] = appendMessage;
}
