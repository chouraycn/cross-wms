import crypto from 'node:crypto';

/**
 * 生成一个随机的十六进制字符串，用于 traceId / spanId
 */
function generateId(length: number = 16): string {
  // Node 20+ 优先使用 crypto.randomUUID 的 hex 片段；回退到随机字节
  try {
    const uuid = crypto.randomUUID().replace(/-/g, '');
    return uuid.slice(0, length);
  } catch {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }
}

/**
 * HTTP 传播用的 Header 键名常量
 */
export const TRACE_HEADER_KEYS = {
  TRACE_ID: 'x-trace-id',
  SPAN_ID: 'x-span-id',
  PARENT_SPAN_ID: 'x-parent-span-id',
} as const;

/**
 * 分布式追踪上下文，支持 Trace -> Span -> Child Span 的层级关系
 */
export class TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly startTime: number;
  private readonly _tags: Record<string, string> = Object.create(null);

  constructor(options?: {
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
    startTime?: number;
    tags?: Record<string, string>;
  }) {
    this.traceId = options?.traceId ?? generateId(32);
    this.spanId = options?.spanId ?? generateId(16);
    this.parentSpanId = options?.parentSpanId;
    this.startTime = options?.startTime ?? Date.now();
    if (options?.tags) {
      Object.assign(this._tags, options.tags);
    }
  }

  /**
   * 设置标签，用于在链路中携带业务维度信息
   */
  setTag(key: string, value: string): void {
    this._tags[key] = value;
  }

  /**
   * 获取标签值
   */
  getTag(key: string): string | undefined {
    return this._tags[key];
  }

  /**
   * 返回所有标签的副本
   */
  getTags(): Record<string, string> {
    return { ...this._tags };
  }

  /**
   * 序列化为 HTTP Header，便于跨服务传播
   */
  toHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      [TRACE_HEADER_KEYS.TRACE_ID]: this.traceId,
      [TRACE_HEADER_KEYS.SPAN_ID]: this.spanId,
    };
    if (this.parentSpanId) {
      headers[TRACE_HEADER_KEYS.PARENT_SPAN_ID] = this.parentSpanId;
    }
    return headers;
  }

  /**
   * 从 HTTP Header 中反序列化 TraceContext
   */
  static fromHeaders(headers: Record<string, string | string[] | undefined>): TraceContext {
    const getHeader = (key: string): string | undefined => {
      const value = headers[key];
      if (Array.isArray(value)) {
        return value[0];
      }
      return value ?? undefined;
    };

    return new TraceContext({
      traceId: getHeader(TRACE_HEADER_KEYS.TRACE_ID),
      spanId: getHeader(TRACE_HEADER_KEYS.SPAN_ID),
      parentSpanId: getHeader(TRACE_HEADER_KEYS.PARENT_SPAN_ID),
    });
  }

  /**
   * 创建子 Span，parentSpanId 指向当前 spanId，traceId 保持不变
   */
  createChildSpan(name?: string): TraceContext {
    const child = new TraceContext({
      traceId: this.traceId,
      parentSpanId: this.spanId,
      tags: name ? { ...this._tags, spanName: name } : { ...this._tags },
    });
    return child;
  }
}
