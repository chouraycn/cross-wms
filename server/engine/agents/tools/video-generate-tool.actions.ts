/**
 * video_generate action result helpers.
 *
 * Formats provider listing, active-task status, and duplicate-guard responses for the tool.
 *
 * Ported from openclaw/src/agents/tools/video-generate-tool.actions.ts.
 *
 * cross-wms adjustments:
 * - cross-wms has no `video-generation/runtime.js`; `listRuntimeVideoGenerationProviders`
 *   is replaced with `listVideoProviders` from `../../video-generation/provider-registry.js`
 *   (returns all registered providers; config filtering is not applied).
 * - cross-wms `video-generation-task-status.js` exposes object-param signatures
 *   (`{ sessionKey?, ... }` / `{ task, sourcePrefix?, duplicateGuard? }`) instead of the
 *   positional signatures used by the openclaw action. Local wrappers adapt the calls.
 * - cross-wms `VideoModeCapabilities.providerOptions` is `Record<string, any>` (not
 *   `Readonly<Record<string, VideoGenerationProviderOptionType>>`); the declared-option
 *   value is cast to `string` to keep the openclaw summary format.
 */
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { listSupportedVideoGenerationModes } from "../../video-generation/capabilities.js";
import { listVideoProviders } from "../../video-generation/provider-registry.js";
import type { AuthProfileStore } from "../auth-profiles/types.js";
import {
  buildVideoGenerationTaskStatusDetails,
  buildVideoGenerationTaskStatusText,
  findActiveVideoGenerationTaskForSession,
  findDuplicateGuardVideoGenerationTaskForSession,
} from "../video-generation-task-status.js";
import {
  createMediaGenerateDuplicateGuardResult,
  createMediaGenerateProviderListActionResult,
  createMediaGenerateTaskStatusActions,
  type MediaGenerateActionResult,
} from "./media-generate-tool-actions-shared.js";

type VideoGenerateActionResult = MediaGenerateActionResult;

/**
 * Adapters that bridge the openclaw positional call sites to the cross-wms
 * object-param signatures of `video-generation-task-status.js`.
 *
 * cross-wms returns `unknown` from the underlying shared helpers; the wrappers
 * cast the results so the shared generic action helpers type-check.
 */
const findActiveVideoTask = (sessionKey?: string): any | undefined =>
  findActiveVideoGenerationTaskForSession({ sessionKey: sessionKey ?? undefined });

const findDuplicateGuardVideoTask = (
  sessionKey?: string,
  params?: { prompt?: string; requestKey?: string },
): any | undefined =>
  findDuplicateGuardVideoGenerationTaskForSession({
    sessionKey: sessionKey,
    requestKey: params?.requestKey,
  });

const buildVideoStatusText = (
  task: any,
  params?: { duplicateGuard?: boolean },
): string =>
  buildVideoGenerationTaskStatusText({
    task: task as Record<string, any>,
    duplicateGuard: params?.duplicateGuard,
  }) as string;

const buildVideoStatusDetails = (task: any): Record<string, any> =>
  buildVideoGenerationTaskStatusDetails({
    task: task as Record<string, any>,
  }) as Record<string, any>;

