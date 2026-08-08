import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { ModelProviderConfig } from "../config/types.models.js";

export const DEFAULT_CACHE_MAX_ENTRIES = 200;
export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

export const DEFAULT_ANALYZE_OPTIONS: Required<Pick<AnalyzeOptions, "ocr" | "faceDetection" | "safetyDetection" | "skipCache" | "maxLength" | "timeoutMs">> = {
  ocr: false,
  faceDetection: false,
  safetyDetection: true,
  skipCache: false,
  maxLength: 100_000,
  timeoutMs: 30_000,
};

type MediaUnderstandingKind = "audio.transcription" | "video.description" | "image.description";

export type MediaKind = "image" | "audio" | "video" | "document";

export type MediaInput = {
  buffer?: Buffer;
  path?: string;
  url?: string;
  fileName?: string;
  mime?: string;
};

export type AnalyzeOptions = {
  providerId?: string;
  skipCache?: boolean;
  ocr?: boolean;
  faceDetection?: boolean;
  safetyDetection?: boolean;
  maxLength?: number;
  timeoutMs?: number;
  prompt?: string;
  model?: string;
};

export type ImageSafetyResult = {
  safe: boolean;
  categories: string[];
  confidence: number;
};

export type ImageDescription = {
  description: string;
  tags: string[];
  model?: string;
  ocrText?: string;
  faceCount?: number;
  safety?: ImageSafetyResult;
};

export type AudioAnalysis = {
  transcript?: string;
  hasMusic?: boolean;
  emotion?: {
    primary: string;
    distribution: Record<string, number>;
  };
  model?: string;
  durationSeconds?: number;
};

export type VideoAnalysis = {
  description: string;
  keyframes: Array<{ timestamp: number; description: string }>;
  scenes: Array<{ start: number; end: number; description: string }>;
  actions?: string[];
  durationSeconds?: number;
  model?: string;
};

export type DocumentAnalysis = {
  text: string;
  documentType: "pdf" | "word" | "excel" | "unknown";
  pageCount?: number;
  truncated?: boolean;
  model?: string;
};

export type MediaAnalysis =
  | { kind: "image"; result: ImageDescription }
  | { kind: "audio"; result: AudioAnalysis }
  | { kind: "video"; result: VideoAnalysis }
  | { kind: "document"; result: DocumentAnalysis };

export interface MediaAnalyzer {
  id: MediaKind;
  supportedMimes: string[];
  analyze(input: MediaInput, options?: AnalyzeOptions): Promise<MediaAnalysis>;
}

export interface MultimodalProvider {
  id: string;
  capabilities: MediaKind[];
  describeImage(input: MediaInput, options?: AnalyzeOptions): Promise<ImageDescription>;
  describeVideo(input: MediaInput, options?: AnalyzeOptions): Promise<VideoAnalysis>;
  transcribeAudio(input: MediaInput, options?: AnalyzeOptions): Promise<AudioAnalysis>;
  extractDocument(input: MediaInput, options?: AnalyzeOptions): Promise<DocumentAnalysis>;
}

export interface OcrProvider {
  id: string;
  recognize(buffer: Buffer, mime?: string): Promise<string>;
}

export function inferMediaKind(mime?: string, fileName?: string): MediaKind | null {
  const lowerMime = (mime ?? "").toLowerCase();
  const lowerName = (fileName ?? "").toLowerCase();

  if (lowerMime.startsWith("image/")) return "image";
  if (lowerMime.startsWith("audio/")) return "audio";
  if (lowerMime.startsWith("video/")) return "video";
  if (
    lowerMime === "application/pdf" ||
    lowerMime.includes("wordprocessing") ||
    lowerMime.includes("spreadsheet") ||
    lowerMime === "application/msword" ||
    lowerMime === "application/vnd.ms-excel"
  ) {
    return "document";
  }

  if (/\.(png|jpe?g|gif|webp|bmp|svg|tiff?|avif|heic)$/i.test(lowerName)) return "image";
  if (/\.(mp3|wav|ogg|flac|aac|m4a|wma|opus)$/i.test(lowerName)) return "audio";
  if (/\.(mp4|webm|avi|mov|mkv|flv|wmv|m4v)$/i.test(lowerName)) return "video";
  if (/\.(pdf|docx?|xlsx?|pptx?|txt|md|rtf)$/i.test(lowerName)) return "document";

  return null;
}

export type MediaUnderstandingCapability = "image" | "audio" | "video";

export type MediaUnderstandingCapabilityRegistry = Map<
  string,
  {
    capabilities?: MediaUnderstandingCapability[];
  }
>;

export type MediaAttachment = {
  path?: string;
  url?: string;
  mime?: string;
  index: number;
  alreadyTranscribed?: boolean;
};

export type MediaUnderstandingOutput = {
  kind: MediaUnderstandingKind;
  attachmentIndex: number;
  text: string;
  provider: string;
  model?: string;
};

type MediaUnderstandingDecisionOutcome =
  | "success"
  | "failed"
  | "skipped"
  | "disabled"
  | "no-attachment"
  | "scope-deny";

export type MediaUnderstandingModelDecision = {
  provider?: string;
  model?: string;
  type: "provider" | "cli";
  outcome: "success" | "skipped" | "failed";
  reason?: string;
};

type MediaUnderstandingAttachmentDecision = {
  attachmentIndex: number;
  attempts: MediaUnderstandingModelDecision[];
  chosen?: MediaUnderstandingModelDecision;
};

export type MediaUnderstandingDecision = {
  capability: MediaUnderstandingCapability;
  outcome: MediaUnderstandingDecisionOutcome;
  attachments: MediaUnderstandingAttachmentDecision[];
};

