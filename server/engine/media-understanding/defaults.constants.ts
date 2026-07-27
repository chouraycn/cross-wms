export const DEFAULT_TIMEOUT_SECONDS = 60;
export const CLI_OUTPUT_MAX_BUFFER = 1024 * 1024;
export const MIN_AUDIO_FILE_BYTES = 1024;

export const DEFAULT_MAX_BYTES = {
  image: 20 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 50 * 1024 * 1024,
};

export const DEFAULT_MAX_CHARS = 12_000;

export const DEFAULT_MAX_CHARS_BY_CAPABILITY: Record<string, number> = {
  image: 4_000,
  audio: 8_000,
  video: 8_000,
  document: 12_000,
};

export const DEFAULT_MEDIA_CONCURRENCY = 2;

export const DEFAULT_PROMPT = "Describe the content";

export const DEFAULT_VIDEO_MAX_BASE64_BYTES = 3 * 1024 * 1024;
