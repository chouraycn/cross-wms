export type SessionPatchHookContext = {
  sessionEntry: Record<string, unknown>;
  patch: Record<string, unknown>;
  cfg: Record<string, unknown>;
};

export type SessionPatchHookEvent = {
  type: 'session';
  action: 'patch';
  sessionKey: string;
  context: SessionPatchHookContext;
  timestamp: Date;
  messages: unknown[];
};

type SessionPatchHookListener = (event: SessionPatchHookEvent) => void | Promise<void>;

const patchHookListeners = new Set<SessionPatchHookListener>();

export function hasInternalHookListeners(type: string, action: string): boolean {
  if (type === 'session' && action === 'patch') {
    return patchHookListeners.size > 0;
  }
  return false;
}

export function registerSessionPatchHookListener(listener: SessionPatchHookListener): void {
  patchHookListeners.add(listener);
}

export function unregisterSessionPatchHookListener(listener: SessionPatchHookListener): void {
  patchHookListeners.delete(listener);
}

export function triggerSessionPatchHook(params: {
  cfg: Record<string, unknown>;
  sessionEntry: Record<string, unknown>;
  sessionKey: string;
  patch: Record<string, unknown>;
}): void {
  if (patchHookListeners.size === 0) {
    return;
  }

  const hookContext: SessionPatchHookContext = structuredClone({
    sessionEntry: params.sessionEntry,
    patch: params.patch,
    cfg: params.cfg,
  });
  const hookEvent: SessionPatchHookEvent = {
    type: 'session',
    action: 'patch',
    sessionKey: params.sessionKey,
    context: hookContext,
    timestamp: new Date(),
    messages: [],
  };

  for (const listener of patchHookListeners) {
    void Promise.resolve()
      .then(() => listener(hookEvent))
      .catch(() => {
        // ignore listener errors
      });
  }
}
