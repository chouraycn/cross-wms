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
