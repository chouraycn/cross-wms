// Public media-understanding runtime API types for file-based image/audio/video
// helpers and direct structured extraction.
// Ported from openclaw/src/media-understanding/runtime-types.ts.
// Simplified for cross-wms: removed OpenClawConfig-specific types, adapted to
// cross-wms media-understanding types.
import type { MediaUnderstandingCapability, MediaUnderstandingProvider } from "./types.js";

export type RunMediaUnderstandingFileParams = {
  capability: MediaUnderstandingCapability;
  filePath: string;
  mediaUrl?: string;
  mime?: string;
  prompt?: string;
  timeoutMs?: number;
  scopeContext?: MediaUnderstandingScopeContext;
};

export type MediaUnderstandingScopeContext = {
  sessionKey?: string;
  channel?: string;
  chatType?: string;
};

export type RunMediaUnderstandingFileResult = {
  text: string | undefined;
  provider?: string;
  model?: string;
};

export type DescribeImageFileParams = {
  filePath: string;
  mediaUrl?: string;
  mime?: string;
  prompt?: string;
  timeoutMs?: number;
  scopeContext?: MediaUnderstandingScopeContext;
};

export type DescribeImageFileWithModelParams = {
  filePath: string;
  mediaUrl?: string;
  mime?: string;
  provider: string;
  model: string;
  prompt: string;
  maxTokens?: number;
  timeoutMs?: number;
};

export type DescribeImageFileWithModelResult = {
  text: string;
  model?: string;
};

export type ExtractStructuredWithModelParams = {
  input: StructuredExtractionInput[];
  instructions: string;
  schemaName?: string;
  jsonSchema?: unknown;
  jsonMode?: boolean;
  provider: string;
  model: string;
  timeoutMs?: number;
};

export type ExtractStructuredWithModelResult = {
  data?: unknown;
  text?: string;
  model?: string;
};

export type DescribeVideoFileParams = {
  filePath: string;
  mime?: string;
};

export type TranscribeAudioFileParams = {
  filePath: string;
  mime?: string;
  language?: string;
  prompt?: string;
};

export type MediaUnderstandingRuntime = {
  runMediaUnderstandingFile: (
    params: RunMediaUnderstandingFileParams,
  ) => Promise<RunMediaUnderstandingFileResult>;
  describeImageFile: (params: DescribeImageFileParams) => Promise<RunMediaUnderstandingFileResult>;
  describeImageFileWithModel: (
    params: DescribeImageFileWithModelParams,
  ) => Promise<DescribeImageFileWithModelResult>;
  extractStructuredWithModel: (
    params: ExtractStructuredWithModelParams,
  ) => Promise<ExtractStructuredWithModelResult>;
  describeVideoFile: (params: DescribeVideoFileParams) => Promise<RunMediaUnderstandingFileResult>;
  transcribeAudioFile: (
    params: TranscribeAudioFileParams,
  ) => Promise<RunMediaUnderstandingFileResult>;
};

type StructuredExtractionTextInput = {
  type: "text";
  text: string;
};

type StructuredExtractionImageInput = {
  type: "image";
  buffer: Buffer;
  fileName: string;
  mime?: string;
};

export type StructuredExtractionInput =
  | StructuredExtractionTextInput
  | StructuredExtractionImageInput;
