/**
 * Music generation task status helpers.
 * Ported from openclaw/src/agents/music-generation-task-status.ts
 * Simplified: music generation task tracking replaced with no-op defaults.
 */

export const MUSIC_GENERATION_TASK_KIND = "music-generation";

export function findActiveMusicGenerationTaskForSession(): undefined { return undefined; }
export function findDuplicateGuardMusicGenerationTaskForSession(): undefined { return undefined; }
export function buildMusicGenerationTaskStatusDetails(): null { return null; }
export function buildMusicGenerationTaskStatusText(): string { return ""; }
export function buildActiveMusicGenerationTaskPromptContextForSession(): string { return ""; }
