/**
 * WebSocket Heartbeat Manager
 * WebSocket 心跳保活机制模块
 */

export interface HeartbeatConfig {
  /** ping 间隔（毫秒） */
  pingIntervalMs: number;
  /** pong 超时（毫秒） */
  pongTimeoutMs: number;
  /** 最大连续失败次数 */
  maxMissedPongs: number;
  /** 是否自动启动 */
  autoStart: boolean;
}

export interface HeartbeatState {
  isRunning: boolean;
  lastPingAt?: number;
  lastPongAt?: number;
  consecutiveMissedPongs: number;
  totalPings: number;
  totalPongs: number;
}

export interface HeartbeatEvents {
  onPing?: (context: { clientId: string; pingAt: number }) => void;
  onPong?: (context: { clientId: string; latencyMs: number }) => void;
  onMissedPong?: (context: { clientId: string; consecutiveMissed: number }) => void;
  onTimeout?: (context: { clientId: string; consecutiveMissed: number }) => void;
  onStop?: (context: { clientId: string; reason: string }) => void;
}

const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  pingIntervalMs: 25000,
  pongTimeoutMs: 5000,
  maxMissedPongs: 3,
  autoStart: false,
};

const READY_STATE_OPEN = 1;

/**
 * 心跳管理器
 * 实现 ping/pong 处理和断线检测
 */
export class HeartbeatManager {
  private readonly config: HeartbeatConfig;
  private readonly events: HeartbeatEvents;
  private readonly clientId: string;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private state: HeartbeatState;
  private socket: { ping: () => void; close: (code?: number, reason?: string) => void; readyState: number; removeAllListeners: (event: string) => void } | null = null;
  private stopped = false;

  constructor(
    clientId: string,
    config: Partial<HeartbeatConfig> = {},
    events: HeartbeatEvents = {},
  ) {
    this.clientId = clientId;
    this.config = { ...DEFAULT_HEARTBEAT_CONFIG, ...config };
    this.events = events;
    this.state = {
      isRunning: false,
      consecutiveMissedPongs: 0,
      totalPings: 0,
      totalPongs: 0,
    };
  }

  /**
   * 获取当前状态
   */
  getState(): Readonly<HeartbeatState> {
    return { ...this.state };
  }

  /**
   * 附加 WebSocket 连接
   */
  attach(socket: { ping: () => void; close: (code?: number, reason?: string) => void; readyState: number; removeAllListeners: (event: string) => void }): void {
    if (this.socket) {
      this.detach();
    }
    this.socket = socket;
  }

  /**
   * 分离 WebSocket 连接
   */
  detach(): void {
    this.stop();
    this.socket = null;
  }

  /**
   * 启动心跳
   */
  start(): void {
    if (this.state.isRunning) {
      return;
    }

    if (!this.socket) {
      throw new Error('Socket not attached');
    }

    this.stopped = false;
    this.state = {
      isRunning: true,
      lastPingAt: undefined,
      lastPongAt: undefined,
      consecutiveMissedPongs: 0,
      totalPings: 0,
      totalPongs: 0,
    };

    this.scheduleNextPing();
  }

  /**
   * 停止心跳
   */
  stop(reason = 'normal'): void {
    if (!this.state.isRunning && !this.pingTimer) {
      return;
    }

    this.stopped = true;

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }

    this.state.isRunning = false;

    this.events.onStop?.({
      clientId: this.clientId,
      reason,
    });
  }

  /**
   * 处理收到的 pong 响应
   */
  handlePong(): void {
    if (!this.state.isRunning || this.stopped) {
      return;
    }

    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }

    const now = Date.now();
    const latencyMs = this.state.lastPingAt ? now - this.state.lastPingAt : 0;

    this.state = {
      ...this.state,
      lastPongAt: now,
      consecutiveMissedPongs: 0,
      totalPongs: this.state.totalPongs + 1,
    };

    this.events.onPong?.({
      clientId: this.clientId,
      latencyMs,
    });
  }

  /**
   * 重置心跳状态
   */
  reset(): void {
    const wasRunning = this.state.isRunning;
    this.stop('reset');

    this.state = {
      isRunning: false,
      consecutiveMissedPongs: 0,
      totalPings: 0,
      totalPongs: 0,
    };

    if (wasRunning && this.config.autoStart && this.socket) {
      this.start();
    }
  }

  /**
   * 检查连接是否健康
   */
  isHealthy(): boolean {
    return (
      this.state.isRunning &&
      this.state.consecutiveMissedPongs < this.config.maxMissedPongs
    );
  }

  private scheduleNextPing(): void {
    if (this.stopped) {
      return;
    }

    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, this.config.pingIntervalMs);

    if (typeof this.pingTimer === 'object' && 'unref' in this.pingTimer) {
      (this.pingTimer as NodeJS.Timeout & { unref: () => void }).unref();
    }
  }

  private sendPing(): void {
    if (!this.socket || this.stopped) {
      return;
    }

    if (this.socket.readyState !== READY_STATE_OPEN) {
      this.stop('socket_closed');
      return;
    }

    const now = Date.now();

    this.state = {
      ...this.state,
      lastPingAt: now,
      totalPings: this.state.totalPings + 1,
    };

    this.events.onPing?.({
      clientId: this.clientId,
      pingAt: now,
    });

    try {
      this.socket.ping();
    } catch {
      this.stop('ping_error');
      return;
    }

    this.pongTimer = setTimeout(() => {
      this.handlePongTimeout();
    }, this.config.pongTimeoutMs);
  }

  private handlePongTimeout(): void {
    if (!this.state.isRunning || this.stopped) {
      return;
    }

    this.state = {
      ...this.state,
      consecutiveMissedPongs: this.state.consecutiveMissedPongs + 1,
    };

    const consecutiveMissed = this.state.consecutiveMissedPongs;

    this.events.onMissedPong?.({
      clientId: this.clientId,
      consecutiveMissed,
    });

    if (consecutiveMissed >= this.config.maxMissedPongs) {
      this.events.onTimeout?.({
        clientId: this.clientId,
        consecutiveMissed,
      });
      this.stop('max_missed_pongs');
      this.socket?.close(1000, 'Heartbeat timeout');
    }
  }
}

/**
 * 创建心跳管理器
 */
export function createHeartbeatManager(
  clientId: string,
  config?: Partial<HeartbeatConfig>,
  events?: HeartbeatEvents,
): HeartbeatManager {
  return new HeartbeatManager(clientId, config, events);
}

/**
 * 解析心跳配置
 */
export function resolveHeartbeatConfig(config?: Partial<HeartbeatConfig>): HeartbeatConfig {
  return {
    pingIntervalMs: config?.pingIntervalMs ?? DEFAULT_HEARTBEAT_CONFIG.pingIntervalMs,
    pongTimeoutMs: config?.pongTimeoutMs ?? DEFAULT_HEARTBEAT_CONFIG.pongTimeoutMs,
    maxMissedPongs: config?.maxMissedPongs ?? DEFAULT_HEARTBEAT_CONFIG.maxMissedPongs,
    autoStart: config?.autoStart ?? DEFAULT_HEARTBEAT_CONFIG.autoStart,
  };
}
