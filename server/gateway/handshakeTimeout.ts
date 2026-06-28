/**
 * WebSocket Handshake Timeout Handler
 * WebSocket 握手超时处理模块
 */

export interface HandshakeTimeoutConfig {
  /** 握手超时时间（毫秒） */
  timeoutMs: number;
  /** 是否自动清理 */
  autoCleanup: boolean;
}

export interface HandshakeTimeoutState {
  isPending: boolean;
  startedAt?: number;
  expiresAt?: number;
  remainingMs?: number;
}

export interface HandshakeTimeoutEvents {
  onTimeout?: (context: { clientId: string; elapsedMs: number }) => void;
  onExpired?: (context: { clientId: string; elapsedMs: number }) => void;
  onCleared?: (context: { clientId: string; elapsedMs: number; wasExpired: boolean }) => void;
}

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10000;
const DEFAULT_CONFIG: HandshakeTimeoutConfig = {
  timeoutMs: DEFAULT_HANDSHAKE_TIMEOUT_MS,
  autoCleanup: true,
};

/**
 * 握手超时管理器
 * 检测并处理 WebSocket 握手超时
 */
export class HandshakeTimeoutManager {
  private readonly config: HandshakeTimeoutConfig;
  private readonly events: HandshakeTimeoutEvents;
  private readonly clientId: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private state: HandshakeTimeoutState;
  private cleared = false;

  constructor(
    clientId: string,
    config: Partial<HandshakeTimeoutConfig> = {},
    events: HandshakeTimeoutEvents = {},
  ) {
    this.clientId = clientId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = events;
    this.state = { isPending: false };
  }

  /**
   * 获取当前状态
   */
  getState(): Readonly<HandshakeTimeoutState> {
    return { ...this.state };
  }

  /**
   * 获取剩余时间
   */
  getRemainingMs(): number {
    if (!this.state.expiresAt) {
      return this.config.timeoutMs;
    }
    return Math.max(0, this.state.expiresAt - Date.now());
  }

  /**
   * 启动握手超时计时器
   */
  start(): void {
    if (this.state.isPending) {
      return;
    }

    this.cleared = false;
    const now = Date.now();

    this.state = {
      isPending: true,
      startedAt: now,
      expiresAt: now + this.config.timeoutMs,
      remainingMs: this.config.timeoutMs,
    };

    this.events.onTimeout?.({
      clientId: this.clientId,
      elapsedMs: 0,
    });

    this.timer = setTimeout(() => {
      this.handleTimeout();
    }, this.config.timeoutMs);
  }

  /**
   * 清除握手超时
   * @param reason 清除原因
   */
  clear(reason?: string): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const wasExpired = this.state.isPending && !this.cleared;
    const elapsedMs = this.state.startedAt ? Date.now() - this.state.startedAt : 0;

    this.state = { isPending: false };
    this.cleared = true;

    this.events.onCleared?.({
      clientId: this.clientId,
      elapsedMs,
      wasExpired,
    });
  }

  /**
   * 更新超时配置
   */
  updateConfig(config: Partial<HandshakeTimeoutConfig>): void {
    if (!this.state.isPending) {
      return;
    }

    const wasExpired = this.state.expiresAt ? Date.now() >= this.state.expiresAt : false;

    if (wasExpired) {
      return;
    }

    const remainingMs = this.getRemainingMs();
    const newTimeoutMs = config.timeoutMs ?? this.config.timeoutMs;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.state = {
      isPending: true,
      startedAt: this.state.startedAt,
      expiresAt: Date.now() + newTimeoutMs,
      remainingMs: newTimeoutMs,
    };

    this.timer = setTimeout(() => {
      this.handleTimeout();
    }, newTimeoutMs);
  }

  /**
   * 停止计时器
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state = { isPending: false };
  }

  private handleTimeout(): void {
    this.timer = null;

    if (this.cleared) {
      return;
    }

    const elapsedMs = this.state.startedAt ? Date.now() - this.state.startedAt : this.config.timeoutMs;

    this.state = { isPending: false };

    this.events.onExpired?.({
      clientId: this.clientId,
      elapsedMs,
    });

    if (this.config.autoCleanup) {
      this.cleared = true;
    }
  }
}

/**
 * 创建握手超时管理器
 */
export function createHandshakeTimeoutManager(
  clientId: string,
  config?: Partial<HandshakeTimeoutConfig>,
  events?: HandshakeTimeoutEvents,
): HandshakeTimeoutManager {
  return new HandshakeTimeoutManager(clientId, config, events);
}

/**
 * 握手超时工具函数
 */
export function resolveHandshakeTimeoutMs(configuredMs?: number): number {
  if (configuredMs === undefined || configuredMs <= 0) {
    return DEFAULT_HANDSHAKE_TIMEOUT_MS;
  }
  return Math.min(Math.max(configuredMs, 1000), 60000);
}
