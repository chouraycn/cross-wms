/**
 * Media Streaming Server — 流媒体服务
 *
 * 提供 HLS/DASH 清单生成、会话管理、分片策略等纯计算逻辑。
 */

import { logger } from "../../logger.js";
import type {
  MediaAsset,
  StreamingProtocol,
  StreamingServerConfig,
  StreamingSession,
} from "./types.js";

export const DEFAULT_SEGMENT_DURATION = 6; // seconds
export const DEFAULT_MAX_CONCURRENT_SESSIONS = 100;
export const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

const sessions: Map<string, StreamingSession> = new Map();
let currentConfig: StreamingServerConfig = {
  segmentDurationSeconds: DEFAULT_SEGMENT_DURATION,
  maxConcurrentSessions: DEFAULT_MAX_CONCURRENT_SESSIONS,
  enableHls: true,
  enableDash: true,
};

export function configureStreamingServer(config: StreamingServerConfig): void {
  currentConfig = { ...currentConfig, ...config };
  logger.debug(
    `[StreamingServer] Configured: hls=${currentConfig.enableHls}, dash=${currentConfig.enableDash}`,
  );
}

export function getStreamingConfig(): StreamingServerConfig {
  return { ...currentConfig };
}

export function validateStreamingConfig(config: StreamingServerConfig): string[] {
  const errors: string[] = [];
  if (
    config.segmentDurationSeconds !== undefined &&
    (config.segmentDurationSeconds <= 0 || config.segmentDurationSeconds > 60)
  ) {
    errors.push("segmentDurationSeconds must be in (0, 60]");
  }
  if (
    config.maxConcurrentSessions !== undefined &&
    (config.maxConcurrentSessions <= 0 || !Number.isInteger(config.maxConcurrentSessions))
  ) {
    errors.push("maxConcurrentSessions must be a positive integer");
  }
  if (
    config.port !== undefined &&
    (config.port < 1 || config.port > 65535 || !Number.isInteger(config.port))
  ) {
    errors.push("port must be in [1, 65535]");
  }
  return errors;
}

export function generateSessionId(): string {
  return `stream_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function listSupportedProtocols(): StreamingProtocol[] {
  const protocols: StreamingProtocol[] = [];
  if (currentConfig.enableHls !== false) protocols.push("hls");
  if (currentConfig.enableDash !== false) protocols.push("dash");
  protocols.push("mp4");
  protocols.push("mp3");
  return protocols;
}

export function isProtocolSupported(protocol: StreamingProtocol): boolean {
  return listSupportedProtocols().includes(protocol);
}

export function computeSegments(
  durationSeconds: number,
  segmentDuration: number = currentConfig.segmentDurationSeconds ?? DEFAULT_SEGMENT_DURATION,
): Array<{ index: number; startSeconds: number; durationSeconds: number }> {
  if (durationSeconds <= 0 || segmentDuration <= 0) return [];
  const segments: Array<{ index: number; startSeconds: number; durationSeconds: number }> = [];
  let start = 0;
  let idx = 0;
  while (start < durationSeconds) {
    const end = Math.min(start + segmentDuration, durationSeconds);
    segments.push({
      index: idx,
      startSeconds: start,
      durationSeconds: end - start,
    });
    start = end;
    idx++;
  }
  return segments;
}

export function generateHlsManifest(
  asset: MediaAsset,
  segments: Array<{ index: number; startSeconds: number; durationSeconds: number }>,
  baseUrl?: string,
): string {
  const lines: string[] = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${Math.ceil(segments[0]?.durationSeconds ?? currentConfig.segmentDurationSeconds ?? DEFAULT_SEGMENT_DURATION)}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    `#EXT-X-PLAYLIST-TYPE:VOD`,
  ];

  const base = baseUrl ?? currentConfig.baseUrl ?? "";
  for (const seg of segments) {
    lines.push(`#EXTINF:${seg.durationSeconds.toFixed(3)},`);
    lines.push(`${base}/${asset.id}/segment_${seg.index}.ts`);
  }

  lines.push("#EXT-X-ENDLIST");
  return lines.join("\n");
}

