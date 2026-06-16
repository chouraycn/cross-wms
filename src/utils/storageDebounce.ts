/**
 * Debounced localStorage writer.
 *
 * Wraps localStorage.setItem with per-key debouncing so that rapid
 * consecutive writes to the same key (e.g. streaming session updates)
 * only flush once after the batch settles.
 *
 * Usage:
 *   const debouncedStorage = createDebouncedStorage(300);
 *   debouncedStorage.setItem('my-key', JSON.stringify(data));
 */

type FlushFn = () => void;

class DebouncedStorage {
  private pending = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> | null }>();
  private delay: number;

  constructor(delayMs = 300) {
    this.delay = delayMs;
  }

  /** Schedule a debounced write. Each call resets the timer for that key. */
  setItem(key: string, value: string): void {
    const entry = this.pending.get(key);

    if (entry) {
      // Update the pending value and reset the timer
      entry.value = value;
      if (entry.timer !== null) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => this.flush(key), this.delay);
    } else {
      // First write for this key — schedule the flush
      this.pending.set(key, {
        value,
        timer: setTimeout(() => this.flush(key), this.delay),
      });
    }
  }

  /** Force an immediate flush for a specific key. */
  flush(key: string): void {
    const entry = this.pending.get(key);
    if (!entry) return;

    if (entry.timer !== null) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }

    try {
      localStorage.setItem(key, entry.value);
    } catch {
      // Quota exceeded or other storage error — silently ignore
    }

    this.pending.delete(key);
  }

  /** Flush all pending keys immediately (call on app teardown). */
  flushAll(): void {
    for (const key of this.pending.keys()) {
      this.flush(key);
    }
  }

  /** Cancel a pending write without flushing. */
  cancel(key: string): void {
    const entry = this.pending.get(key);
    if (!entry) return;

    if (entry.timer !== null) {
      clearTimeout(entry.timer);
    }
    this.pending.delete(key);
  }
}

/** Singleton instance — create one per application lifecycle. */
let instance: DebouncedStorage | null = null;

export function getDebouncedStorage(delayMs = 300): DebouncedStorage {
  if (!instance) {
    instance = new DebouncedStorage(delayMs);
  }
  return instance;
}

export { DebouncedStorage };
export default getDebouncedStorage;
