import net from 'node:net';
import { logger } from '../../logger.js';
import { authorizeHttpGatewayConnect } from './auth.js';

export type GatewayServerOptions = {
  port?: number;
  host?: string;
  auth?: {
    mode?: 'none' | 'token' | 'password' | 'trusted-proxy';
    token?: string;
    password?: string;
    trustedProxies?: string[];
  };
  maxConnections?: number;
  requestTimeoutMs?: number;
};

export type GatewayServer = {
  port: number;
  host: string;
  close: () => Promise<void>;
  isRunning: () => boolean;
};

let activeServer: GatewayServer | null = null;

async function ensurePortAvailable(port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(err);
      } else {
        reject(err);
      }
    });
    tester.once('listening', () => {
      tester.close(() => resolve());
    });
    tester.listen(port, host);
  });
}

function handlePortError(err: unknown, port: number, context: string): void {
  logger.error(`[Gateway] Port ${port} not available for ${context}:`, err);
}

export async function startGatewayServer(options?: GatewayServerOptions): Promise<GatewayServer> {
  const port = options?.port ?? 3000;
  const host = options?.host ?? '127.0.0.1';

  logger.info(`[Gateway] Starting server on ${host}:${port}`);

  if (activeServer?.isRunning()) {
    logger.warn('[Gateway] Server already running');
    return activeServer;
  }

  try {
    await ensurePortAvailable(port, host);
  } catch (err) {
    handlePortError(err, port, 'gateway server');
    throw err;
  }

  let running = true;

  const server: GatewayServer = {
    port,
    host,
    isRunning: () => running,
    close: async () => {
      running = false;
      activeServer = null;
      logger.info(`[Gateway] Server stopped on ${host}:${port}`);
      await publishEvent('system:shutdown', { component: 'gateway', port, host });
    },
  };

  activeServer = server;
  await publishEvent('system:startup', { component: 'gateway', port, host });

  return server;
}

export async function stopGatewayServer(): Promise<void> {
  if (activeServer) {
    await activeServer.close();
  }
}

async function publishEvent(event: string, data: Record<string, unknown>): Promise<void> {
  try {
    const { publishEvent: pub } = await import('../events.js');
    await pub(event as any, data);
  } catch { /* events not available */ }
}

export function truncateCloseReason(reason: string, maxLen = 240): string {
  if (reason.length <= maxLen) return reason;
  return reason.slice(0, maxLen - 3) + '...';
}
