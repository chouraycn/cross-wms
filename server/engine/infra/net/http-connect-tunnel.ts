import * as net from 'node:net';
import { logger } from '../../../logger.js';

export type HttpConnectTunnelOptions = {
  proxyHost: string;
  proxyPort: number;
  targetHost: string;
  targetPort: number;
  proxyUsername?: string;
  proxyPassword?: string;
  timeoutMs?: number;
};

export type HttpConnectTunnelResult = {
  socket: net.Socket;
  statusCode: number;
  statusText: string;
};

function buildConnectRequest(
  targetHost: string,
  targetPort: number,
  username?: string,
  password?: string,
): string {
  const lines: string[] = [];
  lines.push(`CONNECT ${targetHost}:${targetPort} HTTP/1.1`);
  lines.push(`Host: ${targetHost}:${targetPort}`);
  lines.push('Proxy-Connection: keep-alive');
  
  if (username && password) {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    lines.push(`Proxy-Authorization: Basic ${credentials}`);
  }
  
  lines.push('');
  lines.push('');
  return lines.join('\r\n');
}

function readResponseHeaders(socket: net.Socket): Promise<{ statusCode: number; statusText: string; rest: Buffer }> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    
    const onData = (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);
      
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        socket.removeListener('data', onData);
        socket.removeListener('error', onError);
        socket.removeListener('close', onClose);
        
        const headerPart = buffer.slice(0, headerEnd).toString('utf8');
        const rest = buffer.slice(headerEnd + 4);
        
        const firstLine = headerPart.split('\r\n')[0] ?? '';
        const match = firstLine.match(/^HTTP\/\d+\.\d+ (\d+) (.*)$/);
        if (!match) {
          reject(new Error('Invalid CONNECT response'));
          return;
        }
        
        resolve({
          statusCode: parseInt(match[1], 10),
          statusText: match[2],
          rest,
        });
      }
    };
    
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    
    const onClose = () => {
      cleanup();
      reject(new Error('Connection closed before CONNECT response'));
    };
    
    const cleanup = () => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
    };
    
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

export async function createHttpConnectTunnel(
  options: HttpConnectTunnelOptions,
): Promise<HttpConnectTunnelResult> {
  const {
    proxyHost,
    proxyPort,
    targetHost,
    targetPort,
    proxyUsername,
    proxyPassword,
    timeoutMs = 30_000,
  } = options;

  logger.debug(`[Tunnel] Creating HTTP CONNECT tunnel to ${targetHost}:${targetPort} via ${proxyHost}:${proxyPort}`);

  const socket = net.createConnection({
    host: proxyHost,
    port: proxyPort,
  });

  socket.setTimeout(timeoutMs);

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
      socket.once('timeout', () => reject(new Error('Connection timeout')));
    });

    const request = buildConnectRequest(targetHost, targetPort, proxyUsername, proxyPassword);
    socket.write(request);

    const response = await readResponseHeaders(socket);

    if (response.statusCode !== 200) {
      socket.destroy();
      throw new Error(`CONNECT failed with status ${response.statusCode}: ${response.statusText}`);
    }

    logger.debug(`[Tunnel] CONNECT tunnel established to ${targetHost}:${targetPort}`);

    return {
      socket,
      statusCode: response.statusCode,
      statusText: response.statusText,
    };
  } catch (err) {
    if (!socket.destroyed) {
      socket.destroy();
    }
    throw err;
  }
}

export function closeHttpConnectTunnel(result: HttpConnectTunnelResult): void {
  if (result.socket && !result.socket.destroyed) {
    result.socket.destroy();
  }
}
