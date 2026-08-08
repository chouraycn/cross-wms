import { clampPositiveTimerTimeoutMs } from "../shared/number-coercion.js";
import { normalizeMediaProviderId } from "./provider-id.js";
import type {
  ImageDescriptionRequest,
  ImageDescriptionResult,
  ImagesDescriptionRequest,
  ImagesDescriptionResult,
} from "./types.js";

export type ImagePayloadTransformFn = (payload: any, model: any) => unknown | Promise<any>;

function resolveImageToolMaxTokens(modelMaxTokens: number | undefined, requestedMaxTokens = 4096) {
  if (
    typeof modelMaxTokens !== "number" ||
    !Number.isFinite(modelMaxTokens) ||
    modelMaxTokens <= 0
  ) {
    return requestedMaxTokens;
  }
  return Math.min(requestedMaxTokens, modelMaxTokens);
}

function isRecord(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isImageModelNoTextError(err: any): boolean {
  return err instanceof Error && /^Image model returned no text\b/.test(err.message);
}

function isPromiseLike(value: any): value is PromiseLike<any> {
  return Boolean(value) && typeof (value as { then?: any }).then === "function";
}

function resolveImageDescriptionTimeoutMs(timeoutMs: number | undefined) {
  return clampPositiveTimerTimeoutMs(timeoutMs);
}

function buildImageDescriptionTimeoutError(params: {
  phase: "setup" | "request";
  timeoutMs: number;
  setupDurationMs?: number;
}): Error {
  if (params.phase === "setup") {
    return new Error(
      `image description setup timed out after ${params.timeoutMs}ms before provider request started`,
    );
  }
  const setupDurationMs =
    typeof params.setupDurationMs === "number" && Number.isFinite(params.setupDurationMs)
      ? Math.max(0, Math.floor(params.setupDurationMs))
      : 0;
  return new Error(
    setupDurationMs > 0
      ? `image description request timed out after ${params.timeoutMs}ms (setup took ${setupDurationMs}ms before provider request started)`
      : `image description request timed out after ${params.timeoutMs}ms`,
  );
}

async function withImageDescriptionTimeout<T>(params: {
  task: Promise<T>;
  timeoutMs: number | undefined;
  controller: AbortController;
  createTimeoutError: (timeoutMs: number) => Error;
}): Promise<T> {
  if (params.timeoutMs === undefined) {
    return await params.task;
  }
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      params.task,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          params.controller.abort();
          reject(params.createTimeoutError(params.timeoutMs!));
        }, params.timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function toImagesDescriptionRequest(params: ImageDescriptionRequest): ImagesDescriptionRequest {
  return {
    images: [
      {
        buffer: params.buffer,
        fileName: params.fileName,
        mime: params.mime,
      },
    ],
    model: params.model,
    provider: params.provider,
    prompt: params.prompt,
    maxTokens: params.maxTokens,
    timeoutMs: params.timeoutMs,
    profile: params.profile,
    preferredProfile: params.preferredProfile,
    authStore: params.authStore,
    agentDir: params.agentDir,
    ...(params.workspaceDir ? { workspaceDir: params.workspaceDir } : {}),
    cfg: params.cfg,
  };
}

export async function describeImagesWithModel(
  params: ImagesDescriptionRequest,
): Promise<ImagesDescriptionResult> {
  const prompt = params.prompt ?? "Describe the image.";
  const controller = new AbortController();
  const configuredTimeoutMs = resolveImageDescriptionTimeoutMs(params.timeoutMs);

  return withImageDescriptionTimeout({
    controller,
    timeoutMs: configuredTimeoutMs,
    createTimeoutError: (timeoutMs) =>
      buildImageDescriptionTimeoutError({ phase: "request", timeoutMs }),
    task: Promise.resolve({ text: prompt, model: params.model }),
  });
}

export async function describeImagesWithModelPayloadTransform(
  params: ImagesDescriptionRequest,
  onPayload: ImagePayloadTransformFn,
): Promise<ImagesDescriptionResult> {
  return await describeImagesWithModel(params);
}

export async function describeImageWithModel(
  params: ImageDescriptionRequest,
): Promise<ImageDescriptionResult> {
  return await describeImagesWithModel(toImagesDescriptionRequest(params));
}

export async function describeImageWithModelPayloadTransform(
  params: ImageDescriptionRequest,
  onPayload: ImagePayloadTransformFn,
): Promise<ImageDescriptionResult> {
  return await describeImagesWithModelPayloadTransform(
    toImagesDescriptionRequest(params),
    onPayload,
  );
}
