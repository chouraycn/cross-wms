/**
 * 用户轮次转录本
 *
 * 从会话转录本中提取用户轮次文本
 */

import type {
  PersistedUserTurnMessage,
  PersistedUserTurnMediaInput,
  UserTurnInput,
  UserTurnTranscriptUpdateMode,
} from './types.js';
import { applyInputProvenanceToUserMessage, normalizeInputProvenance } from './input-provenance.js';

export type {
  PersistedUserTurnMessage,
  PersistedUserTurnMediaInput,
  UserTurnInput,
  UserTurnTranscriptUpdateMode,
} from './types.js';

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeTranscriptText(value: string | null | undefined): string {
  return value ?? '';
}

const CHANNEL_MEDIA_PLACEHOLDER_PATTERN = /^<media:[a-z0-9_-]+>(?:\s+\([^)]*\))?$/i;

export function resolvePersistedUserTurnText(
  value: string | null | undefined,
  options: { hasMedia?: boolean } = {},
): string | undefined {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return undefined;
  }
  if (options.hasMedia === true && CHANNEL_MEDIA_PLACEHOLDER_PATTERN.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function mediaTypeForTranscript(media: PersistedUserTurnMediaInput): string {
  return (
    normalizeOptionalText(media.contentType) ??
    normalizeOptionalText(media.kind) ??
    'application/octet-stream'
  );
}

function normalizeMediaEntryForTranscript(media: PersistedUserTurnMediaInput):
  | {
      path: string;
      type: string;
    }
  | undefined {
  const pathLocal = normalizeOptionalText(media.path) ?? normalizeOptionalText(media.url);
  if (!pathLocal) {
    return undefined;
  }
  return {
    path: pathLocal,
    type: mediaTypeForTranscript(media),
  };
}

function normalizeOptionalTextArray(
  values: readonly (string | null | undefined)[] | null | undefined,
): (string | undefined)[] {
  return values?.map(normalizeOptionalText) ?? [];
}

function buildPersistedUserTurnMediaFields(
  media: readonly PersistedUserTurnMediaInput[] | null | undefined,
): {
  MediaPath?: string;
  MediaPaths?: string[];
  MediaType?: string;
  MediaTypes?: string[];
} {
  const entries = Array.isArray(media) ? media : [];
  const normalized = entries
    .map(normalizeMediaEntryForTranscript)
    .filter((entry): entry is { path: string; type: string } => entry !== undefined);
  const paths = normalized.map((entry) => entry.path);
  if (paths.length === 0) {
    return {};
  }
  const types = normalized.map((entry) => entry.type);
  return {
    MediaPath: paths[0],
    MediaPaths: paths,
    MediaType: types[0],
    MediaTypes: types,
  };
}

export function buildPersistedUserTurnMessage(params: UserTurnInput): PersistedUserTurnMessage {
  const mediaFields = buildPersistedUserTurnMediaFields(params.media);
  const hasMedia = Boolean(mediaFields.MediaPath);
  const text = normalizeTranscriptText(params.text);
  const content = text || (hasMedia ? (params.mediaOnlyText ?? '') : '');

  const message = {
    role: 'user' as const,
    content,
    timestamp: params.timestamp ?? Date.now(),
    ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
    ...mediaFields,
  } as PersistedUserTurnMessage;

  return applyInputProvenanceToUserMessage(
    message,
    params.provenance,
  ) as PersistedUserTurnMessage;
}

export function buildPersistedUserTurnMediaInputsFromFields(fields: {
  MediaPath?: string | null;
  MediaPaths?: readonly (string | null | undefined)[] | null;
  MediaUrl?: string | null;
  MediaUrls?: readonly (string | null | undefined)[] | null;
  MediaType?: string | null;
  MediaTypes?: readonly (string | null | undefined)[] | null;
} | null | undefined): PersistedUserTurnMediaInput[] {
  if (!fields) {
    return [];
  }

  const paths = normalizeOptionalTextArray(fields.MediaPaths);
  const urls = normalizeOptionalTextArray(fields.MediaUrls);
  const types = normalizeOptionalTextArray(fields.MediaTypes);
  const singlePath = normalizeOptionalText(fields.MediaPath);
  const singleUrl = normalizeOptionalText(fields.MediaUrl);
  const singleType = normalizeOptionalText(fields.MediaType);
  const mediaCount = Math.max(paths.length, urls.length, singlePath || singleUrl ? 1 : 0);
  const media: PersistedUserTurnMediaInput[] = [];

  for (let index = 0; index < mediaCount; index += 1) {
    const rawPath = paths[index] ?? (index === 0 ? singlePath : undefined);
    const url = urls[index] ?? (index === 0 ? singleUrl : undefined);
    if (!rawPath && !url) {
      continue;
    }
    media.push({
      ...(rawPath ? { path: rawPath } : {}),
      ...(url ? { url } : {}),
      contentType: types[index] ?? (index === 0 ? singleType : undefined),
    });
  }

  return media;
}

export function mergePreparedUserTurnMessageForRuntime(params: {
  runtimeMessage: PersistedUserTurnMessage;
  preparedMessage?: PersistedUserTurnMessage;
}): PersistedUserTurnMessage {
  if (!params.preparedMessage || params.runtimeMessage.role !== 'user') {
    return params.runtimeMessage;
  }
  return {
    ...params.runtimeMessage,
    ...params.preparedMessage,
  };
}

export function isUserMessage(message: { role?: unknown }): message is PersistedUserTurnMessage {
  return (message as { role?: unknown }).role === 'user';
}
