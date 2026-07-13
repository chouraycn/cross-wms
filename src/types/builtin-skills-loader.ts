// Lazy loader for the bundled-skill catalog.
// The full ~30 KB catalog lives in `./builtin-skills.ts` and is loaded on
// first call. Subsequent calls return the cached array synchronously.
// The `loadBuiltinSkills()` function uses a dynamic import so the data is
// split into a separate Webpack chunk that the browser only fetches when
// the catalog is actually needed (e.g. when the user opens the skills page).
import type { BuiltinSkillsData } from './builtin-skills';

let cached: BuiltinSkillsData | undefined;
let inflight: Promise<BuiltinSkillsData> | undefined;

/**
 * Returns the cached builtin skills array if it has been loaded, otherwise
 * an empty placeholder. Useful for SSR or initial render that needs a
 * non-null value but doesn't need real data.
 */
export function getBuiltinSkillsSync(): BuiltinSkillsData {
  return cached ?? [];
}

/**
 * Asynchronously loads the full builtin skills array. Subsequent calls reuse
 * the in-flight promise or the resolved cache. Throws if the dynamic import
 * fails (e.g. when the file is missing in a deployed build).
 */
export function loadBuiltinSkills(): Promise<BuiltinSkillsData> {
  if (cached) {
    return Promise.resolve(cached);
  }
  if (!inflight) {
    inflight = import('./builtin-skills')
      .then((mod) => {
        cached = mod.BUILTIN_SKILLS;
        return cached;
      })
      .catch((err) => {
        inflight = undefined;
        throw err;
      });
  }
  return inflight;
}

/** Test-only: clears the cache so unit tests can exercise the loader path. */
export function __resetBuiltinSkillsCacheForTests(): void {
  cached = undefined;
  inflight = undefined;
}
