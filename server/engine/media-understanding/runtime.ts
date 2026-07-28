// @ts-nocheck
import path from "node:path";
import { kindFromMime, mimeTypeFromFilePath } from "@openclaw/media-core/mime";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { DEFAULT_MAX_BYTES } from "./defaults.constants.js";
import {
  buildMediaUnderstandingRegistry,
  getMediaUnderstandingProvider,
  normalizeMediaProviderId,
} from "./provider-registry.js";
import { resolveMediaRuntimeTimeoutMs } from "./resolve.js";
import { findDecisionReason, normalizeDecisionReason } from "./runner.entries.js";
import {
  buildProviderRegistry,
  createMediaAttachmentCache,
  normalizeMediaAttachments,
  runCapability,
} from "./runner.js";
import type {
  DescribeImageFileParams,
  DescribeImageFileWithModelParams,
  DescribeVideoFileParams,
  ExtractStructuredWithModelParams,
  RunMediaUnderstandingFileParams,
  RunMediaUnderstandingFileResult,
  TranscribeAudioFileParams,
} from "./runtime-types.js";
export type {
  DescribeImageFileParams,
  DescribeImageFileWithModelParams,
  DescribeVideoFileParams,
  ExtractStructuredWithModelParams,
  RunMediaUnderstandingFileParams,
  RunMediaUnderstandingFileResult,
  TranscribeAudioFileParams,
} from "./runtime-types.js";
import { describeImageWithModel } from "./image.js";

type MediaUnderstandingCapability = "image" | "audio" | "video";
type MediaUnderstandingOutput = Awaited<ReturnType<typeof runCapability>>["outputs"][number];

const KIND_BY_CAPABILITY: Record<MediaUnderstandingCapability, MediaUnderstandingOutput["kind"]> = {
  audio: "audio.transcription",
  image: "image.description",
  video: "video.description",
};

function resolveDecisionFailureReason(
  decision: Awaited<ReturnType<typeof runCapability>>["decision"],
): string | undefined {
  return normalizeDecisionReason(findDecisionReason(decision, "failed"));
}

function buildFileContext(params: {
  filePath: string;
  mediaUrl?: string;
  mime?: string;
  capability?: MediaUnderstandingCapability;
  scopeContext?: {
    sessionKey?: string;
    channel?: string;
    chatType?: string;
  };
}) {
  const scopeFields = {
    ...(params.scopeContext?.sessionKey ? { SessionKey: params.scopeContext.sessionKey } : {}),
    ...(params.scopeContext?.channel
      ? { Provider: params.scopeContext.channel, Surface: params.scopeContext.channel }
      : {}),
    ...(params.scopeContext?.chatType ? { ChatType: params.scopeContext.chatType } : {}),
  };
  const remoteRef =
    params.mediaUrl ??
    (isRemoteMediaReference(params.filePath) ? params.filePath.trim() : undefined);
  const extensionMime = remoteRef ? mimeTypeFromFilePath(remoteRef) : undefined;
  const extensionKind = kindFromMime(extensionMime);
  const mediaType =
    params.mime ??
    (remoteRef && params.capability && extensionKind === params.capability
      ? `${params.capability}/*`
      : extensionMime) ??
    (remoteRef && params.capability ? `${params.capability}/*` : undefined);
  if (remoteRef) {
    return {
      MediaUrl: remoteRef,
      MediaType: mediaType,
      ...scopeFields,
    };
  }
  return {
    MediaPath: params.filePath,
    MediaType: mediaType,
    ...scopeFields,
  };
}