function summarizeVideoGenerationCapabilities(
  provider: ReturnType<typeof listVideoProviders>[number],
): string {
  const supportedModes = listSupportedVideoGenerationModes(provider);
  const generate = provider.capabilities.generate;
  const imageToVideo = provider.capabilities.imageToVideo;
  const videoToVideo = provider.capabilities.videoToVideo;
  // providerOptions may be declared at the mode level (generate) or at the flat
  // provider-capabilities level. The runtime checks both; surface the union so
  // the agent sees a single merged view of which opaque keys each provider
  // actually accepts.
  const declaredProviderOptions: Record<string, string> = {};
  for (const [key, type] of Object.entries(provider.capabilities.providerOptions ?? {})) {
    declaredProviderOptions[key] = type as string;
  }
  for (const [key, type] of Object.entries(generate?.providerOptions ?? {})) {
    declaredProviderOptions[key] = type as string;
  }
  for (const [key, type] of Object.entries(imageToVideo?.providerOptions ?? {})) {
    declaredProviderOptions[key] = type as string;
  }
  for (const [key, type] of Object.entries(videoToVideo?.providerOptions ?? {})) {
    declaredProviderOptions[key] = type as string;
  }
  const maxInputAudios =
    generate?.maxInputAudios ??
    imageToVideo?.maxInputAudios ??
    videoToVideo?.maxInputAudios ??
    provider.capabilities.maxInputAudios;
  const capabilities = [
    supportedModes.length > 0 ? `modes=${supportedModes.join("/")}` : null,
    generate?.maxVideos ? `maxVideos=${generate.maxVideos}` : null,
    imageToVideo?.maxInputImages ? `maxInputImages=${imageToVideo.maxInputImages}` : null,
    videoToVideo?.maxInputVideos ? `maxInputVideos=${videoToVideo.maxInputVideos}` : null,
    typeof maxInputAudios === "number" && maxInputAudios > 0
      ? `maxInputAudios=${maxInputAudios}`
      : null,
    generate?.maxDurationSeconds ? `maxDurationSeconds=${generate.maxDurationSeconds}` : null,
    generate?.supportedDurationSeconds?.length
      ? `supportedDurationSeconds=${generate.supportedDurationSeconds.join("/")}`
      : null,
    generate?.supportedDurationSecondsByModel &&
    Object.keys(generate.supportedDurationSecondsByModel).length > 0
      ? `supportedDurationSecondsByModel=${Object.entries(generate.supportedDurationSecondsByModel)
          .map(([modelId, durations]) => `${modelId}:${durations.join("/")}`)
          .join("; ")}`
      : null,
    generate?.supportsResolution ? "resolution" : null,
    generate?.supportsAspectRatio ? "aspectRatio" : null,
    generate?.supportsSize ? "size" : null,
    generate?.supportsAudio ? "audio" : null,
    generate?.supportsWatermark ? "watermark" : null,
    Object.keys(declaredProviderOptions).length > 0
      ? `providerOptions={${Object.entries(declaredProviderOptions)
          .map(([key, type]) => `${key}:${type}`)
          .join(", ")}}`
      : null,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(", ");
  return capabilities;
}

export function createVideoGenerateListActionResult(
  config?: OpenClawConfig,
  options?: { workspaceDir?: string; agentDir?: string; authStore?: AuthProfileStore },
): VideoGenerateActionResult {
  // cross-wms has no `listRuntimeVideoGenerationProviders`; use `listVideoProviders`
  // which returns all registered providers (config filtering not applied).
  const providers = listVideoProviders();
  return createMediaGenerateProviderListActionResult({
    kind: "video_generation",
    providers,
    emptyText: "No video-generation providers are registered.",
    cfg: config,
    workspaceDir: options?.workspaceDir,
    agentDir: options?.agentDir,
    authStore: options?.authStore,
    listModes: listSupportedVideoGenerationModes,
    summarizeCapabilities: summarizeVideoGenerationCapabilities,
  });
}

const videoGenerateTaskStatusActions = createMediaGenerateTaskStatusActions({
  inactiveText: "No active video generation task is currently running for this session.",
  findActiveTask: (sessionKey) => findActiveVideoTask(sessionKey) ?? undefined,
  buildStatusText: buildVideoStatusText,
  buildStatusDetails: buildVideoStatusDetails,
});

export function createVideoGenerateStatusActionResult(
  sessionKey?: string,
): VideoGenerateActionResult {
  return videoGenerateTaskStatusActions.createStatusActionResult(sessionKey);
}

export function createVideoGenerateDuplicateGuardResult(
  sessionKey?: string,
  params?: { prompt?: string; requestKey?: string },
): VideoGenerateActionResult | undefined {
  return createMediaGenerateDuplicateGuardResult({
    sessionKey,
    prompt: params?.prompt,
    requestKey: params?.requestKey,
    findDuplicateTask: findDuplicateGuardVideoTask,
    buildStatusText: buildVideoStatusText,
    buildStatusDetails: buildVideoStatusDetails,
  });
}
