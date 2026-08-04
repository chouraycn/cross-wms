import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { logger } from '../../logger.js';
import type { McpStdioTransportConfig } from './mcp-transport-config.js';
import { isMcpConfigRecord, toMcpEnvRecord, toMcpStringArray } from "./mcp-config-shared.js";

export interface McpStdioTransportOptions {
  config: McpStdioTransportConfig;
}

export interface McpMessage {
  jsonrpc: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class McpStdioTransport {
  private config: McpStdioTransportConfig;
  private process: ChildProcessWithoutNullStreams | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number | string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout?: ReturnType<typeof setTimeout>;
  }>();
  private buffer = '';
  private connected = false;
  private messageHandlers: Array<(message: McpMessage) => void> = [];

  constructor(options: McpStdioTransportOptions) {
    this.config = options.config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(
          this.config.command,
          this.config.args,
          {
            cwd: this.config.cwd,
            env: { ...process.env, ...this.config.env },
          },
        );

        this.process.stdout.on('data', (data: Buffer) => {
          this.handleData(data.toString());
        });

        this.process.stderr.on('data', (data: Buffer) => {
          logger.debug(`[Agents:McpStdio] stderr: ${data.toString().trim()}`);
        });

        this.process.on('error', (err) => {
          logger.error('[Agents:McpStdio] Process error:', err);
          reject(err);
        });

        this.process.on('close', (code) => {
          logger.debug(`[Agents:McpStdio] Process exited with code ${code}`);
          this.connected = false;
          this.cleanup();
        });

        this.connected = true;
        logger.debug(`[Agents:McpStdio] Connected to ${this.config.name}`);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line) as McpMessage;
        this.handleMessage(message);
      } catch (err) {
        logger.warn('[Agents:McpStdio] Failed to parse message:', err);
      }
    }
  }

  private handleMessage(message: McpMessage): void {
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        if (pending.timeout) {
          clearTimeout(pending.timeout);
        }
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
        return;
      }
    }

    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (err) {
        logger.error('[Agents:McpStdio] Message handler error:', err);
      }
    }
  }

  sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.connected || !this.process) {
      return Promise.reject(new Error('Not connected'));
    }

    const id = ++this.messageId;
    const message: McpMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, this.config.timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      try {
        this.process!.stdin.write(JSON.stringify(message) + '\n');
      } catch (err) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  sendNotification(method: string, params?: unknown): void {
    if (!this.connected || !this.process) return;

    const message: McpMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    try {
      this.process.stdin.write(JSON.stringify(message) + '\n');
    } catch (err) {
      logger.error('[Agents:McpStdio] Failed to send notification:', err);
    }
  }

  onMessage(handler: (message: McpMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  offMessage(handler: (message: McpMessage) => void): void {
    const index = this.messageHandlers.indexOf(handler);
    if (index > -1) {
      this.messageHandlers.splice(index, 1);
    }
  }

  isConnected(): boolean {
    return this.connected && this.process !== null && !this.process.killed;
  }

  disconnect(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.connected = false;
    
    for (const [, pending] of this.pendingRequests) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(new Error('Transport disconnected'));
    }
    this.pendingRequests.clear();
  }
}

export function createMcpStdioTransport(config: McpStdioTransportConfig): McpStdioTransport {
  return new McpStdioTransport({ config });
}

logger.debug('[Agents:McpStdio] Module loaded');

// ============================================================================
// Stdio MCP launch config normalization (merged from openclaw/src/agents/mcp-stdio.ts)
// Accepts OpenClaw and upstream MCP config field names, keeping only
// command/args/env/cwd needed to spawn a stdio server.
// ============================================================================

/** Normalized stdio MCP server launch config. */
export type StdioMcpServerLaunchConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

type StdioMcpServerLaunchResult =
  | { ok: true; config: StdioMcpServerLaunchConfig }
  | { ok: false; reason: string };

/** Resolve raw MCP server config into a stdio launch config. */
export function resolveStdioMcpServerLaunchConfig(
  raw: unknown,
  options?: { onDroppedEnv?: (key: string, value: unknown) => void },
): StdioMcpServerLaunchResult {
  if (!isMcpConfigRecord(raw)) {
    return { ok: false, reason: "server config must be an object" };
  }
  if (typeof raw.command !== "string" || raw.command.trim().length === 0) {
    if (typeof raw.url === "string" && raw.url.trim().length > 0) {
      return {
        ok: false,
        reason: "not a stdio server (has url)",
      };
    }
    return { ok: false, reason: "its command is missing" };
  }
  const cwd =
    typeof raw.cwd === "string" && raw.cwd.trim().length > 0
      ? raw.cwd
      : typeof raw.workingDirectory === "string" && raw.workingDirectory.trim().length > 0
        ? raw.workingDirectory
        : undefined;
  return {
    ok: true,
    config: {
      command: raw.command,
      args: toMcpStringArray(raw.args),
      env: toMcpEnvRecord(raw.env, { onDroppedEntry: options?.onDroppedEnv }),
      cwd,
    },
  };
}

/** Describe a stdio MCP launch config for diagnostics. */
export function describeStdioMcpServerLaunchConfig(config: StdioMcpServerLaunchConfig): string {
  const args =
    Array.isArray(config.args) && config.args.length > 0 ? ` ${config.args.join(" ")}` : "";
  const cwd = config.cwd ? ` (cwd=${config.cwd})` : "";
  return `${config.command}${args}${cwd}`;
}