function isRemoteMediaReference(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function resolveFileLocalRoots(filePath: string): string[] | undefined {
  return isRemoteMediaReference(filePath) ? undefined : [path.dirname(filePath)];
}

function hasStructuredImageInput(input: ExtractStructuredWithModelParams["input"]): boolean {
  return input.some((entry) => entry.type === "image");
}

export async function runMediaUnderstandingFile(
  params: RunMediaUnderstandingFileParams,
): Promise<RunMediaUnderstandingFileResult> {
  const requestPrompt = params.prompt?.trim();
  const requestTimeoutSeconds =
    typeof params.timeoutMs === "number" &&
    Number.isFinite(params.timeoutMs) &&
    params.timeoutMs > 0
      ? Math.ceil(params.timeoutMs / 1000)
      : undefined;
  const cfg =
    requestPrompt || requestTimeoutSeconds !== undefined
      ? ({
          ...params.cfg,
          tools: {
            ...params.cfg.tools,
            media: {
              ...params.cfg.tools?.media,
              [params.capability]: {
                ...params.cfg.tools?.media?.[params.capability],
                ...(requestPrompt
                  ? {
                      prompt: requestPrompt,
                      _requestPromptOverride: requestPrompt,
                    }
                  : {}),
                ...(requestTimeoutSeconds !== undefined
                  ? { timeoutSeconds: requestTimeoutSeconds }
                  : {}),
              },
            },
          },
        } as OpenClawConfig)
      : params.cfg;
  const ctx = buildFileContext({
    ...params,
    capability: params.capability,
    scopeContext: params.scopeContext,
  });
  const attachments = normalizeMediaAttachments(ctx);
  if (attachments.length === 0) {
    return {
      text: undefined,
      decision: { capability: params.capability, outcome: "no-attachment", attachments: [] },
    };
  }
  const config = (cfg.tools?.media as Record<string, { enabled?: boolean }> | undefined)?.[params.capability];
  if (config?.enabled === false) {
    return {
      text: undefined,
      provider: undefined,
      model: undefined,
      output: undefined,
      decision: { capability: params.capability, outcome: "disabled", attachments: [] },
    };
  }

  const providerRegistry = buildProviderRegistry(undefined, cfg);
  const cache = createMediaAttachmentCache(attachments, {
    localPathRoots: params.mediaUrl ? undefined : resolveFileLocalRoots(params.filePath),
  });

  try {
    const result = await runCapability({
      capability: params.capability,
      cfg,
      ctx,
      attachments: cache,
      media: attachments,
      agentDir: params.agentDir,
      ...(params.workspaceDir ? { workspaceDir: params.workspaceDir } : {}),
      providerRegistry,
      config,
      activeModel: params.activeModel,
    });
    if (result.outputs.length === 0 && result.decision.outcome === "failed") {
      throw new Error(
        resolveDecisionFailureReason(result.decision) ??
          `${params.capability} understanding failed`,
      );
    }
    const output = result.outputs.find(
      (entry) => entry.kind === KIND_BY_CAPABILITY[params.capability],
    );
    const text = output?.text?.trim();
    const fileResult: RunMediaUnderstandingFileResult = {
      text: text || undefined,
      provider: output?.provider,
      model: output?.model,
      output,
    };
    if (result.decision) {
      fileResult.decision = result.decision;
    }
    return fileResult;
  } finally {
    await cache.cleanup();
  }
}

export async function describeImageFile(
  params: DescribeImageFileParams,
): Promise<RunMediaUnderstandingFileResult> {
  return await runMediaUnderstandingFile({ ...params, capability: "image" });
}

export async function describeImageFileWithModel(params: DescribeImageFileWithModelParams) {
  const timeoutMs = resolveMediaRuntimeTimeoutMs(params.timeoutMs);
  const providerRegistry = buildProviderRegistry(undefined, params.cfg);
  const provider = providerRegistry.get(normalizeMediaProviderId(params.provider));
  const describeImage = provider?.describeImage ?? describeImageWithModel;
  return await describeImage({
    buffer: Buffer.alloc(0),
    fileName: params.filePath,
    mime: params.mime,
    provider: params.provider,
    model: params.model,
    prompt: params.prompt,
    maxTokens: params.maxTokens,
    timeoutMs,
    cfg: params.cfg,
    agentDir: params.agentDir ?? "",
    ...(params.workspaceDir ? { workspaceDir: params.workspaceDir } : {}),
  });
}

export async function extractStructuredWithModel(params: ExtractStructuredWithModelParams) {
  const timeoutMs = resolveMediaRuntimeTimeoutMs(params.timeoutMs);
  if (!hasStructuredImageInput(params.input)) {
    throw new Error("Structured extraction requires at least one image input.");
  }
  const provider = getMediaUnderstandingProvider(
    params.provider,
    buildMediaUnderstandingRegistry(undefined, params.cfg),
  );
  if (!provider?.extractStructured) {
    throw new Error(`Provider does not support structured extraction: ${params.provider}`);
  }
  return await provider.extractStructured({
    input: params.input,
    instructions: params.instructions,
    schemaName: params.schemaName,
    jsonSchema: params.jsonSchema,
    jsonMode: params.jsonMode,
    provider: params.provider,
    model: params.model,
    profile: params.profile,
    preferredProfile: params.preferredProfile,
    authStore: params.authStore,
    timeoutMs,
    cfg: params.cfg,
    agentDir: params.agentDir ?? "",
  });
}

export async function describeVideoFile(
  params: DescribeVideoFileParams,
): Promise<RunMediaUnderstandingFileResult> {
  return await runMediaUnderstandingFile({ ...params, capability: "video" });
}

export async function transcribeAudioFile(
  params: TranscribeAudioFileParams,
): Promise<RunMediaUnderstandingFileResult> {
  const cfg =
    params.language || params.prompt
      ? ({
          ...params.cfg,
          tools: {
            ...params.cfg.tools,
            media: {
              ...params.cfg.tools?.media,
              audio: {
                ...params.cfg.tools?.media?.audio,
                ...(params.language ? { _requestLanguageOverride: params.language } : {}),
                ...(params.prompt ? { _requestPromptOverride: params.prompt } : {}),
                ...(params.language ? { language: params.language } : {}),
                ...(params.prompt ? { prompt: params.prompt } : {}),
              },
            },
          },
        } as OpenClawConfig)
      : params.cfg;
  const result = await runMediaUnderstandingFile({ ...params, cfg, capability: "audio" });
  return result;
}
