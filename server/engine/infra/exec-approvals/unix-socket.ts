import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { logger } from '../../../logger.js';
import type { UnixSocketMessage, UnixSocketResponse } from './types.js';

export type UnixSocketServerOptions = {
  socketPath?: string;
  onMessage?: (message: UnixSocketMessage, socket: net.Socket) => Promise<unknown>;
};

export type UnixSocketClientOptions = {
  socketPath?: string;
  timeoutMs?: number;
};

const DEFAULT_SOCKET_DIR = path.join(os.tmpdir(), 'cross-wms');
const DEFAULT_SOCKET_NAME = 'exec-approval.sock';

function getDefaultSocketPath(): string {
  return path.join(DEFAULT_SOCKET_DIR, DEFAULT_SOCKET_NAME);
}

function ensureSocketDir(socketPath: string): void {
  const dir = path.dirname(socketPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export class UnixSocketServer {
  private server: net.Server | null = null;
  private socketPath: string;
  private onMessage?: (message: UnixSocketMessage, socket: net.Socket) => Promise<unknown>;
  private sockets = new Set<net.Socket>();

  constructor(options: UnixSocketServerOptions = {}) {
    this.socketPath = options.socketPath ?? getDefaultSocketPath();
    this.onMessage = options.onMessage;
  }

  async start(): Promise<void> {
    ensureSocketDir(this.socketPath);

    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch (err) {
        logger.warn(`[UnixSocket] Failed to remove existing socket: ${err}`);
      }
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer();
      
      this.server.on('connection', (socket) => {
        this.sockets.add(socket);
        this.handleConnection(socket);
        
        socket.on('close', () => {
          this.sockets.delete(socket);
        });
      });

      this.server.on('error', (err) => {
        logger.error(`[UnixSocket] Server error: ${err.message}`);
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        fs.chmodSync(this.socketPath, 0o700);
        logger.info(`[UnixSocket] Server listening on ${this.socketPath}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          if (fs.existsSync(this.socketPath)) {
            try {
              fs.unlinkSync(this.socketPath);
            } catch {
              // ignore
            }
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private handleConnection(socket: net.Socket): void {
    let buffer = Buffer.alloc(0);

    socket.on('data', async (data) => {
      buffer = Buffer.concat([buffer, data as Buffer]);
      
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).toString('utf8');
        buffer = buffer.slice(newlineIndex + 1);
        
        try {
          const message = JSON.parse(line) as UnixSocketMessage;
          await this.handleMessage(message, socket);
        } catch (err) {
          logger.error(`[UnixSocket] Failed to parse message: ${err}`);
          this.sendResponse(socket, {
            requestId: 'unknown',
            success: false,
            error: 'Invalid message format',
          });
        }
      }
    });

    socket.on('error', (err) => {
      logger.error(`[UnixSocket] Socket error: ${err.message}`);
    });
  }

  private async handleMessage(message: UnixSocketMessage, socket: net.Socket): Promise<void> {
    if (!this.onMessage) {
      this.sendResponse(socket, {
        requestId: message.requestId,
        success: false,
        error: 'No message handler configured',
      });
      return;
    }

    try {
      const result = await this.onMessage(message, socket);
      this.sendResponse(socket, {
        requestId: message.requestId,
        success: true,
        data: result,
      });
    } catch (err) {
      logger.error(`[UnixSocket] Handler error: ${err}`);
      this.sendResponse(socket, {
        requestId: message.requestId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private sendResponse(socket: net.Socket, response: UnixSocketResponse): void {
    if (socket.writable) {
      socket.write(JSON.stringify(response) + '\n');
    }
  }

  get isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  get path(): string {
    return this.socketPath;
  }
}

export class UnixSocketClient {
  private socket: net.Socket | null = null;
  private socketPath: string;
  private timeoutMs: number;
  private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();
  private buffer = Buffer.alloc(0);

  constructor(options: UnixSocketClientOptions = {}) {
    this.socketPath = options.socketPath ?? getDefaultSocketPath();
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.socketPath);
      
      this.socket.on('connect', () => {
        logger.debug(`[UnixSocket] Client connected to ${this.socketPath}`);
        resolve();
      });

      this.socket.on('data', (data) => {
        this.buffer = Buffer.concat([this.buffer, data as Buffer]);
        
        let newlineIndex;
        while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
          const line = this.buffer.slice(0, newlineIndex).toString('utf8');
          this.buffer = this.buffer.slice(newlineIndex + 1);
          
          try {
            const response = JSON.parse(line) as UnixSocketResponse;
            this.handleResponse(response);
          } catch (err) {
            logger.error(`[UnixSocket] Failed to parse response: ${err}`);
          }
        }
      });

      this.socket.on('error', (err) => {
        reject(err);
      });

      this.socket.on('close', () => {
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
      });
    });
  }

  async send(message: UnixSocketMessage): Promise<unknown> {
    if (!this.socket || !this.socket.writable) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.requestId);
        reject(new Error('Request timeout'));
      }, this.timeoutMs);

      this.pendingRequests.set(message.requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (reason) => {
          clearTimeout(timeout);
          reject(reason);
        },
      });

      this.socket!.write(JSON.stringify(message) + '\n');
    });
  }

  private handleResponse(response: UnixSocketResponse): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (pending) {
      this.pendingRequests.delete(response.requestId);
      if (response.success) {
        pending.resolve(response.data);
      } else {
        pending.reject(new Error(response.error ?? 'Unknown error'));
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.pendingRequests.clear();
  }

  get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }
}
