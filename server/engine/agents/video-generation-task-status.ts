/**
 * 移植自 openclaw/src/agents/video-generation-task-status.ts
 *
 * Video generation task status helpers.
 * Cross-wms simplified: delegates to media-generation-task-status-shared.
 */

import {
  findActiveMediaGenerationTaskForSession,
  findDuplicateGuardMediaGenerationTaskForSession,
  buildMediaGenerationTaskStatusDetails,
  buildMediaGenerationTaskStatusText,
  buildActiveMediaGenerationTaskPromptContextForSession,
} from "./media-generation-task-status-shared.js";

export const VIDEO_GENERATION_TASK_KIND = "video-generation";

/** Finds the active video generation task for a session. */
export function findActiveVideoGenerationTaskForSession(params: {
  sessionKey?: string;
  sourcePrefix?: string;
  taskLabel?: string;
}) {
  return findActiveMediaGenerationTaskForSession({
    sessionKey: params.sessionKey,
    taskKind: VIDEO_GENERATION_TASK_KIND,
    sourcePrefix: params.sourcePrefix ?? "video",
    taskLabel: params.taskLabel,
  });
}

/** Finds a duplicate guard video generation task for a session. */
export function findDuplicateGuardVideoGenerationTaskForSession(params: {
  sessionKey?: string;
  sourcePrefix?: string;
  taskLabel?: string;
  requestKey?: string;
  maxAgeMs?: number;
}) {
  return findDuplicateGuardMediaGenerationTaskForSession({
    sessionKey: params.sessionKey,
    taskKind: VIDEO_GENERATION_TASK_KIND,
    sourcePrefix: params.sourcePrefix ?? "video",
    taskLabel: params.taskLabel,
    requestKey: params.requestKey,
    maxAgeMs: params.maxAgeMs ?? 2 * 60_000,
  });
}

/** Builds status details for a video generation task. */
export function buildVideoGenerationTaskStatusDetails(params: {
  task: Record<string, unknown>;
  sourcePrefix?: string;
}) {
  return buildMediaGenerationTaskStatusDetails({
    task: params.task as any,
    sourcePrefix: params.sourcePrefix ?? "video",
  });
}

/** Builds status text for a video generation task. */
export function buildVideoGenerationTaskStatusText(params: {
  task: Record<string, unknown>;
  sourcePrefix?: string;
  duplicateGuard?: boolean;
}) {
  return buildMediaGenerationTaskStatusText({
    task: params.task as any,
    sourcePrefix: params.sourcePrefix ?? "video",
    nounLabel: "Video",
    toolName: "video-generate",
    completionLabel: "video",
    duplicateGuard: params.duplicateGuard,
  });
}

/** Builds prompt context for an active video generation task. */
export function buildActiveVideoGenerationTaskPromptContextForSession(params: {
  sessionKey?: string;
  sourcePrefix?: string;
}) {
  return buildActiveMediaGenerationTaskPromptContextForSession({
    sessionKey: params.sessionKey,
    taskKind: VIDEO_GENERATION_TASK_KIND,
    sourcePrefix: params.sourcePrefix ?? "video",
    nounLabel: "Video",
    toolName: "video-generate",
    completionLabel: "video",
  });
}
