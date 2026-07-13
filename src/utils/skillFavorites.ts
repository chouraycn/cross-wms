// Skill favorite and recent-usage storage helpers.
// Backed by localStorage with safe JSON parsing and quota-tolerant writes.

const FAVORITES_KEY = 'cdf-favorite-skills';
const RECENT_KEY = 'cdf-recent-skills';
const DEFAULT_RECENT_LIMIT = 6;
const DEFAULT_FAVORITES_LIMIT = 100;

function safeRead(key: string): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

function safeWrite(key: string, value: string[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or private browsing — fail silently.
  }
}

/** Reads the user's favorite skill IDs, in user-defined order. */
export function getFavoriteSkills(): string[] {
  return safeRead(FAVORITES_KEY);
}

/** Returns true when `skillId` is in the favorites list. */
export function isFavoriteSkill(skillId: string): boolean {
  return getFavoriteSkills().includes(skillId);
}

/** Adds a skill to the favorites list (idempotent). */
export function addFavoriteSkill(skillId: string): void {
  const favorites = getFavoriteSkills();
  if (favorites.includes(skillId)) return;
  favorites.unshift(skillId);
  safeWrite(FAVORITES_KEY, favorites.slice(0, DEFAULT_FAVORITES_LIMIT));
}

/** Removes a skill from the favorites list. */
export function removeFavoriteSkill(skillId: string): void {
  const favorites = getFavoriteSkills().filter((id) => id !== skillId);
  safeWrite(FAVORITES_KEY, favorites);
}

/** Toggles a skill's favorite state and returns the new value. */
export function toggleFavoriteSkill(skillId: string): boolean {
  if (isFavoriteSkill(skillId)) {
    removeFavoriteSkill(skillId);
    return false;
  }
  addFavoriteSkill(skillId);
  return true;
}

/** Reads the most-recently-used skill IDs (most-recent first). */
export function getRecentSkills(limit: number = DEFAULT_RECENT_LIMIT): string[] {
  return safeRead(RECENT_KEY).slice(0, limit);
}

/** Records a skill as recently used (most-recent-first, dedup). */
export function recordRecentSkill(skillId: string, limit: number = 12): void {
  const recent = getRecentSkills(limit * 2);
  const updated = [skillId, ...recent.filter((id) => id !== skillId)].slice(0, limit);
  safeWrite(RECENT_KEY, updated);
}

/**
 * Computes a fuzzy match score for a skill against a query.
 * - 100: exact match on name or id
 * - 80: name starts with query
 * - 50: name contains query
 * - 25: subsequence match (e.g. "invq" matches "inventory-query")
 * - 0: no match
 */
export function fuzzySkillScore(query: string, skill: { name: string; id: string; trigger?: string; tags?: string[]; desc?: string }): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const n = skill.name.toLowerCase();
  const i = skill.id.toLowerCase();
  if (n === q || i === q) return 100;
  if (n.startsWith(q)) return 80;
  if (i.startsWith(q)) return 75;
  if (n.includes(q)) return 50;
  if (i.includes(q)) return 45;
  if (skill.trigger && skill.trigger.toLowerCase().includes(q)) return 30;
  if (skill.tags && skill.tags.some((t) => t.toLowerCase().includes(q))) return 20;
  if (skill.desc && skill.desc.toLowerCase().includes(q)) return 10;
  // Subsequence match on name
  let qi = 0;
  for (let k = 0; k < n.length && qi < q.length; k += 1) {
    if (n[k] === q[qi]) qi += 1;
  }
  if (qi === q.length) return 25 - n.length;
  return 0;
}
