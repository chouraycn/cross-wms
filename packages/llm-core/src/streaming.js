export class UsageTracker {
    totalUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
    };
    addUsage(usage) {
        this.totalUsage.promptTokens += usage.promptTokens ?? 0;
        this.totalUsage.completionTokens += usage.completionTokens ?? 0;
        this.totalUsage.totalTokens += usage.totalTokens ?? 0;
        this.totalUsage.cachedTokens =
            (this.totalUsage.cachedTokens ?? 0) + (usage.cachedTokens ?? 0);
        this.totalUsage.reasoningTokens =
            (this.totalUsage.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0);
        this.totalUsage.imageTokens =
            (this.totalUsage.imageTokens ?? 0) + (usage.imageTokens ?? 0);
    }
    getTotal() {
        return { ...this.totalUsage };
    }
    reset() {
        this.totalUsage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
        };
    }
    estimateCost(pricePerInputToken, pricePerOutputToken) {
        return (this.totalUsage.promptTokens * pricePerInputToken +
            this.totalUsage.completionTokens * pricePerOutputToken);
    }
}
export class StreamTransformer {
    chunkSize;
    delayMs;
    buffer = '';
    onToken;
    onError;
    constructor(options = {}) {
        this.chunkSize = options.chunkSize ?? 1;
        this.delayMs = options.delayMs ?? 0;
        this.onToken = options.onToken;
        this.onError = options.onError;
    }
    async *transform(stream) {
        for await (const event of stream) {
            try {
                if (event.type === 'token' && event.content) {
                    this.buffer += event.content;
                    while (this.buffer.length >= this.chunkSize) {
                        const chunk = this.buffer.slice(0, this.chunkSize);
                        this.buffer = this.buffer.slice(this.chunkSize);
                        if (this.onToken) {
                            this.onToken(chunk);
                        }
                        yield {
                            ...event,
                            content: chunk,
                            type: 'token',
                        };
                        if (this.delayMs > 0) {
                            await this.delay(this.delayMs);
                        }
                    }
                }
                else {
                    yield event;
                }
            }
            catch (error) {
                if (this.onError) {
                    this.onError(error);
                }
                yield {
                    type: 'error',
                    error: error.message,
                    timestamp: Date.now(),
                };
            }
        }
        if (this.buffer.length > 0) {
            if (this.onToken) {
                this.onToken(this.buffer);
            }
            yield {
                type: 'token',
                content: this.buffer,
                timestamp: Date.now(),
            };
            this.buffer = '';
        }
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    flush() {
        const content = this.buffer;
        this.buffer = '';
        return content;
    }
}
export class SseStreamWriter {
    eventName;
    dataField;
    retryMs;
    constructor(options = {}) {
        this.eventName = options.eventName ?? 'message';
        this.dataField = options.dataField ?? 'data';
        this.retryMs = options.retryMs ?? 5000;
    }
    formatEvent(event) {
        let lines = [];
        lines.push(`event: ${event.type}`);
        if (this.dataField === 'data') {
            const payload = JSON.stringify(event);
            const encoded = this.encodeData(payload);
            lines.push(`data: ${encoded}`);
        }
        else {
            lines.push(`data: ${event.content ?? ''}`);
        }
        if (this.retryMs > 0) {
            lines.push(`retry: ${this.retryMs}`);
        }
        lines.push('');
        return lines.join('\n');
    }
    encodeData(data) {
        return data.replace(/\n/g, '\ndata: ');
    }
    async writeToStream(stream, writer) {
        for await (const event of stream) {
            const formatted = this.formatEvent(event);
            writer.write(formatted);
            if (event.type === 'finish' || event.type === 'error') {
                break;
            }
        }
        if (writer.end) {
            writer.end();
        }
    }
}
export class StreamCombiner {
    streams = new Map();
    mergeToolCalls;
    preserveOrder;
    constructor(options = {}) {
        this.mergeToolCalls = options.mergeToolCalls ?? true;
        this.preserveOrder = options.preserveOrder ?? false;
    }
    addStream(id, stream) {
        this.streams.set(id, stream);
    }
    async *combine() {
        const iterators = Array.from(this.streams.entries()).map(([id, stream]) => ({
            id,
            iterator: stream[Symbol.asyncIterator](),
        }));
        const pending = new Map(iterators.map(({ id, iterator }) => [id, iterator]));
        while (pending.size > 0) {
            const promises = Array.from(pending.entries()).map(async ([id, iterator]) => {
                const result = await iterator.next();
                return { id, result };
            });
            const results = await Promise.all(promises);
            for (const { id, result } of results) {
                if (result.done) {
                    pending.delete(id);
                }
                else {
                    yield {
                        ...result.value,
                        streamId: id,
                    };
                }
            }
        }
    }
    clear() {
        this.streams.clear();
    }
}
export async function* collectStream(stream) {
    for await (const event of stream) {
        yield event;
    }
}
export async function streamToText(stream) {
    let fullText = '';
    for await (const event of stream) {
        if (event.type === 'token' && event.content) {
            fullText += event.content;
        }
        if (event.type === 'error') {
            throw new Error(event.error || 'Stream error');
        }
    }
    return fullText;
}
export async function streamToArray(stream) {
    const events = [];
    for await (const event of stream) {
        events.push(event);
    }
    return events;
}
export async function streamToBuffer(stream) {
    const chunks = [];
    for await (const event of stream) {
        if (event.content) {
            chunks.push(Buffer.from(event.content, 'utf-8'));
        }
    }
    return Buffer.concat(chunks);
}
export class StreamSplitter {
    separator;
    maxChunkSize;
    buffer = '';
    constructor(options = {}) {
        this.separator = options.separator ?? '\n';
        this.maxChunkSize = options.maxChunkSize ?? 1024;
    }
    async *split(stream) {
        for await (const event of stream) {
            if (event.type === 'token' && event.content) {
                this.buffer += event.content;
                while (this.buffer.length > 0) {
                    const sepIndex = this.buffer.indexOf(this.separator);
                    if (sepIndex === -1) {
                        if (this.buffer.length >= this.maxChunkSize) {
                            const chunk = this.buffer.slice(0, this.maxChunkSize);
                            this.buffer = this.buffer.slice(this.maxChunkSize);
                            yield { ...event, content: chunk };
                        }
                        else {
                            break;
                        }
                    }
                    else {
                        const chunk = this.buffer.slice(0, sepIndex + this.separator.length);
                        this.buffer = this.buffer.slice(sepIndex + this.separator.length);
                        yield { ...event, content: chunk };
                    }
                }
            }
            else {
                yield event;
            }
        }
        if (this.buffer.length > 0) {
            yield { type: 'token', content: this.buffer, timestamp: Date.now() };
            this.buffer = '';
        }
    }
}
//# sourceMappingURL=streaming.js.map