type MediaUnderstandingProviderRequestAuthOverride =
  | { mode: "provider-default" }
  | { mode: "authorization-bearer"; token: string }
  | { mode: "header"; headerName: string; value: string; prefix?: string };

type MediaUnderstandingProviderRequestTlsOverride = {
  ca?: string;
  cert?: string;
  key?: string;
  passphrase?: string;
  serverName?: string;
  insecureSkipVerify?: boolean;
};

type MediaUnderstandingProviderRequestProxyOverride =
  | { mode: "env-proxy"; tls?: MediaUnderstandingProviderRequestTlsOverride }
  | { mode: "explicit-proxy"; url: string; tls?: MediaUnderstandingProviderRequestTlsOverride };

type MediaUnderstandingProviderRequestTransportOverrides = {
  headers?: Record<string, string>;
  auth?: MediaUnderstandingProviderRequestAuthOverride;
  proxy?: MediaUnderstandingProviderRequestProxyOverride;
  tls?: MediaUnderstandingProviderRequestTlsOverride;
  allowPrivateNetwork?: boolean;
};

export type MediaUnderstandingProviderRequestAuth =
  | { kind: "api-key"; apiKey: string; source?: string }
  | { kind: "none"; source: string };

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

export type AudioTranscriptionResult = {
  text: string;
  model?: string;
};

export type VideoDescriptionRequest = {
  buffer: Buffer;
  fileName: string;
  mime?: string;
  apiKey: string;
  auth?: MediaUnderstandingProviderRequestAuth;
  baseUrl?: string;
  headers?: Record<string, string>;
  request?: MediaUnderstandingProviderRequestTransportOverrides;
  model?: string;
  prompt?: string;
  timeoutMs: number;
  fetchFn?: typeof fetch;
};

export type VideoDescriptionResult = {
  text: string;
  model?: string;
};

export type ImageDescriptionRequest = {
  buffer: Buffer;
  fileName: string;
  mime?: string;
  prompt?: string;
  maxTokens?: number;
  timeoutMs: number;
  profile?: string;
  preferredProfile?: string;
  authStore?: any;
  agentDir: string;
  workspaceDir?: string;
  cfg: OpenClawConfig;
  model: string;
  provider: string;
};

export type ImagesDescriptionInput = {
  buffer: Buffer;
  fileName: string;
  mime?: string;
};

export type ImagesDescriptionRequest = {
  images: ImagesDescriptionInput[];
  model: string;
  provider: string;
  prompt?: string;
  maxTokens?: number;
  timeoutMs: number;
  profile?: string;
  preferredProfile?: string;
  authStore?: any;
  agentDir: string;
  workspaceDir?: string;
  cfg: OpenClawConfig;
};

export type ImageDescriptionResult = {
  text: string;
  model?: string;
};

export type ImagesDescriptionResult = {
  text: string;
  model?: string;
};

export type StructuredExtractionTextInput = {
  type: "text";
  text: string;
};

export type StructuredExtractionImageInput = {
  type: "image";
  buffer: Buffer;
  fileName: string;
  mime?: string;
};

export type StructuredExtractionInput =
  | StructuredExtractionTextInput
  | StructuredExtractionImageInput;

export type StructuredExtractionRequest = {
  input: StructuredExtractionInput[];
  instructions: string;
  schemaName?: string;
  jsonSchema?: any;
  jsonMode?: boolean;
  timeoutMs: number;
  profile?: string;
  preferredProfile?: string;
  authStore?: any;
  agentDir: string;
  cfg: OpenClawConfig;
  model: string;
  provider: string;
};

export type StructuredExtractionResult = {
  text: string;
  parsed?: any;
  model?: string;
  provider?: string;
  contentType?: "json" | "text";
};

export type MediaUnderstandingDocumentModelDefaults = {
  textExtraction?: string;
  image?: string | false;
};

export type MediaUnderstandingProviderAuthContext = {
  config?: OpenClawConfig;
  provider: string;
  providerConfig?: ModelProviderConfig;
};

export type MediaUnderstandingProviderAuthResult =
  | { kind: "none"; source: string }
  | { kind: "api-key"; apiKey: string; source: string; mode?: "api-key" };

export type MediaUnderstandingProviderSyntheticAuthResult = {
  apiKey: string;
  source: string;
  mode: "api-key";
};

export type MediaUnderstandingProvider = {
  id: string;
  capabilities?: MediaUnderstandingCapability[];
  defaultModels?: Partial<Record<MediaUnderstandingCapability, string>>;
  autoPriority?: Partial<Record<MediaUnderstandingCapability, number>>;
  nativeDocumentInputs?: Array<"pdf">;
  documentModels?: Partial<Record<"pdf", MediaUnderstandingDocumentModelDefaults>>;
  resolveAuth?: (
    ctx: MediaUnderstandingProviderAuthContext,
  ) => MediaUnderstandingProviderAuthResult | null | undefined;
  resolveSyntheticAuth?: (
    ctx: MediaUnderstandingProviderAuthContext,
  ) => MediaUnderstandingProviderSyntheticAuthResult | null | undefined;
  transcribeAudio?: (req: AudioTranscriptionRequest) => Promise<AudioTranscriptionResult>;
  describeVideo?: (req: VideoDescriptionRequest) => Promise<VideoDescriptionResult>;
  describeImage?: (req: ImageDescriptionRequest) => Promise<ImageDescriptionResult>;
  describeImages?: (req: ImagesDescriptionRequest) => Promise<ImagesDescriptionResult>;
  extractStructured?: (req: StructuredExtractionRequest) => Promise<StructuredExtractionResult>;
};
