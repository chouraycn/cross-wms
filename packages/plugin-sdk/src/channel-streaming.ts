// 通道流式传输：兼容子路径。
// @deprecated openclaw 原始实现从 ../channels/streaming.js 重导出，依赖未移植。
// 建议使用 openclaw/plugin-sdk/channel-outbound。此处提供最小可用类型与桩函数。

/** 流式传输模式。 */
export type StreamingMode = "block" | "live" | "off";

/** 流式传输块配置。 */
export type BlockStreamingCoalesceConfig = {
  /** 合并窗口（毫秒）。 */
  coalesceMs?: number;
  /** 最大块大小。 */
  maxChunkSize?: number;
};

/** 流式传输状态。 */
export type StreamingState = "idle" | "streaming" | "coalescing" | "flushed" | "cancelled";

/** 流式传输控制器。 */
export type StreamingController = {
  start(): void;
  push(text: string): void;
  flush(): Promise<void>;
  cancel(): Promise<void>;
  state(): StreamingState;
};

/** 流式传输选项。 */
export type StreamingOptions = {
  mode?: StreamingMode;
  coalesce?: BlockStreamingCoalesceConfig;
  onChunk?(chunk: string): void;
  onFlush?(fullText: string): void;
};

/** 创建流式传输控制器。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function createStreamingController(options?: StreamingOptions): StreamingController {
  let state: StreamingState = "idle";
  const chunks: string[] = [];
  return {
    start() {
      state = "streaming";
    },
    push(text) {
      if (state === "streaming") {
        chunks.push(text);
        options?.onChunk?.(text);
      }
    },
    async flush() {
      state = "flushed";
      const fullText = chunks.join("");
      options?.onFlush?.(fullText);
      chunks.length = 0;
    },
    async cancel() {
      state = "cancelled";
      chunks.length = 0;
    },
    state() {
      return state;
    },
  };
}

/** 解析流式传输模式。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function resolveStreamingMode(_input?: unknown): StreamingMode {
  return "block";
}

/** 解析块流式传输合并配置。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function resolveBlockStreamingCoalesceConfig(_input?: unknown): BlockStreamingCoalesceConfig {
  return { coalesceMs: 500, maxChunkSize: 1000 };
}

/** 判断是否启用流式传输。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function isStreamingEnabled(mode?: StreamingMode): boolean {
  return mode !== "off" && mode !== undefined;
}
