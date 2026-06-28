/**
 * WebSocket Reconnect Manager
 * WebSocket 重连管理器，实现指数退避重连机制
 */

export interface ReconnectConfig {
  /** 初始重连延迟（毫秒） */
  initialDelayMs: number;
  /** 最大重连延迟（毫秒） */
  maxDelayMs: number;
  /** 重连延迟倍数 */
  factor: number;
  /** 随机抖动比例 (0-1) */
  jitter: number;
  /** 最大重连次数，0 表示无限 */
  maxAttempts: number;
  /** 重连超时（毫秒） */
  timeoutMs: number;
}

export interface ReconnectState {
  attempt: number;
  nextDelayMs: number;
  isReconnecting: boolean;
  lastError?: Error;
  lastAttemptAt?: number;
}

export interface ReconnectEvents {
  onAttempt?: (attempt: number, delayMs: number) => void;
  onSuccess?: (attempt: number) => void;
  onFailure?: (attempt: number, error: Error, willRetry: boolean) => void;
  onTimeout?: () => void;
}

/**
 * 计算指数退避延迟
 */
function computeBackoffDelay(config: ReconnectConfig, attempt: number): number {
  const base = config.initialDelayMs * Math.pow(config.factor, Math.max(attempt - 1, 0));
  const jitter = base * config.jitter * Math.random();
  return Math.min(config.maxDelayMs, Math.round(base + jitter));
}

const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  factor: 2,
  jitter: 0.3,
  maxAttempts: 10,
  timeoutMs: 10000,
};

/**
 * WebSocket 重连管理器
 * 实现指数退避重连、状态管理和重连事件回调
 */
export class WebSocketReconnector {
  private readonly config: ReconnectConfig;
  private readonly events: ReconnectEvents;
  private state: ReconnectState;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;

  constructor(config: Partial<ReconnectConfig> = {}, events: ReconnectEvents = {}) {
    this.config = { ...DEFAULT_RECONNECT_CONFIG, ...config };
    this.events = events;
    this.state = {
      attempt: 0,
      nextDelayMs: this.config.initialDelayMs,
      isReconnecting: false,
    };
  }

  /**
   * 获取当前重连状态
   */
  getState(): Readonly<ReconnectState> {
    return { ...this.state };
  }

  /**
   * 检查是否正在进行重连
   */
  isReconnecting(): boolean {
    return this.state.isReconnecting;
  }

  /**
   * 执行重连
   * @param connectFn 建立连接的函数，返回 Promise
   */
  async reconnect<T>(connectFn: () => Promise<T>): Promise<T> {
    if (this.state.isReconnecting) {
      throw new Error('Reconnection already in progress');
    }

    this.abortController = new AbortController();
    this.state.isReconnecting = true;
    this.state.attempt++;

    const attempt = this.state.attempt;
    const delayMs = computeBackoffDelay(this.config, attempt);

    this.state.nextDelayMs = delayMs;
    this.state.lastAttemptAt = Date.now();

    this.events.onAttempt?.(attempt, delayMs);

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.handleFailure(attempt, new Error('Reconnection timeout'), reject);
      }, this.config.timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        this.abortController = null;
      };

      connectFn()
        .then((result) => {
          cleanup();
          this.handleSuccess(attempt);
          resolve(result);
        })
        .catch((error) => {
          cleanup();
          this.handleFailure(attempt, error as Error, reject);
        });

      if (this.abortController?.signal.aborted) {
        cleanup();
        reject(new Error('Reconnection aborted'));
      }
    });
  }

  /**
   * 调度重连
   * @param connectFn 建立连接的函数
   */
  scheduleReconnect<T>(connectFn: () => Promise<T>): void {
    if (this.reconnectTimer) {
      return;
    }

    const scheduleNext = () => {
      if (this.abortController?.signal.aborted) {
        return;
      }

      const willRetry =
        this.config.maxAttempts === 0 || this.state.attempt < this.config.maxAttempts;

      if (!willRetry) {
        this.state.isReconnecting = false;
        this.events.onTimeout?.();
        return;
      }

      this.state.attempt++;
      const delayMs = computeBackoffDelay(this.config, this.state.attempt);
      this.state.nextDelayMs = delayMs;
      this.state.lastAttemptAt = Date.now();

      this.events.onAttempt?.(this.state.attempt, delayMs);

      this.reconnectTimer = setTimeout(async () => {
        this.reconnectTimer = null;

        if (this.abortController?.signal.aborted) {
          return;
        }

        try {
          await this.reconnect(connectFn);
        } catch (error) {
          // 错误已在 reconnect 中处理
        }
      }, delayMs);
    };

    scheduleNext();
  }

  /**
   * 停止重连
   */
  stop(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.state.isReconnecting = false;
  }

  /**
   * 重置重连状态
   */
  reset(): void {
    this.stop();
    this.state = {
      attempt: 0,
      nextDelayMs: this.config.initialDelayMs,
      isReconnecting: false,
      lastError: undefined,
      lastAttemptAt: undefined,
    };
  }

  private handleSuccess(attempt: number): void {
    this.state.isReconnecting = false;
    this.state.lastError = undefined;
    this.events.onSuccess?.(attempt);
  }

  private handleFailure<T>(
    attempt: number,
    error: Error,
    reject: (reason: Error) => void,
  ): void {
    this.state.lastError = error;

    const willRetry =
      this.config.maxAttempts === 0 || attempt < this.config.maxAttempts;

    this.events.onFailure?.(attempt, error, willRetry);

    if (willRetry) {
      this.scheduleReconnect(() => Promise.reject(error));
    } else {
      this.state.isReconnecting = false;
      this.events.onTimeout?.();
      reject(error);
    }
  }
}

/**
 * 创建重连管理器
 */
export function createReconnector(
  config?: Partial<ReconnectConfig>,
  events?: ReconnectEvents,
): WebSocketReconnector {
  return new WebSocketReconnector(config, events);
}
