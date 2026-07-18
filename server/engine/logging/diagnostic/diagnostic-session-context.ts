type SessionContext = {
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  channel?: string;
  isCron?: boolean;
  cronSchedule?: string;
  metadata?: Record<string, string>;
};

const sessionContexts = new Map<string, SessionContext>();

function contextKey(ref: { sessionId?: string; sessionKey?: string }): string {
  return ref.sessionKey ?? ref.sessionId ?? 'unknown';
}

export function setSessionContext(
  ref: { sessionId?: string; sessionKey?: string },
  context: Partial<SessionContext>,
): void {
  const key = contextKey(ref);
  const existing = sessionContexts.get(key) ?? {};
  sessionContexts.set(key, { ...existing, ...context, ...ref });
}

export function getSessionContext(
  ref: { sessionId?: string; sessionKey?: string },
): SessionContext | undefined {
  return sessionContexts.get(contextKey(ref));
}

export function clearSessionContext(ref: { sessionId?: string; sessionKey?: string }): void {
  sessionContexts.delete(contextKey(ref));
}

export function resolveCronSessionDiagnosticContext(
  ref: { sessionKey?: string },
): { isCron: boolean; schedule?: string } {
  const ctx = sessionContexts.get(ref.sessionKey ?? 'unknown');
  return {
    isCron: ctx?.isCron ?? false,
    schedule: ctx?.cronSchedule,
  };
}

export function formatCronSessionDiagnosticFields(
  ctx: { isCron: boolean; schedule?: string },
): string {
  if (!ctx.isCron) return '';
  return ctx.schedule ? `cron=${ctx.schedule}` : 'cron=true';
}

export function resetDiagnosticSessionContextForTest(): void {
  sessionContexts.clear();
}