export function generateDashManifest(
  asset: MediaAsset,
  segments: Array<{ index: number; startSeconds: number; durationSeconds: number }>,
  baseUrl?: string,
): string {
  const totalDuration = segments.reduce((acc, s) => acc + s.durationSeconds, 0);
  const base = baseUrl ?? currentConfig.baseUrl ?? "";

  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT${totalDuration}S" minBufferTime="PT1.5S">`,
    `  <Period>`,
    `    <AdaptationSet mimeType="${asset.mimeType}">`,
    `      <SegmentList duration="${currentConfig.segmentDurationSeconds ?? DEFAULT_SEGMENT_DURATION}">`,
  ];

  for (const seg of segments) {
    lines.push(`        <SegmentURL media="${base}/${asset.id}/segment_${seg.index}.m4s"/>`);
  }

  lines.push(`      </SegmentList>`);
  lines.push(`      <Representation id="0" bandwidth="1000000"/>`);
  lines.push(`    </AdaptationSet>`);
  lines.push(`  </Period>`);
  lines.push(`</MPD>`);

  return lines.join("\n");
}

export function createSession(
  asset: MediaAsset,
  protocol: StreamingProtocol,
): StreamingSession {
  if (!isProtocolSupported(protocol)) {
    throw new Error(`Protocol ${protocol} is not supported`);
  }
  const maxSessions = currentConfig.maxConcurrentSessions ?? DEFAULT_MAX_CONCURRENT_SESSIONS;
  if (sessions.size >= maxSessions) {
    throw new Error("Max concurrent sessions reached");
  }

  const id = generateSessionId();
  const now = Date.now();
  const segments =
    protocol === "hls" || protocol === "dash"
      ? computeSegments(asset.durationSeconds ?? 0).map((s) => ({
          url: `${currentConfig.baseUrl ?? ""}/${asset.id}/segment_${s.index}.${
            protocol === "hls" ? "ts" : "m4s"
          }`,
          durationSeconds: s.durationSeconds,
        }))
      : undefined;

  const session: StreamingSession = {
    id,
    assetId: asset.id,
    protocol,
    manifestUrl:
      protocol === "hls"
        ? `${currentConfig.baseUrl ?? ""}/${asset.id}/playlist.m3u8`
        : protocol === "dash"
          ? `${currentConfig.baseUrl ?? ""}/${asset.id}/manifest.mpd`
          : undefined,
    segments,
    startedAt: now,
    expiresAt: now + DEFAULT_SESSION_TTL_MS,
  };

  sessions.set(id, session);
  logger.debug(
    `[StreamingServer] Created session ${id} for asset ${asset.id} (${protocol})`,
  );

  return session;
}

export function getSession(id: string): StreamingSession | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (session.expiresAt && session.expiresAt < Date.now()) {
    sessions.delete(id);
    return undefined;
  }
  return session;
}

export function listSessions(): StreamingSession[] {
  return Array.from(sessions.values()).filter(
    (s) => !s.expiresAt || s.expiresAt >= Date.now(),
  );
}

export function closeSession(id: string): boolean {
  const existed = sessions.has(id);
  sessions.delete(id);
  if (existed) {
    logger.debug(`[StreamingServer] Closed session ${id}`);
  }
  return existed;
}

export function clearSessions(): void {
  sessions.clear();
}

export function getSessionStats(): {
  count: number;
  byProtocol: Record<string, number>;
} {
  const byProtocol: Record<string, number> = {};
  for (const s of sessions.values()) {
    byProtocol[s.protocol] = (byProtocol[s.protocol] ?? 0) + 1;
  }
  return {
    count: sessions.size,
    byProtocol,
  };
}

export function getManifestForSession(
  sessionId: string,
  asset: MediaAsset,
): string | undefined {
  const session = getSession(sessionId);
  if (!session) return undefined;

  if (session.protocol === "hls") {
    const segments = computeSegments(asset.durationSeconds ?? 0);
    return generateHlsManifest(asset, segments, currentConfig.baseUrl);
  }
  if (session.protocol === "dash") {
    const segments = computeSegments(asset.durationSeconds ?? 0);
    return generateDashManifest(asset, segments, currentConfig.baseUrl);
  }
  return undefined;
}

export function cleanupExpiredSessions(): number {
  let removed = 0;
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt && session.expiresAt < Date.now()) {
      sessions.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    logger.debug(`[StreamingServer] Cleaned up ${removed} expired session(s)`);
  }
  return removed;
}
