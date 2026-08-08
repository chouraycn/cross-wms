export type RuntimeOverride = {
  key: string;
  value: any;
  source: string;
  timestamp: number;
};

export type RuntimeOverrideOptions = {
  allowOverride?: boolean;
  defaultValue?: any;
  validator?: (value: any) => boolean;
};

export class RuntimeOverrides {
  private overrides: Map<string, RuntimeOverride> = new Map();

  set(key: string, value: any, source: string = "unknown"): void {
    this.overrides.set(key, {
      key,
      value,
      source,
      timestamp: Date.now(),
    });
  }

  get(key: string): RuntimeOverride | undefined {
    return this.overrides.get(key);
  }

  getValue(key: string): any {
    const override = this.overrides.get(key);
    return override?.value;
  }

  has(key: string): boolean {
    return this.overrides.has(key);
  }

  delete(key: string): void {
    this.overrides.delete(key);
  }

  clear(): void {
    this.overrides.clear();
  }

  getAll(): RuntimeOverride[] {
    return Array.from(this.overrides.values());
  }

  getBySource(source: string): RuntimeOverride[] {
    return Array.from(this.overrides.values()).filter((o) => o.source === source);
  }

  getOverrides(): Map<string, RuntimeOverride> {
    return new Map(this.overrides);
  }

  merge(other: RuntimeOverrides): void {
    for (const [key, value] of other.overrides) {
      this.overrides.set(key, value);
    }
  }

  toJSON(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, override] of this.overrides) {
      result[key] = override.value;
    }
    return result;
  }
}

export const runtimeOverrides = new RuntimeOverrides();

export function getRuntimeOverride<T = unknown>(key: string, defaultValue?: T): T {
  const value = runtimeOverrides.getValue(key);
  return value !== undefined ? (value as T) : defaultValue as T;
}

export function setRuntimeOverride(key: string, value: any, source: string = "unknown"): void {
  runtimeOverrides.set(key, value, source);
}

export function hasRuntimeOverride(key: string): boolean {
  return runtimeOverrides.has(key);
}

export function clearRuntimeOverride(key: string): void {
  runtimeOverrides.delete(key);
}

export function clearAllRuntimeOverrides(): void {
  runtimeOverrides.clear();
}