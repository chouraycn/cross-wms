import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { resolve } from "path";

export type GatewayLockOptions = {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
};

export class GatewayLock {
  private lockPath: string;
  private timeout: number;
  private retries: number;
  private retryDelay: number;

  constructor(lockPath: string, options: GatewayLockOptions = {}) {
    this.lockPath = resolve(lockPath);
    this.timeout = options.timeout ?? 5000;
    this.retries = options.retries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
  }

  async acquire(): Promise<boolean> {
    for (let i = 0; i <= this.retries; i++) {
      if (this.tryAcquire()) {
        return true;
      }

      if (i < this.retries) {
        await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
      }
    }

    return false;
  }

  tryAcquire(): boolean {
    try {
      const lockData = {
        pid: process.pid,
        timestamp: Date.now(),
      };

      writeFileSync(this.lockPath, JSON.stringify(lockData), { flag: "wx" });
      return true;
    } catch {
      if (this.isStale()) {
        this.release();
        return this.tryAcquire();
      }
      return false;
    }
  }

  release(): void {
    try {
      if (existsSync(this.lockPath)) {
        unlinkSync(this.lockPath);
      }
    } catch {
    }
  }

  isLocked(): boolean {
    if (!existsSync(this.lockPath)) {
      return false;
    }

    return !this.isStale();
  }

  isStale(): boolean {
    try {
      const content = readFileSync(this.lockPath, "utf8");
      const lockData = JSON.parse(content);

      return Date.now() - lockData.timestamp > this.timeout;
    } catch {
      return true;
    }
  }

  getLockInfo(): { pid: number; timestamp: number } | null {
    try {
      const content = readFileSync(this.lockPath, "utf8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}

export function createGatewayLock(name: string, options: GatewayLockOptions = {}): GatewayLock {
  const lockPath = resolve(process.cwd(), `.${name}.lock`);
  return new GatewayLock(lockPath, options);
}