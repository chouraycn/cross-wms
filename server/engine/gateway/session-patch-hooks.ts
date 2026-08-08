export type SessionPatchHookContext = {
  sessionEntry: Record<string, any>;
  patch: Record<string, any>;
  cfg: Record<string, any>;
};

export type SessionPatchHookEvent = {
  type: 'session';
  action: 'patch';
  sessionKey: string;
  context: SessionPatchHookContext;
  timestamp: Date;
  messages: any[];
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
  cfg: Record<string, any>;
  sessionEntry: Record<string, any>;
  sessionKey: string;
  patch: Record<string, any>;
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
