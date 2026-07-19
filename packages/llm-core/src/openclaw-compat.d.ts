export type KnownApi = "anthropic" | "bedrock" | "gemini" | "ollama" | "openai" | "openrouter" | "perplexity" | "cloudflare" | "azure-openai" | "groq" | "cohere" | "deepseek" | "mistral" | "xai" | "togetherai";
export type Api = KnownApi | (string & {});
export interface StreamOptions {
    model?: string;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    stop?: string | string[];
    presence_penalty?: number;
    frequency_penalty?: number;
    seed?: number;
    [key: string]: unknown;
}
export interface SimpleStreamOptions extends StreamOptions {
    prompt: string;
}
export type ProviderStreamOptions = StreamOptions & Record<string, unknown>;
export type StreamFunction<TApi extends Api = Api, TOptions extends StreamOptions = StreamOptions> = (model: Model<TApi>, context: Context, options?: TOptions) => AssistantMessageEventStreamContract;
export interface AssistantMessage {
    role: "assistant";
    content: string;
    tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
            name: string;
            arguments: string;
        };
    }>;
}
export interface AssistantMessageEvent {
    type: "message" | "content" | "tool_call" | "done" | "error";
    data: unknown;
}
export interface AssistantMessageEventStreamContract extends AsyncIterable<AssistantMessageEvent> {
    /** Queue one stream event for consumers. */
    push(event: AssistantMessageEvent): void;
    /** Complete the stream and optionally resolve the final message. */
    end(result?: AssistantMessage): void;
    /** Final assistant message produced by the stream. */
    result(): Promise<AssistantMessage>;
    [Symbol.asyncIterator](): AsyncIterator<AssistantMessageEvent>;
}
export interface Context {
    messages: Array<{
        role: "system";
        content: string;
    } | {
        role: "user";
        content: string;
    } | {
        role: "assistant";
        content: string;
    }>;
    system?: string;
}
export interface ModelCost {
    input: number;
    output: number;
}
export interface Model<TApi extends Api = Api> {
    id: string;
    name: string;
    api: TApi;
    provider: string;
    contextWindow?: number;
    maxTokens?: number;
    supportsStreaming?: boolean;
    supportsTools?: boolean;
    /** Whether the model supports reasoning capabilities. */
    reasoning?: boolean;
    /** Cost per 1M tokens. */
    cost?: ModelCost;
    [key: string]: unknown;
}
export interface ImagesModel<TApi extends Api = Api> extends Omit<Model<TApi>, "api"> {
    api: TApi;
}
export interface ImagesContext {
    prompt: string;
    images?: Array<{
        url: string;
        detail?: "low" | "high" | "auto";
    }>;
}
//# sourceMappingURL=openclaw-compat.d.ts.map