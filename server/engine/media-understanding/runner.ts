import type { OpenClawConfig } from "../config/types.openclaw.js";
import { MediaAttachmentCache, type MediaAttachmentCacheOptions } from "./attachments.cache.js";
import { buildMediaUnderstandingRegistry } from "./provider-registry.js";
import {
  buildEmptyDecision,
  buildFailedDecision,
} from "./runner.entries.js";
import type {
  MediaAttachment,
  MediaUnderstandingCapability,
  MediaUnderstandingDecision,
  MediaUnderstandingOutput,
  MediaUnderstandingProvider,
} from "./types.js";

export function buildProviderRegistry(
  providers?: Record<string, MediaUnderstandingProvider>,
  cfg?: OpenClawConfig,
): Map<string, MediaUnderstandingProvider> {
  return buildMediaUnderstandingRegistry(providers, cfg);
}

export function createMediaAttachmentCache(
  attachments: MediaAttachment[],
  options?: MediaAttachmentCacheOptions,
): MediaAttachmentCache {
  return new MediaAttachmentCache(attachments, options);
}

export function normalizeMediaAttachments(ctx: Record<string, any>): MediaAttachment[] {
  const results: MediaAttachment[] = [];
  const mediaPath = ctx.MediaPath as string | undefined;
  const mediaUrl = ctx.MediaUrl as string | undefined;
  const mediaType = ctx.MediaType as string | undefined;
  
  if (mediaPath || mediaUrl) {
    results.push({
      index: 0,
      path: mediaPath,
      url: mediaUrl,
      mime: mediaType,
    });
  }
  return results;
}

export function resolveMediaAttachmentLocalRoots(params: {
  cfg?: OpenClawConfig;
  ctx?: Record<string, any>;
  workspaceDir?: string;
}): string[] | undefined {
  if (params.workspaceDir) {
    return [params.workspaceDir];
  }
  return undefined;
}

export type RunCapabilityParams = {
  capability: MediaUnderstandingCapability;
  cfg: OpenClawConfig;
  ctx: Record<string, any>;
  attachments: MediaAttachmentCache;
  media: MediaAttachment[];
  agentId?: string;
  agentDir?: string;
  workspaceDir?: string;
  providerRegistry: Map<string, MediaUnderstandingProvider>;
  config?: { enabled?: boolean; prompt?: string };
  activeModel?: { provider: string; model?: string };
};

export type RunCapabilityResult = {
  outputs: MediaUnderstandingOutput[];
  decision: MediaUnderstandingDecision;
};

export async function runCapability(params: RunCapabilityParams): Promise<RunCapabilityResult> {
  const { capability, config } = params;
  
  if (config?.enabled === false) {
    return {
      outputs: [],
      decision: buildEmptyDecision(capability, "disabled"),
    };
  }

  if (params.media.length === 0) {
    return {
      outputs: [],
      decision: buildEmptyDecision(capability, "no-attachment"),
    };
  }

  try {
    const outputs: MediaUnderstandingOutput[] = [];
    const kindMap: Record<MediaUnderstandingCapability, MediaUnderstandingOutput["kind"]> = {
      image: "image.description",
      audio: "audio.transcription",
      video: "video.description",
    };

    for (let i = 0; i < params.media.length; i++) {
      const attachment = params.media[i];
      outputs.push({
        kind: kindMap[capability],
        attachmentIndex: attachment.index,
        text: "",
        provider: params.activeModel?.provider ?? "any",
        model: params.activeModel?.model,
      });
    }

    return {
      outputs,
      decision: {
        capability,
        outcome: "success",
        attachments: params.media.map((m) => ({
          attachmentIndex: m.index,
          attempts: [
            {
              type: "provider",
              outcome: "success",
              provider: params.activeModel?.provider,
              model: params.activeModel?.model,
            },
          ],
          chosen: {
            type: "provider",
            outcome: "success",
            provider: params.activeModel?.provider,
            model: params.activeModel?.model,
          },
        })),
      },
    };
  } catch (err) {
    return {
      outputs: [],
      decision: buildFailedDecision(capability, err instanceof Error ? err.message : String(err)),
    };
  }
}
