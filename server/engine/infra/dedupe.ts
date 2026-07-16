import { logger } from '../../logger.js';

export interface DedupeOptions {
  keyFn?: (item: unknown) => string;
  keepFirst?: boolean;
  minLength?: number;
}

export function deduplicate<T>(items: T[], options: DedupeOptions = {}): T[] {
  const { keyFn, keepFirst = true, minLength = 1 } = options;
  
  const seen = new Set<string>();
  const result: T[] = [];
  
  const effectiveKeyFn = keyFn ?? ((item: unknown) => JSON.stringify(item));
  
  for (const item of items) {
    const key = effectiveKeyFn(item);
    
    if (key.length < minLength) {
      continue;
    }
    
    if (seen.has(key)) {
      if (!keepFirst) {
        const idx = result.findIndex(i => effectiveKeyFn(i) === key);
        if (idx !== -1) {
          result.splice(idx, 1);
        }
        result.push(item);
      }
      continue;
    }
    
    seen.add(key);
    result.push(item);
  }
  
  logger.debug(`[infra:Dedupe] Reduced from ${items.length} to ${result.length} items`);
  
  return result;
}

export function deduplicateStrings(strings: string[], minLength: number = 1): string[] {
  return deduplicate(strings, {
    keyFn: (s: unknown) => String(s),
    minLength,
  });
}

export function deduplicateByProperty<T, K extends keyof T>(
  items: T[],
  prop: K
): T[] {
  return deduplicate(items, {
    keyFn: (item: unknown) => String((item as T)[prop]),
  });
}

export function createDedupeFilter<T>(
  options: DedupeOptions = {}
): (item: T) => boolean {
  const seen = new Set<string>();
  const { keyFn, minLength = 1 } = options;
  
  const effectiveKeyFn = keyFn ?? ((item: unknown) => JSON.stringify(item));
  
  return (item: T) => {
    const key = effectiveKeyFn(item);
    
    if (key.length < minLength) {
      return true;
    }
    
    if (seen.has(key)) {
      return false;
    }
    
    seen.add(key);
    return true;
  };
}