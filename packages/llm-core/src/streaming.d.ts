export interface LlmUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    imageTokens?: number;
}
export type StreamEventType = 'start' | 'token' | 'thinking_start' | 'thinking_token' | 'thinking_end' | 'tool_call' | 'tool_result' | 'usage' | 'finish' | 'error' | 'metadata' | 'chunk';
export interface LlmStreamEvent {
    type: StreamEventType;
    content?: string;
    toolCalls?: Array<{
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
    usage?: LlmUsage;
    error?: string;
    model?: string;
    finishReason?: string;
    timestamp: number;
    index?: number;
    metadata?: Record<string, unknown>;
    chunkId?: string;
}
export declare class UsageTracker {
    private totalUsage;
    addUsage(usage: Partial<LlmUsage>): void;
    getTotal(): LlmUsage;
    reset(): void;
    estimateCost(pricePerInputToken: number, pricePerOutputToken: number): number;
}
export interface StreamTransformerOptions {
    chunkSize?: number;
    delayMs?: number;
    onToken?: (token: string) => void;
    onError?: (error: Error) => void;
}
export declare class StreamTransformer {
    private chunkSize;
    private delayMs;
    private buffer;
    private onToken?;
    private onError?;
    constructor(options?: StreamTransformerOptions);
    transform(stream: AsyncGenerator<LlmStreamEvent>): AsyncGenerator<LlmStreamEvent>;
    private delay;
    flush(): string;
}
export interface SseStreamOptions {
    eventName?: string;
    dataField?: string;
    retryMs?: number;
}
export declare class SseStreamWriter {
    private eventName;
    private dataField;
    private retryMs;
    constructor(options?: SseStreamOptions);
    formatEvent(event: LlmStreamEvent): string;
    private encodeData;
    writeToStream(stream: AsyncGenerator<LlmStreamEvent>, writer: {
        write: (chunk: string) => void;
        end?: () => void;
    }): Promise<void>;
}
export interface StreamCombinerOptions {
    mergeToolCalls?: boolean;
    preserveOrder?: boolean;
}
export declare class StreamCombiner {
    private streams;
    private mergeToolCalls;
    private preserveOrder;
    constructor(options?: StreamCombinerOptions);
    addStream(id: string, stream: AsyncGenerator<LlmStreamEvent>): void;
    combine(): AsyncGenerator<LlmStreamEvent & {
        streamId: string;
    }>;
    clear(): void;
}
export declare function collectStream(stream: AsyncGenerator<LlmStreamEvent>): AsyncGenerator<LlmStreamEvent>;
export declare function streamToText(stream: AsyncGenerator<LlmStreamEvent>): Promise<string>;
export declare function streamToArray(stream: AsyncGenerator<LlmStreamEvent>): Promise<LlmStreamEvent[]>;
export declare function streamToBuffer(stream: AsyncGenerator<LlmStreamEvent>): Promise<Buffer>;
export interface StreamSplitterOptions {
    separator?: string;
    maxChunkSize?: number;
}
export declare class StreamSplitter {
    private separator;
    private maxChunkSize;
    private buffer;
    constructor(options?: StreamSplitterOptions);
    split(stream: AsyncGenerator<LlmStreamEvent>): AsyncGenerator<LlmStreamEvent>;
}
//# sourceMappingURL=streaming.d.ts.map