import type {
  AgentMessage,
  AgentContext,
  AgentEvent,
  AgentTool,
  QueueMode,
  ThinkingLevel,
  StreamFn,
  Model,
} from './types';
import type {
  Message,
  SimpleStreamOptions,
  AssistantMessage,
  AssistantMessageEventStreamLike,
} from "@cdf-know/llm-core";
import type { AgentCoreStreamRuntimeDeps } from './runtime-deps';

export type AgentEventSink = (event: AgentEvent) => Promise<void> | void;

export interface AgentLoopConfig extends SimpleStreamOptions {
  model: Model;
  thinkingLevel?: ThinkingLevel;
  convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  beforeToolCall?: (context: unknown, signal?: AbortSignal) => Promise<unknown>;
  afterToolCall?: (context: unknown, signal?: AbortSignal) => Promise<unknown>;
  prepareNextTurn?: (context: unknown) => unknown | Promise<unknown>;
  getSteeringMessages?: () => Promise<AgentMessage[]>;
  getFollowUpMessages?: () => Promise<AgentMessage[]>;
  shouldStopAfterTurn?: (context: unknown) => boolean | Promise<boolean>;
}

/** Run a prompt-started agent loop. */
export async function runAgentLoop(
  prompts: AgentMessage[],
  context: AgentContext,
  config: AgentLoopConfig,
  emit: AgentEventSink,
  signal?: AbortSignal,
  streamFn?: StreamFn,
  runtime?: AgentCoreStreamRuntimeDeps,
): Promise<AgentMessage[]> {
  const newMessages: AgentMessage[] = [...prompts];
  const currentContext: AgentContext = {
    ...context,
    messages: [...context.messages, ...prompts],
  };

  await emit({ type: "agent_start" });
  await emit({ type: "turn_start" });
  for (const prompt of prompts) {
    await emit({ type: "message_start", message: prompt });
    await emit({ type: "message_end", message: prompt });
  }

  // Simplified loop: delegate to streamFn if available
  if (streamFn) {
    try {
      const streamResult = await (await streamFn(config.model, currentContext as unknown as import("@cdf-know/llm-core").Context, config)).result();
      newMessages.push(streamResult as unknown as AgentMessage);
      await emit({ type: "message_start", message: streamResult as unknown as AgentMessage });
      await emit({ type: "message_end", message: streamResult as unknown as AgentMessage });
    } catch (error) {
      // Re-throw so the caller (Agent.run) can handle it
      throw error;
    }
  }

  await emit({ type: "turn_end", message: newMessages[newMessages.length - 1] ?? prompts[0], toolResults: [] });
  await emit({ type: "agent_end", messages: newMessages });
  return newMessages;
}
