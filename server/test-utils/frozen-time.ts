interface FrozenTimeOptions {
  now?: number | Date;
  shouldAdvance?: boolean;
}

class FrozenTime {
  private originalDate: typeof Date;
  private originalNow: typeof Date.now;
  private originalPerformanceNow: typeof performance.now;
  private frozenMs: number;
  private enabled = false;
  private shouldAdvance: boolean;

  constructor(options: FrozenTimeOptions = {}) {
    this.frozenMs = options.now instanceof Date ? options.now.getTime() : (options.now ?? Date.now());
    this.shouldAdvance = options.shouldAdvance ?? false;
    this.originalDate = Date;
    this.originalNow = Date.now;
    this.originalPerformanceNow = performance.now.bind(performance);
  }

  freeze(): void {
    if (this.enabled) return;
    this.enabled = true;

    const FrozenDate = function (this: Date, ...args: unknown[]) {
      if (new.target) {
        if (args.length === 0) {
          return new this.originalDate(this.frozenMs);
        }
        return new this.originalDate(...args as ConstructorParameters<typeof Date>);
      }
      return this.originalDate(...args as Parameters<typeof Date>);
    } as unknown as typeof Date;

    Object.setPrototypeOf(FrozenDate, this.originalDate);
    FrozenDate.prototype = this.originalDate.prototype;
    FrozenDate.now = () => {
      const current = self.frozenMs;
      if (self.shouldAdvance) {
        self.frozenMs += 1;
      }
      return current;
    };
    FrozenDate.parse = this.originalDate.parse.bind(this.originalDate);
    FrozenDate.UTC = this.originalDate.UTC.bind(this.originalDate);

    globalThis.Date = FrozenDate;
    globalThis.performance.now = () => this.frozenMs;
  }

  unfreeze(): void {
    if (!this.enabled) return;
    this.enabled = false;
    globalThis.Date = this.originalDate;
    globalThis.Date.now = this.originalNow;
    globalThis.performance.now = this.originalPerformanceNow;
  }

  advance(ms: number): void {
    this.frozenMs += ms;
  }

  set(now: number | Date): void {
    this.frozenMs = now instanceof Date ? now.getTime() : now;
  }

  get(): number {
    return this.frozenMs;
  }
}

export function freezeTime(options: FrozenTimeOptions = {}): {
  frozen: FrozenTime;
  cleanup: () => void;
} {
  const frozen = new FrozenTime(options);
  frozen.freeze();
  const cleanup = () => frozen.unfreeze();
  return { frozen, cleanup };
}

export function advanceTime(ms: number): void {
  const now = Date.now();
  const newDate = new Date(now + ms);
  const frozenDate = globalThis.Date as any;
  if (frozenDate._frozenMs !== undefined) {
    frozenDate._frozenMs = newDate.getTime();
  }
}