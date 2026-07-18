const WORD_BOUNDARY_CHARS = /[\s\-_./:#@]/;

function normalizeLowercaseStringOrEmpty(value: string | undefined | null): string {
  if (value == null) {
    return '';
  }
  return String(value).trim().toLowerCase();
}

function isWordBoundary(text: string, index: number): boolean {
  return index === 0 || WORD_BOUNDARY_CHARS.test(text[index - 1] ?? '');
}

export function findWordBoundaryIndex(text: string, query: string): number | null {
  if (!query) {
    return null;
  }
  const textLower = normalizeLowercaseStringOrEmpty(text);
  const queryLower = normalizeLowercaseStringOrEmpty(query);
  const maxIndex = textLower.length - queryLower.length;
  if (maxIndex < 0) {
    return null;
  }
  for (let i = 0; i <= maxIndex; i++) {
    if (textLower.startsWith(queryLower, i) && isWordBoundary(textLower, i)) {
      return i;
    }
  }
  return null;
}

function fuzzyMatchLower(queryLower: string, textLower: string): number | null {
  if (queryLower.length === 0) {
    return 0;
  }
  if (queryLower.length > textLower.length) {
    return null;
  }

  let queryIndex = 0;
  let score = 0;
  let lastMatchIndex = -1;
  let consecutiveMatches = 0;

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      const isAtWordBoundary = isWordBoundary(textLower, i);
      if (lastMatchIndex === i - 1) {
        consecutiveMatches++;
        score -= consecutiveMatches * 5;
      } else {
        consecutiveMatches = 0;
        if (lastMatchIndex >= 0) {
          score += (i - lastMatchIndex - 1) * 2;
        }
      }
      if (isAtWordBoundary) {
        score -= 10;
      }
      score += i * 0.1;
      lastMatchIndex = i;
      queryIndex++;
    }
  }
  return queryIndex < queryLower.length ? null : score;
}

export interface FuzzyFilterItem {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
  searchTextLower?: string;
}

export function fuzzyFilterLower<T extends FuzzyFilterItem>(
  items: T[],
  queryLower: string,
): T[] {
  const trimmed = queryLower.trim();
  if (!trimmed) {
    return items;
  }

  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return items;
  }

  const results: { item: T; score: number }[] = [];
  for (const item of items) {
    const text = item.searchTextLower ?? '';
    let totalScore = 0;
    let allMatch = true;
    for (const token of tokens) {
      const score = fuzzyMatchLower(token, text);
      if (score !== null) {
        totalScore += score;
      } else {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      results.push({ item, score: totalScore });
    }
  }
  results.sort((a, b) => a.score - b.score);
  return results.map((r) => r.item);
}

export function prepareSearchItems<
  T extends { label?: string; description?: string; searchText?: string },
>(items: T[]): (T & { searchTextLower: string })[] {
  return items.map((item) => {
    const parts: string[] = [];
    if (item.label) {
      parts.push(item.label);
    }
    if (item.description) {
      parts.push(item.description);
    }
    if (item.searchText) {
      parts.push(item.searchText);
    }
    return { ...item, searchTextLower: normalizeLowercaseStringOrEmpty(parts.join(' ')) };
  });
}

export function fuzzyFilter<T extends FuzzyFilterItem>(items: T[], query: string): T[] {
  const queryLower = normalizeLowercaseStringOrEmpty(query);
  return fuzzyFilterLower(items, queryLower);
}

export function highlightMatch(text: string, query: string, highlightFn: (s: string) => string): string {
  if (!query) {
    return text;
  }
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  const index = textLower.indexOf(queryLower);
  if (index === -1) {
    return text;
  }
  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);
  return before + highlightFn(match) + after;
}
