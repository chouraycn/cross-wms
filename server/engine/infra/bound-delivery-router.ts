// 移植自 openclaw/src/infra/outbound/bound-delivery-router.ts

export type ConversationRef = {
  channel: string;
  accountId?: string;
  conversationId?: string;
};

export type SessionBindingRecord = {
  conversation: ConversationRef;
  status: string;
  [key: string]: unknown;
};

export type BoundDeliveryRouterInput = {
  eventKind: "task_completion";
  targetSessionKey: string;
  requester?: ConversationRef;
  failClosed: boolean;
};

export type BoundDeliveryRouterResult = {
  binding: SessionBindingRecord | null;
  mode: "bound" | "fallback";
  reason: string;
};

export type SessionBindingService = {
  listBySession(sessionKey: string): SessionBindingRecord[];
};

export type BoundDeliveryRouter = {
  resolveDestination: (input: BoundDeliveryRouterInput) => BoundDeliveryRouterResult;
};

function isActiveBinding(record: SessionBindingRecord): boolean {
  return record.status === "active";
}

/** Creates a router that resolves task-completion delivery through active session bindings. */
export function createBoundDeliveryRouter(
  service?: SessionBindingService,
): BoundDeliveryRouter {
  return {
    resolveDestination: (input) => {
      if (!service) {
        return { binding: null, mode: "fallback", reason: "no-binding-service" };
      }
      const targetSessionKey = input.targetSessionKey.trim();
      if (!targetSessionKey) {
        return { binding: null, mode: "fallback", reason: "missing-target-session" };
      }

      const activeBindings = service.listBySession(targetSessionKey).filter(isActiveBinding);
      if (activeBindings.length === 0) {
        return { binding: null, mode: "fallback", reason: "no-active-binding" };
      }

      if (!input.requester) {
        if (input.failClosed) {
          return { binding: null, mode: "fallback", reason: "missing-requester" };
        }
        if (activeBindings.length === 1) {
          return { binding: activeBindings[0] ?? null, mode: "bound", reason: "single-active-binding" };
        }
        return { binding: null, mode: "fallback", reason: "ambiguous-without-requester" };
      }

      if (!input.requester.channel || !input.requester.conversationId) {
        return { binding: null, mode: "fallback", reason: "invalid-requester" };
      }

      const fromRequester = activeBindings.find(
        (entry) =>
          entry.conversation.channel === input.requester!.channel &&
          entry.conversation.conversationId === input.requester!.conversationId,
      );
      if (fromRequester) {
        return { binding: fromRequester, mode: "bound", reason: "requester-match" };
      }

      if (activeBindings.length === 1 && !input.failClosed) {
        return { binding: activeBindings[0] ?? null, mode: "bound", reason: "single-active-binding-fallback" };
      }

      return { binding: null, mode: "fallback", reason: "no-requester-match" };
    },
  };
}
