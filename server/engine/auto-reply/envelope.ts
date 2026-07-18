export type EnvelopeFormatOptions = {
  timezone?: string;
  includeTimestamp?: boolean;
  includeElapsed?: boolean;
  userTimezone?: string;
};

type NormalizedEnvelopeOptions = {
  timezone: string;
  includeTimestamp: boolean;
  includeElapsed: boolean;
  userTimezone?: string;
};

function sanitizeEnvelopeHeaderPart(value: string): string {
  return value
    .replace(/\r\n|\r|\n/g, ' ')
    .replaceAll('[', '(')
    .replaceAll(']', ')')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEnvelopeOptions(options?: EnvelopeFormatOptions): NormalizedEnvelopeOptions {
  const includeTimestamp = options?.includeTimestamp !== false;
  const includeElapsed = options?.includeElapsed !== false;
  return {
    timezone: options?.timezone?.trim() || 'local',
    includeTimestamp,
    includeElapsed,
    userTimezone: options?.userTimezone,
  };
}

function formatTimeAgo(ms: number): string {
  if (ms < 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatTimestamp(ts: number | Date | undefined, options: NormalizedEnvelopeOptions): string | undefined {
  if (!ts) return undefined;
  if (!options.includeTimestamp) return undefined;

  const date = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(date.getTime())) return undefined;

  let dateStr: string;
  try {
    if (options.timezone === 'utc' || options.timezone === 'gmt') {
      dateStr = date.toISOString();
    } else if (options.userTimezone) {
      dateStr = date.toLocaleString('en-US', { timeZone: options.userTimezone });
    } else {
      dateStr = date.toLocaleString('en-US');
    }
  } catch {
    dateStr = date.toISOString();
  }

  return dateStr;
}

export type AgentEnvelopeParams = {
  channel: string;
  from?: string;
  timestamp?: number | Date;
  host?: string;
  ip?: string;
  body: string;
  previousTimestamp?: number | Date;
  envelope?: EnvelopeFormatOptions;
};

export function formatAgentEnvelope(params: AgentEnvelopeParams): string {
  const channel = sanitizeEnvelopeHeaderPart(params.channel || 'Channel');
  const parts: string[] = [channel];
  const resolved = normalizeEnvelopeOptions(params.envelope);

  let elapsed: string | undefined;
  if (resolved.includeElapsed && params.timestamp && params.previousTimestamp) {
    const currentMs =
      params.timestamp instanceof Date ? params.timestamp.getTime() : params.timestamp;
    const previousMs =
      params.previousTimestamp instanceof Date
        ? params.previousTimestamp.getTime()
        : params.previousTimestamp;
    const elapsedMs = currentMs - previousMs;
    elapsed =
      Number.isFinite(elapsedMs) && elapsedMs >= 0 ? formatTimeAgo(elapsedMs) : undefined;
  }

  const from = params.from?.trim();
  if (from) {
    const fromLabel = sanitizeEnvelopeHeaderPart(from);
    parts.push(elapsed ? `${fromLabel} +${elapsed}` : fromLabel);
  } else if (elapsed) {
    parts.push(`+${elapsed}`);
  }

  const host = params.host?.trim();
  if (host) {
    parts.push(sanitizeEnvelopeHeaderPart(host));
  }

  const ip = params.ip?.trim();
  if (ip) {
    parts.push(sanitizeEnvelopeHeaderPart(ip));
  }

  const ts = formatTimestamp(params.timestamp, resolved);
  if (ts) {
    parts.push(ts);
  }

  const header = `[${parts.join(' ')}]`;
  return `${header} ${params.body}`;
}

export type InboundEnvelopeParams = {
  channel: string;
  from: string;
  body: string;
  timestamp?: number | Date;
  chatType?: 'direct' | 'group' | 'channel';
  senderLabel?: string;
  previousTimestamp?: number | Date;
  envelope?: EnvelopeFormatOptions;
  fromMe?: boolean;
};

function resolveDirectEnvelopeBodyLabel(from: string | undefined): string {
  const label = sanitizeEnvelopeHeaderPart(from || '');
  const idMarkerIndex = label.search(/\s+id:/i);
  if (idMarkerIndex > 0) {
    const displayLabel = label.slice(0, idMarkerIndex).trim();
    return displayLabel.includes(':') ? '(sender)' : displayLabel;
  }
  return label.includes(':') ? '(sender)' : label;
}

export function formatInboundEnvelope(params: InboundEnvelopeParams): string {
  const chatType = params.chatType ?? 'direct';
  const isDirect = chatType === 'direct';
  const resolvedSender = params.senderLabel
    ? sanitizeEnvelopeHeaderPart(params.senderLabel)
    : '';
  const directSender = resolveDirectEnvelopeBodyLabel(params.from);

  const body =
    isDirect && params.fromMe
      ? `(self): ${params.body}`
      : isDirect && directSender
        ? `${directSender}: ${params.body}`
        : !isDirect && resolvedSender
          ? `${resolvedSender}: ${params.body}`
          : params.body;

  return formatAgentEnvelope({
    channel: params.channel,
    from: params.from,
    timestamp: params.timestamp,
    previousTimestamp: params.previousTimestamp,
    envelope: params.envelope,
    body,
  });
}

export type InboundFromLabelParams = {
  isGroup: boolean;
  groupLabel?: string;
  groupId?: string;
  directLabel: string;
  directId?: string;
  groupFallback?: string;
};

export function formatInboundFromLabel(params: InboundFromLabelParams): string {
  if (params.isGroup) {
    const label = params.groupLabel?.trim() || params.groupFallback || 'Group';
    const id = params.groupId?.trim();
    return id ? `${label} id:${id}` : label;
  }

  const directLabel = params.directLabel.trim();
  const directId = params.directId?.trim();
  if (!directId || directId === directLabel) {
    return directLabel;
  }
  return `${directLabel} id:${directId}`;
}

export function formatEnvelopeTimestamp(
  ts: number | Date | undefined,
  options?: EnvelopeFormatOptions,
): string | undefined {
  return formatTimestamp(ts, normalizeEnvelopeOptions(options));
}

export function resolveEnvelopeFormatOptions(cfg?: {
  envelopeTimezone?: string;
  envelopeTimestamp?: string;
  envelopeElapsed?: string;
  userTimezone?: string;
}): EnvelopeFormatOptions {
  return {
    timezone: cfg?.envelopeTimezone,
    includeTimestamp: cfg?.envelopeTimestamp !== 'off',
    includeElapsed: cfg?.envelopeElapsed !== 'off',
    userTimezone: cfg?.userTimezone,
  };
}
