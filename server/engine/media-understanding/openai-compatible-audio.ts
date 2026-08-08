// OpenAI-compatible audio transcription adapter for providers exposing the
// /audio/transcriptions API shape.
// Ported from openclaw/src/media-understanding/openai-compatible-audio.ts.
import { OPENAI_AUDIO_TRANSCRIPTIONS_API } from "./openai-audio-api.js";
import {
  assertOkOrThrowHttpError,
  buildAudioTranscriptionFormData,
  postTranscriptionRequest,
  readProviderJsonObjectResponse,
  resolveProviderHttpRequestConfig,
  requireTranscriptionText,
} from "./shared.js";

type MediaUnderstandingProviderRequestAuth =
  | { kind: "api-key"; apiKey: string; source?: string }
  | { kind: "none"; source: string };

type MediaUnderstandingProviderRequestTransportOverrides = {
  headers?: Record<string, string>;
  auth?: MediaUnderstandingProviderRequestAuth;
  allowPrivateNetwork?: boolean;
};

/** Audio transcription request parameters. */
export type AudioTranscriptionRequest = {
  buffer: Buffer;
  fileName: string;
  mime?: string;
  apiKey: string;
  auth?: MediaUnderstandingProviderRequestAuth;
  baseUrl?: string;
  headers?: Record<string, string>;
  request?: MediaUnderstandingProviderRequestTransportOverrides;
  model?: string;
  language?: string;
  prompt?: string;
  query?: Record<string, string | number | boolean>;
  timeoutMs: number;
  fetchFn?: typeof fetch;
};

/** Audio transcription result. */
export type AudioTranscriptionResult = {
  text: string;
  model?: string;
};

type OpenAiCompatibleAudioParams = AudioTranscriptionRequest & {
  defaultBaseUrl: string;
  defaultModel: string;
  provider?: string;
};

function resolveModel(model: string | undefined, fallback: string): string {
  const trimmed = model?.trim();
  return trimmed || fallback;
}

/** Sends an OpenAI-compatible audio transcription request and returns validated text output. */
export async function transcribeOpenAiCompatibleAudio(
  params: OpenAiCompatibleAudioParams,
): Promise<AudioTranscriptionResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const apiKey = params.auth?.kind === "api-key" ? params.auth.apiKey : params.apiKey;
  const defaultHeaders =
    params.auth?.kind === "none" || !apiKey
      ? undefined
      : {
          authorization: `Bearer ${apiKey}`,
        };
  const { baseUrl, allowPrivateNetwork, headers } =
    resolveProviderHttpRequestConfig({
      baseUrl: params.baseUrl,
      defaultBaseUrl: params.defaultBaseUrl,
      headers: params.headers,
      request: params.request as Record<string, any> | undefined,
      defaultHeaders,
      provider: params.provider,
      api: OPENAI_AUDIO_TRANSCRIPTIONS_API,
      capability: "audio",
      transport: "media-understanding",
    });
  const url = `${baseUrl}/audio/transcriptions`;

  const model = resolveModel(params.model, params.defaultModel);
  const form = buildAudioTranscriptionFormData({
    buffer: params.buffer,
    fileName: params.fileName,
    mime: params.mime,
    fields: {
      model,
      language: params.language,
      prompt: params.prompt,
    },
  });

  const { response: res, release } = await postTranscriptionRequest({
    url,
    headers,
    body: form,
    timeoutMs: params.timeoutMs,
    fetchFn,
    pinDns: false,
    allowPrivateNetwork,
  });

  try {
    await assertOkOrThrowHttpError(res, "Audio transcription failed");

    const payload = await readProviderJsonObjectResponse(res, "Audio transcription failed");
    const text = requireTranscriptionText(
      typeof payload.text === "string" ? payload.text : undefined,
      "Audio transcription response missing text",
    );
    return { text, model };
  } finally {
    await release();
  }
}
