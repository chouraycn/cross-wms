import { createServer } from 'net';

async function isPortFree(port: number): Promise<boolean> {
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return false;
  }
  return await new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function getOsFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('failed to acquire free port'));
        return;
      }
      const port = addr.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

let nextTestPortOffset = 0;

export async function getDeterministicFreePortBlock(params?: {
  offsets?: number[];
}): Promise<number> {
  const offsets = params?.offsets ?? [0, 1, 2, 3, 4];
  const maxOffset = Math.max(...offsets);

  const workerIdRaw = process.env.VITEST_WORKER_ID ?? process.env.VITEST_POOL_ID ?? '';
  const workerId = Number.parseInt(workerIdRaw, 10);
  const processShard = Math.abs(process.pid);
  const shard = Number.isFinite(workerId)
    ? Math.max(0, workerId) + processShard
    : processShard;

  const rangeSize = 1000;
  const shardCount = 35;
  const base = 30_000 + (Math.abs(shard) % shardCount) * rangeSize;
  const usable = rangeSize - maxOffset;

  const blockSize = Math.max(maxOffset + 1, 8);

  for (let attempt = 0; attempt < usable; attempt += blockSize) {
    const start = base + ((nextTestPortOffset + attempt) % usable);
    const ok = (await Promise.all(offsets.map((offset) => isPortFree(start + offset)))).every(Boolean);
    if (!ok) continue;
    nextTestPortOffset = (nextTestPortOffset + attempt + blockSize) % usable;
    return start;
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const port = await getOsFreePort();
    const ok = (await Promise.all(offsets.map((offset) => isPortFree(port + offset)))).every(Boolean);
    if (ok) return port;
  }

  throw new Error('failed to acquire a free port block');
}

export async function getFreePort(): Promise<number> {
  return getDeterministicFreePortBlock({ offsets: [0] });
}