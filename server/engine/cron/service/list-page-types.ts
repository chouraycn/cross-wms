export interface ListPageOptions {
  offset?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  query?: string;
  filters?: Record<string, unknown>;
}

export interface ListPageResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface SortConfig {
  field: string;
  direction: "asc" | "desc";
}

export interface FilterConfig {
  field: string;
  operator: "eq" | "ne" | "contains" | "startsWith" | "endsWith" | "in" | "gt" | "lt" | "gte" | "lte";
  value: unknown;
}

export function createListPageResult<T>(
  items: T[],
  total: number,
  options: ListPageOptions,
): ListPageResult<T> {
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 50)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const boundedOffset = Math.min(total, offset);
  const pageItems = items.slice(boundedOffset, boundedOffset + limit);
  const nextOffset = boundedOffset + pageItems.length;

  return {
    items: pageItems,
    total,
    offset: boundedOffset,
    limit,
    hasMore: nextOffset < total,
    nextOffset: nextOffset < total ? nextOffset : null,
  };
}