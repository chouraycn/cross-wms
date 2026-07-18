import { randomUUID } from 'node:crypto';
import type { CrestodianDialogueMessage, CrestodianOverview } from './types.js';
import { planCrestodianCommand } from './assistant.js';
import { resolveOperationFromText } from './operations.js';

type DialogueSession = {
  id: string;
  messages: CrestodianDialogueMessage[];
  createdAt: string;
  lastActivity: string;
};

const sessions = new Map<string, DialogueSession>();

function createSession(): DialogueSession {
  const now = new Date().toISOString();
  const session: DialogueSession = {
    id: randomUUID(),
    messages: [],
    createdAt: now,
    lastActivity: now,
  };
  sessions.set(session.id, session);
  return session;
}

export function getOrCreateSession(sessionId?: string): DialogueSession {
  if (sessionId) {
    const existing = sessions.get(sessionId);
    if (existing) {
      existing.lastActivity = new Date().toISOString();
      return existing;
    }
  }
  return createSession();
}

export function addDialogueMessage(
  sessionId: string,
  role: CrestodianDialogueMessage['role'],
  content: string,
  metadata?: Record<string, unknown>,
): CrestodianDialogueMessage {
  const session = getOrCreateSession(sessionId);
  const message: CrestodianDialogueMessage = {
    role,
    content,
    timestamp: new Date().toISOString(),
    ...(metadata ? { metadata } : {}),
  };
  session.messages.push(message);
  return message;
}

export async function processCrestodianDialogue(params: {
  input: string;
  overview: CrestodianOverview;
  sessionId?: string;
}): Promise<{
  response: string;
  sessionId: string;
  plan?: {
    operation: string;
    confidence: number;
    steps: string[];
  };
}> {
  const session = getOrCreateSession(params.sessionId);

  addDialogueMessage(session.id, 'user', params.input);

  const plan = await planCrestodianCommand({
    input: params.input,
    overview: params.overview,
  });

  let response: string;

  if (plan) {
    response = `I've analyzed your request and recommend the following:

**Operation:** ${plan.operation}
**Confidence:** ${Math.round(plan.confidence * 100)}%
**Reason:** ${plan.reason}

**Steps:**
${plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**Risks:**
${plan.risks.map((r) => `- ${r}`).join('\n')}

Would you like me to proceed with this operation?`;

    addDialogueMessage(session.id, 'assistant', response, { plan });
  } else {
    const resolved = resolveOperationFromText(params.input);
    if (resolved) {
      response = `I understand you want to ${resolved}. Let me check the current system status and prepare for this operation.`;
    } else {
      response = `I'm not sure I understand your request. Could you please clarify?

I can help with:
- System health checks and diagnostics
- Repair and recovery operations
- Backup and restore
- Configuration validation
- System cleanup and maintenance`;
    }
    addDialogueMessage(session.id, 'assistant', response);
  }

  return {
    response,
    sessionId: session.id,
    plan: plan
      ? {
          operation: plan.operation,
          confidence: plan.confidence,
          steps: plan.steps,
        }
      : undefined,
  };
}

export function getDialogueHistory(sessionId: string): CrestodianDialogueMessage[] {
  const session = sessions.get(sessionId);
  return session?.messages ?? [];
}

export function clearDialogueSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function pruneOldSessions(maxAgeMs: number = 3600000): number {
  const now = Date.now();
  let pruned = 0;
  for (const [id, session] of sessions) {
    if (now - new Date(session.lastActivity).getTime() > maxAgeMs) {
      sessions.delete(id);
      pruned++;
    }
  }
  return pruned;
}
