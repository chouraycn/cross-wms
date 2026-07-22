/**
 * Embedded agent tool-call event handlers.
 * Ported from openclaw/src/agents/embedded-agent-subscribe.handlers.tools.ts
 *
 * Note: Full embedded agent infrastructure not available in cross-wms.
 */

type ToolCallEvent = {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
};

type ToolResultEvent = {
  toolUseId: string;
  output: string;
  isError?: boolean;
};

type ToolCallHandler = {
  onToolCallStart?: (event: ToolCallEvent) => void;
  onToolCallEnd?: (event: ToolResultEvent) => void;
};

/** Create a tool-call event handler that forwards events to a callback. */
export function createToolCallHandler(callbacks?: {
  onToolCallStart?: (event: ToolCallEvent) => void;
  onToolCallEnd?: (event: ToolResultEvent) => void;
}): ToolCallHandler {
  return {
    onToolCallStart: callbacks?.onToolCallStart,
    onToolCallEnd: callbacks?.onToolCallEnd,
  };
}

/** Create a tool-call handler that accumulates calls into a list for later inspection. */
export function createAccumulatingToolCallHandler(): {
  handler: ToolCallHandler;
  getCalls: () => Array<{ call: ToolCallEvent; result?: ToolResultEvent }>;
  reset: () => void;
} {
  const calls: Array<{ call: ToolCallEvent; result?: ToolResultEvent }> = [];
  return {
    handler: {
      onToolCallStart: (event) => {
        calls.push({ call: event });
      },
      onToolCallEnd: (event) => {
        const entry = calls.find((c) => c.call.toolUseId === event.toolUseId);
        if (entry) {
          entry.result = event;
        }
      },
    },
    getCalls: () => [...calls],
    reset: () => {
      calls.length = 0;
    },
  };
}

/** Create a tool-call handler that filters events by tool name. */
export function createFilteredToolCallHandler(
  filter: (name: string) => boolean,
  delegate: ToolCallHandler,
): ToolCallHandler {
  return {
    onToolCallStart: (event) => {
      if (filter(event.name)) {
        delegate.onToolCallStart?.(event);
      }
    },
    onToolCallEnd: (event) => {
      // We don't have the tool name in the result event, so forward all results
      delegate.onToolCallEnd?.(event);
    },
  };
}

/** Compose multiple tool-call handlers into a single handler. */
export function composeToolCallHandlers(handlers: ToolCallHandler[]): ToolCallHandler {
  return {
    onToolCallStart: (event) => {
      for (const handler of handlers) {
        handler.onToolCallStart?.(event);
      }
    },
    onToolCallEnd: (event) => {
      for (const handler of handlers) {
        handler.onToolCallEnd?.(event);
      }
    },
  };
}

/** Create a no-op tool-call handler. */
export function createNoOpToolCallHandler(): ToolCallHandler {
  return {};
}

// ============================================================================
// Tool-execution lifecycle event stubs.
// Full embedded-agent subscribe infrastructure is not available in cross-wms;
// these are no-op stubs that preserve module shape for callers ported from
// openclaw.
// ============================================================================

/** Stub: no active tool executions tracked in cross-wms. */
export function countActiveToolExecutions(): number {
  return 0;
}

/** Stub: no-op for tool execution start events. */
export function handleToolExecutionStart(_event?: unknown): void {
  // no-op
}

/** Stub: no-op for tool execution update events. */
export function handleToolExecutionUpdate(_event?: unknown): void {
  // no-op
}

/** Stub: no-op for tool execution end events. */
export function handleToolExecutionEnd(_event?: unknown): void {
  // no-op
}
