export type SourceProjection = {
  source: string;
  type: "file" | "env" | "command" | "config" | "runtime";
  path?: string;
  value: unknown;
  timestamp: number;
};

export type ProjectionOptions = {
  filter?: (projection: SourceProjection) => boolean;
  transform?: (projection: SourceProjection) => unknown;
};

export class RuntimeSourceProjection {
  private projections: Map<string, SourceProjection> = new Map();

  add(key: string, projection: Omit<SourceProjection, "timestamp">): void {
    this.projections.set(key, {
      ...projection,
      timestamp: Date.now(),
    });
  }

  get(key: string): SourceProjection | undefined {
    return this.projections.get(key);
  }

  getValue(key: string): unknown {
    const projection = this.projections.get(key);
    return projection?.value;
  }

  has(key: string): boolean {
    return this.projections.has(key);
  }

  delete(key: string): void {
    this.projections.delete(key);
  }

  clear(): void {
    this.projections.clear();
  }

  getAll(): SourceProjection[] {
    return Array.from(this.projections.values());
  }

  getBySource(source: string): SourceProjection[] {
    return Array.from(this.projections.values()).filter((p) => p.source === source);
  }

  getByType(type: SourceProjection["type"]): SourceProjection[] {
    return Array.from(this.projections.values()).filter((p) => p.type === type);
  }

  getProjections(): Map<string, SourceProjection> {
    return new Map(this.projections);
  }

  merge(other: RuntimeSourceProjection): void {
    for (const [key, value] of other.projections) {
      this.projections.set(key, value);
    }
  }

  project(options: ProjectionOptions = {}): Record<string, unknown> {
    const { filter, transform } = options;
    const result: Record<string, unknown> = {};

    for (const [key, projection] of this.projections) {
      if (filter && !filter(projection)) {
        continue;
      }

      result[key] = transform ? transform(projection) : projection.value;
    }

    return result;
  }

  toJSON(): Record<string, unknown> {
    return this.project();
  }
}

export const runtimeSourceProjection = new RuntimeSourceProjection();

export function projectRuntimeSource(key: string, value: unknown, source: string, type: SourceProjection["type"], path?: string): void {
  runtimeSourceProjection.add(key, {
    source,
    type,
    path,
    value,
  });
}

export function getProjectedValue<T = unknown>(key: string, defaultValue?: T): T {
  const value = runtimeSourceProjection.getValue(key);
  return value !== undefined ? (value as T) : defaultValue as T;
}

export function hasProjectedValue(key: string): boolean {
  return runtimeSourceProjection.has(key);
}

export function clearProjectedValue(key: string): void {
  runtimeSourceProjection.delete(key);
}

export function clearAllProjectedValues(): void {
  runtimeSourceProjection.clear();
}

export function getProjectedSources(): string[] {
  const sources = new Set<string>();
  for (const projection of runtimeSourceProjection.getAll()) {
    sources.add(projection.source);
  }
  return Array.from(sources);
}