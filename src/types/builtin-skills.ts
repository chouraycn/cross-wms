// The data payload for the bundled-skill catalog.
// Lives in its own file (not in `skill-core.ts`) so that consumers (icon
// registries, type defs, the rest of the app) can import the lightweight core
// types without dragging the full ~30 KB skill catalog into the initial bundle.
// Use `loadBuiltinSkills()` (in `builtin-skills-loader.ts`) to fetch the data
// on first use; subsequent callers receive the cached array.
import type { Skill } from './skill-core';
import builtinSkillsData from '../../shared/data/builtin-skills.json';

export type BuiltinSkillsData = Skill[];

export const BUILTIN_SKILLS: BuiltinSkillsData = builtinSkillsData as BuiltinSkillsData;
