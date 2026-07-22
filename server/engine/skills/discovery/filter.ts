export type FilterOperator = "eq" | "ne" | "contains" | "not_contains" | "starts_with" | "ends_with" | "regex" | "in" | "not_in";

export type FilterCondition = {
  field: string;
  operator: FilterOperator;
  value: string | string[] | number | boolean;
};

export type FilterExpression = FilterCondition | { or: FilterExpression[] } | { and: FilterExpression[] };

export function normalizeSkillFilter(skillFilter?: ReadonlyArray<unknown>): string[] | undefined {
  if (skillFilter === undefined) {
    return undefined;
  }
  return skillFilter
    .filter((entry): entry is string => typeof entry === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function normalizeSkillFilterForComparison(
  skillFilter?: ReadonlyArray<unknown>,
): string[] | undefined {
  const normalized = normalizeSkillFilter(skillFilter);
  if (normalized === undefined) {
    return undefined;
  }
  return [...new Set(normalized)].sort();
}

export function matchesSkillFilter(
  cached?: ReadonlyArray<unknown>,
  next?: ReadonlyArray<unknown>,
): boolean {
  const cachedNormalized = normalizeSkillFilterForComparison(cached);
  const nextNormalized = normalizeSkillFilterForComparison(next);
  if (cachedNormalized === undefined || nextNormalized === undefined) {
    return cachedNormalized === nextNormalized;
  }
  if (cachedNormalized.length !== nextNormalized.length) {
    return false;
  }
  return cachedNormalized.every((entry, index) => entry === nextNormalized[index]);
}

export function skillMatchesFilter(
  skillName: string,
  skillFilter?: ReadonlyArray<string>,
): boolean {
  if (skillFilter === undefined || skillFilter.length === 0) {
    return true;
  }
  const normalizedName = normalizeSkillName(skillName);
  return skillFilter.some((filterEntry) => normalizeSkillName(filterEntry) === normalizedName);
}

export function normalizeSkillName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function matchCondition(
  value: string | number | boolean | undefined,
  condition: FilterCondition,
): boolean {
  if (value === undefined) return false;
  
  const stringValue = String(value);
  
  switch (condition.operator) {
    case "eq":
      return stringValue === String(condition.value);
    case "ne":
      return stringValue !== String(condition.value);
    case "contains":
      return stringValue.includes(String(condition.value));
    case "not_contains":
      return !stringValue.includes(String(condition.value));
    case "starts_with":
      return stringValue.startsWith(String(condition.value));
    case "ends_with":
      return stringValue.endsWith(String(condition.value));
    case "regex":
      try {
        const regex = new RegExp(String(condition.value));
        return regex.test(stringValue);
      } catch {
        return false;
      }
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(stringValue);
    case "not_in":
      return !Array.isArray(condition.value) || !condition.value.includes(stringValue);
    default:
      return false;
  }
}

export function evaluateFilter(
  item: Record<string, unknown>,
  filter: FilterExpression,
): boolean {
  if ("or" in filter) {
    return filter.or.some((expr) => evaluateFilter(item, expr));
  }
  if ("and" in filter) {
    return filter.and.every((expr) => evaluateFilter(item, expr));
  }
  const value = item[filter.field];
  return matchCondition(value as string | number | boolean | undefined, filter);
}

export function createRegexFilter(field: string, pattern: string): FilterCondition {
  return { field, operator: "regex", value: pattern };
}

export function createContainsFilter(field: string, substring: string): FilterCondition {
  return { field, operator: "contains", value: substring };
}

export function createOrFilter(conditions: FilterExpression[]): { or: FilterExpression[] } {
  return { or: conditions };
}

export function createAndFilter(conditions: FilterExpression[]): { and: FilterExpression[] } {
  return { and: conditions };
}

export function filterByPattern(
  items: readonly string[],
  pattern: string,
  options: { caseSensitive?: boolean; regex?: boolean } = {},
): string[] {
  const { caseSensitive = false, regex = false } = options;
  const searchPattern = regex ? new RegExp(pattern) : pattern;
  
  return items.filter((item) => {
    const target = caseSensitive ? item : item.toLowerCase();
    const searchTarget = caseSensitive ? String(searchPattern) : String(searchPattern).toLowerCase();
    
    if (regex) {
      return (searchPattern as RegExp).test(item);
    }
    return target.includes(searchTarget);
  });
}

export function filterByRange(
  items: readonly { name: string; [key: string]: number | undefined }[],
  field: string,
  min?: number,
  max?: number,
): typeof items {
  return items.filter((item) => {
    const value = item[field];
    if (value === undefined) return false;
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;
    return true;
  });
}
