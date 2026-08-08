/**
 * music_generate action helpers.
 *
 * Handles provider listing, task status, and duplicate-guard output for the music generation tool.
 *
 * Ported from openclaw/src/agents/tools/music-generate-tool.actions.ts.
 *
 * cross-wms adjustments:
 * - cross-wms has no `music-generation/runtime.js`; `listRuntimeMusicGenerationProviders`
 *   is replaced with `listMusicProviders` from `../../music-generation/provider-registry.js`
 *   (returns all registered providers; config filtering is not applied).
 * - cross-wms `music-generation-task-status.js` is a degraded stub whose functions take
 *   no arguments and return `undefined` / `null` / `""`. They are cast to the openclaw
 *   action signatures so the shared generic helpers type-check.
 * - cross-wms `MusicModeCapabilities` exposes `maxInputAssets` (not `maxInputImages`):
 *   `summarizeMusicGenerationCapabilities` reads `edit?.maxInputAssets`.
 */
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { listSupportedMusicGenerationModes } from "../../music-generation/capabilities.js";
import { listMusicProviders } from "../../music-generation/provider-registry.js";
import type { AuthProfileStore } from "../auth-profiles/types.js";
import {
  buildMusicGenerationTaskStatusDetails,
  buildMusicGenerationTaskStatusText,
  findActiveMusicGenerationTaskForSession,
  findDuplicateGuardMusicGenerationTaskForSession,
} from "../music-generation-task-status.js";
import {
  createMediaGenerateDuplicateGuardResult,
  createMediaGenerateProviderListActionResult,
  createMediaGenerateTaskStatusActions,
  type MediaGenerateActionResult,
} from "./media-generate-tool-actions-shared.js";

type MusicGenerateActionResult = MediaGenerateActionResult;

/**
 * Cast the cross-wms music task-status stubs to the openclaw action signatures.
 *
 * The stubs take no arguments and return `undefined` / `null` / `""`; they are
 * always-inactive placeholders. The casts let the shared generic helpers infer
 * `Task = unknown` and accept the positional call sites used by the openclaw action.
 */
const findActiveMusicTask = findActiveMusicGenerationTaskForSession as unknown as (
  sessionKey?: string,
) => unknown | undefined;
const findDuplicateGuardMusicTask = findDuplicateGuardMusicGenerationTaskForSession as unknown as (
  sessionKey?: string,
  params?: { prompt?: string; requestKey?: string },
) => unknown | undefined;
const buildMusicStatusText = buildMusicGenerationTaskStatusText as unknown as (
  task: any,
  params?: { duplicateGuard?: boolean },
) => string;
const buildMusicStatusDetails = buildMusicGenerationTaskStatusDetails as unknown as (
  task: any,
) => Record<string, any>;

/** Formats provider capability details for the music generation `list` action. */
function summarizeMusicGenerationCapabilities(
  provider: ReturnType<typeof listMusicProviders>[number],
): string {
  const supportedModes = listSupportedMusicGenerationModes(provider);
  const generate = provider.capabilities.generate;
  const edit = provider.capabilities.edit;
  const capabilities = [
    supportedModes.length > 0 ? `modes=${supportedModes.join("/")}` : null,
    generate?.maxTracks ? `maxTracks=${generate.maxTracks}` : null,
    // cross-wms uses `maxInputAssets` instead of openclaw's `maxInputImages`.
    edit?.maxInputAssets ? `maxInputImages=${edit.maxInputAssets}` : null,
    generate?.maxDurationSeconds ? `maxDurationSeconds=${generate.maxDurationSeconds}` : null,
    generate?.supportsLyrics ? "lyrics" : null,
    generate?.supportsLyricsByModel && Object.keys(generate.supportsLyricsByModel).length > 0
      ? `supportsLyricsByModel=${Object.entries(generate.supportsLyricsByModel)
          .map(([modelId, supported]) => `${modelId}:${supported}`)
          .join("; ")}`
      : null,
    generate?.supportsInstrumental ? "instrumental" : null,
    generate?.supportsInstrumentalByModel &&
    Object.keys(generate.supportsInstrumentalByModel).length > 0
      ? `supportsInstrumentalByModel=${Object.entries(generate.supportsInstrumentalByModel)
          .map(([modelId, supported]) => `${modelId}:${supported}`)
          .join("; ")}`
      : null,
    generate?.supportsDuration ? "duration" : null,
    generate?.supportsFormat ? "format" : null,
    generate?.supportedFormats?.length
      ? `supportedFormats=${generate.supportedFormats.join("/")}`
      : null,
    generate?.supportedFormatsByModel && Object.keys(generate.supportedFormatsByModel).length > 0
      ? `supportedFormatsByModel=${Object.entries(generate.supportedFormatsByModel)
          .map(([modelId, formats]) => `${modelId}:${formats.join("/")}`)
          .join("; ")}`
      : null,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(", ");
  return capabilities;
}

/** Builds the music-generation provider listing result shown to the agent. */
export function createMusicGenerateListActionResult(
  config?: OpenClawConfig,
  options?: { workspaceDir?: string; agentDir?: string; authStore?: AuthProfileStore },
): MusicGenerateActionResult {
  // cross-wms has no `listRuntimeMusicGenerationProviders`; use `listMusicProviders`
  // which returns all registered providers (config filtering not applied).
  const providers = listMusicProviders();
  return createMediaGenerateProviderListActionResult({
    kind: "music_generation",
    providers,
    emptyText: "No music-generation providers are registered.",
    cfg: config,
    workspaceDir: options?.workspaceDir,
    agentDir: options?.agentDir,
    authStore: options?.authStore,
    listModes: listSupportedMusicGenerationModes,
    summarizeCapabilities: summarizeMusicGenerationCapabilities,
  });
}

const musicGenerateTaskStatusActions = createMediaGenerateTaskStatusActions({
  inactiveText: "No active music generation task is currently running for this session.",
  findActiveTask: (sessionKey) => findActiveMusicTask(sessionKey) ?? undefined,
  buildStatusText: buildMusicStatusText,
  buildStatusDetails: buildMusicStatusDetails,
});

/** Builds status output for the active music-generation task in the current session. */
export function createMusicGenerateStatusActionResult(
  sessionKey?: string,
): MusicGenerateActionResult {
  return musicGenerateTaskStatusActions.createStatusActionResult(sessionKey);
}

/** Returns duplicate-guard status output when a matching music task is already active. */
export function createMusicGenerateDuplicateGuardResult(
  sessionKey?: string,
  params?: { prompt?: string; requestKey?: string },
): MusicGenerateActionResult | undefined {
  return createMediaGenerateDuplicateGuardResult({
    sessionKey,
    prompt: params?.prompt,
    requestKey: params?.requestKey,
    findDuplicateTask: findDuplicateGuardMusicTask,
    buildStatusText: buildMusicStatusText,
    buildStatusDetails: buildMusicStatusDetails,
  });
}
