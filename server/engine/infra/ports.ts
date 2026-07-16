import { createServer } from 'node:net';
import { logger } from '../../logger.js';

export class PortInUseError extends Error {
  readonly port: number;
  readonly details?: string;
  constructor(port: number, details?: string) {
    super(`Port ${port} is already in use${details ? `: ${details}` : ''}`);
    this.name = 'PortInUseError';
    this.port = port;
    this.details = details;
  }
}

export async function describePortOwner(port: number): Promise<string | undefined> {
  return undefined;
}

export async function ensurePortAvailable(port: number, host?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new PortInUseError(port, host));
      } else {
        reject(err);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve());
    });
    server.listen(port, host ?? '0.0.0.0');
  });
}

export function handlePortError(err: unknown, port: number, context: string): void {
  if (err instanceof PortInUseError) {
    logger.error(`[Port] ${context}: port ${port} is already in use`);
  } else {
    logger.error(`[Port] ${context}: failed to bind port ${port}`, err);
  }
}
