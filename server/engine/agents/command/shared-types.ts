/**
 * Shared command types that are imported by both public and runtime modules.
 */
/** Best-effort provider stream parameter overrides for an agent command. */
export type AgentStreamParams = {
  /** Provider stream params override (best-effort). */
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  /** Stop sequences forwarded to the provider (best-effort). */
  stop?: string[];
  /** Provider fast-mode override (best-effort). */
  fastMode?: boolean;
  responseFormat?: Record<string, any>;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
};

/** Simplified tool definition for client-provided OpenResponses hosted tools. */
export type ClientToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
    /** Strict argument enforcement (Responses API). Propagated from the request. */
    strict?: boolean;
  };
};
