/**
 * CrossWMS IPC Client
 *
 * Node.js 端通过 Unix Socket 与 Swift 原生应用通信的客户端。
 * 支持发送系统通知、播放音效、检查更新等命令。
 *
 * 用法：
 *   import { ipcClient } from './ipcClient.js';
 *   await ipcClient.notify('标题', '内容');
 *   await ipcClient.playSound('Glass');
 */

import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { logger } from './logger.js';

const DEFAULT_SOCKET_PATH = process.env.CROSSWMS_IPC_SOCKET
  || path.join(os.homedir(), 'Library', 'Application Support', 'CrossWMS', 'control.sock');

interface IPCRequest {
  type: string;
  [key: string]: unknown;
}

interface IPCResponse {
  ok: boolean;
  message?: string;
  payload?: string;
}

type RequestCallback = (response: IPCResponse) => void;

class CDFKnowIPCClient {
  private socketPath: string;
  private socket: net.Socket | null = null;
  private connected = false;
  private connecting = false;
  private buffer = '';
  private pendingRequests: Map<number, RequestCallback> = new Map();
  private requestId = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(socketPath: string = DEFAULT_SOCKET_PATH) {
    this.socketPath = socketPath;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) {
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (this.connected) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('Connection timeout'));
        }, 5000);
      });
    }

    this.connecting = true;

    return new Promise((resolve, reject) => {
      try {
        this.socket = net.createConnection(this.socketPath, () => {
          logger.info('[IPCClient] Connected to Swift IPC server');
          this.connected = true;
          this.connecting = false;
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket.on('data', (data: Buffer) => {
          this.handleData(data);
        });

        this.socket.on('error', (err) => {
          logger.error('[IPCClient] Socket error:', err.message);
          this.connecting = false;
          this.connected = false;
          reject(err);
        });

        this.socket.on('close', () => {
          logger.info('[IPCClient] Connection closed');
          this.connected = false;
          this.connecting = false;
          this.scheduleReconnect();
        });

        this.socket.on('end', () => {
          logger.info('[IPCClient] Connection ended');
          this.connected = false;
        });
      } catch (err) {
        this.connecting = false;
        reject(err);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn('[IPCClient] Max reconnect attempts reached, giving up');
      return;
    }

    if (this.reconnectTimer) return;

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);

    logger.info(`[IPCClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        logger.error('[IPCClient] Reconnect failed:', err.message);
      });
    }, delay);
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString('utf8');

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (!line) continue;

      try {
        const response: IPCResponse = JSON.parse(line);
        this.handleResponse(response);
      } catch (err) {
        logger.error('[IPCClient] Failed to parse response:', err);
      }
    }
  }

  private handleResponse(response: IPCResponse): void {
    const id = this.requestId - 1;
    const callback = this.pendingRequests.get(id);
    if (callback) {
      this.pendingRequests.delete(id);
      callback(response);
    }
  }

  async sendRequest(request: IPCRequest): Promise<IPCResponse> {
    if (!this.connected) {
      try {
        await this.connect();
      } catch {
        return { ok: false, message: 'IPC not available' };
      }
    }

    const id = this.requestId++;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve({ ok: false, message: 'Request timeout' });
      }, 10000);

      this.pendingRequests.set(id, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      try {
        const data = JSON.stringify({ ...request, _id: id }) + '\n';
        this.socket?.write(data);
      } catch (err) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        resolve({ ok: false, message: `Send failed: ${String(err)}` });
      }
    });
  }

  async notify(
    title: string,
    body: string,
    options?: {
      sound?: string;
      priority?: 'passive' | 'active' | 'timeSensitive';
      delivery?: 'system' | 'overlay' | 'auto';
    },
  ): Promise<boolean> {
    const response = await this.sendRequest({
      type: 'notify',
      title,
      body,
      sound: options?.sound,
      priority: options?.priority,
      delivery: options?.delivery,
    });
    return response.ok;
  }

  async playSound(name: string): Promise<boolean> {
    const response = await this.sendRequest({
      type: 'playSound',
      name,
    });
    return response.ok;
  }

  async getStatus(): Promise<Record<string, unknown> | null> {
    const response = await this.sendRequest({
      type: 'status',
    });
    if (response.ok && response.payload) {
      try {
        return JSON.parse(Buffer.from(response.payload, 'base64').toString('utf8'));
      } catch {
        return null;
      }
    }
    return null;
  }

  async checkForUpdates(): Promise<boolean> {
    const response = await this.sendRequest({
      type: 'checkForUpdates',
    });
    return response.ok;
  }

  async openURL(url: string): Promise<boolean> {
    const response = await this.sendRequest({
      type: 'openURL',
      url,
    });
    return response.ok;
  }

  async quit(): Promise<boolean> {
    const response = await this.sendRequest({
      type: 'quit',
    });
    return response.ok;
  }

  async permissionCheck(capabilities?: string[]): Promise<Record<string, boolean> | null> {
    const response = await this.sendRequest({
      type: 'permissionCheck',
      capabilities,
    });
    if (response.ok && response.payload) {
      try {
        return JSON.parse(Buffer.from(response.payload, 'base64').toString('utf8'));
      } catch {
        return null;
      }
    }
    return null;
  }

  async permissionRequest(capability: string): Promise<boolean> {
    const response = await this.sendRequest({
      type: 'permissionRequest',
      capability,
    });
    return response.ok;
  }

  async permissionOpenSettings(capability: string): Promise<boolean> {
    const response = await this.sendRequest({
      type: 'permissionOpenSettings',
      capability,
    });
    return response.ok;
  }

  async openPermissionManager(): Promise<boolean> {
    const response = await this.sendRequest({
      type: 'openPermissionManager',
    });
    return response.ok;
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
    this.pendingRequests.clear();
  }
}

export const ipcClient = new CDFKnowIPCClient();

export default ipcClient;
