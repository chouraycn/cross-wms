/**
 * 轨迹元数据管理
 *
 * 管理轨迹 bundle 的元数据，包括生成清单、统计信息、提取、更新、搜索等。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import type {
  TrajectoryBundleManifest,
  TrajectoryBundleWarning,
  TrajectoryEvent,
  TrajectoryStatus,
  TrajectoryRecordMetadata,
  TrajectoryRecord,
  MetadataSearchCriteria,
  TrajectoryMetadataSummary,
  TrajectorySessionInfo,
} from './types.js';

export type TrajectoryMetadata = TrajectoryRecordMetadata;

export { TrajectoryMetadataSummary };

export class TrajectoryMetadataManager {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async createManifest(params: {
    traceId: string;
    sessionId: string;
    sessionKey?: string;
    workspaceDir: string;
    leafId: string | null;
    sourceFiles: {
      session: string;
      runtime?: string;
    };
    events?: TrajectoryEvent[];
    warnings?: TrajectoryBundleWarning[];
    contents?: Array<{ path: string; mediaType: string; bytes: number }>;
  }): Promise<TrajectoryBundleManifest> {
    const {
      traceId,
      sessionId,
      sessionKey,
      workspaceDir,
      leafId,
      sourceFiles,
      events = [],
      warnings = [],
      contents,
    } = params;

    const runtimeEvents = events.filter((e) => e.source === 'runtime');
    const transcriptEvents = events.filter((e) => e.source === 'transcript');

    const manifest: TrajectoryBundleManifest = {
      traceSchema: 'cdf-know-trajectory',
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      traceId,
      sessionId,
      sessionKey,
      workspaceDir,
      leafId,
      eventCount: events.length,
      runtimeEventCount: runtimeEvents.length,
      transcriptEventCount: transcriptEvents.length,
      sourceFiles,
      warnings,
      contents,
    };

    return manifest;
  }

  async saveManifest(manifest: TrajectoryBundleManifest, outputPath: string): Promise<void> {
    try {
      const dir = path.dirname(outputPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');
      logger.debug(`[Trajectory Metadata] Saved manifest: ${outputPath}`);
    } catch (err) {
      logger.error(`[Trajectory Metadata] Failed to save manifest: ${String(err)}`);
      throw err;
    }
  }

  async loadManifest(manifestPath: string): Promise<TrajectoryBundleManifest> {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as TrajectoryBundleManifest;
      return manifest;
    } catch (err) {
      logger.error(`[Trajectory Metadata] Failed to load manifest: ${String(err)}`);
      throw err;
    }
  }

  async extractFromEvents(events: TrajectoryEvent[], sessionId: string): Promise<TrajectoryRecordMetadata> {
    if (events.length === 0) {
      return {
        traceId: sessionId,
        sessionId,
        startTime: new Date().toISOString(),
        status: 'started',
        eventCount: 0,
        errorCount: 0,
        toolCallCount: 0,
      };
    }

    const sortedEvents = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
    const firstEvent = sortedEvents[0]!;
    const lastEvent = sortedEvents[sortedEvents.length - 1]!;

    let errorCount = 0;
    let toolCallCount = 0;
    let status: TrajectoryStatus = 'running';

    for (const event of sortedEvents) {
      if (event.type === 'error' || event.type.includes('error')) {
        errorCount++;
      }
      if (event.type === 'tool_call' || event.type === 'tool.call' || event.type.includes('tool_call')) {
        toolCallCount++;
      }
      if (event.type === 'session_end' || event.type === 'session.ended' || event.type === 'system' && event.data?.event === 'session_end') {
        status = 'completed';
      }
    }

    const startTime = new Date(firstEvent.ts).getTime();
    const endTime = new Date(lastEvent.ts).getTime();

    return {
      traceId: firstEvent.traceId,
      sessionId: firstEvent.sessionId,
      sessionKey: firstEvent.sessionKey,
      runId: firstEvent.runId,
      workspaceDir: firstEvent.workspaceDir,
      provider: firstEvent.provider,
      modelId: firstEvent.modelId,
      modelApi: firstEvent.modelApi,
      startTime: firstEvent.ts,
      endTime: lastEvent.ts,
      durationMs: endTime - startTime,
      status,
      eventCount: events.length,
      errorCount,
      toolCallCount,
      tags: [],
      customFields: {},
    };
  }

  async readSessionMetadata(sessionDir: string): Promise<TrajectoryRecordMetadata | null> {
    const metadataPath = path.join(sessionDir, 'metadata.json');
    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content) as TrajectoryRecordMetadata;
    } catch {
      const trajectoryFile = path.join(sessionDir, 'trajectory.jsonl');
      try {
        const content = await fs.readFile(trajectoryFile, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());
        const events: TrajectoryEvent[] = [];
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as TrajectoryEvent;
            if (event.traceSchema === 'cdf-know-trajectory' || event.traceSchema === 'openclaw-trajectory') {
              events.push(event);
            }
          } catch {
            // skip invalid lines
          }
        }
        const sessionId = path.basename(sessionDir);
        return await this.extractFromEvents(events, sessionId);
      } catch {
        return null;
      }
    }
  }

  async updateSessionMetadata(sessionDir: string, updates: Partial<TrajectoryRecordMetadata>): Promise<TrajectoryRecordMetadata> {
    const existing = await this.readSessionMetadata(sessionDir) ?? {
      traceId: path.basename(sessionDir),
      sessionId: path.basename(sessionDir),
      startTime: new Date().toISOString(),
      status: 'running' as TrajectoryStatus,
      eventCount: 0,
      errorCount: 0,
      toolCallCount: 0,
    };

    const updated: TrajectoryRecordMetadata = {
      ...existing,
      ...updates,
    };

    const metadataPath = path.join(sessionDir, 'metadata.json');
    try {
      await fs.writeFile(metadataPath, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (err) {
      logger.error(`[Trajectory Metadata] Failed to update metadata: ${String(err)}`);
    }

    return updated;
  }

  async addTags(sessionDir: string, tags: string[]): Promise<TrajectoryRecordMetadata> {
    const metadata = await this.readSessionMetadata(sessionDir);
    const existingTags = metadata?.tags ?? [];
    const newTags = [...new Set([...existingTags, ...tags])];
    return this.updateSessionMetadata(sessionDir, { tags: newTags });
  }

  async removeTags(sessionDir: string, tags: string[]): Promise<TrajectoryRecordMetadata> {
    const metadata = await this.readSessionMetadata(sessionDir);
    const existingTags = metadata?.tags ?? [];
    const tagSet = new Set(tags);
    const newTags = existingTags.filter((t) => !tagSet.has(t));
    return this.updateSessionMetadata(sessionDir, { tags: newTags });
  }

  async setCustomField(sessionDir: string, key: string, value: string): Promise<TrajectoryRecordMetadata> {
    const metadata = await this.readSessionMetadata(sessionDir);
    const customFields = metadata?.customFields ?? {};
    return this.updateSessionMetadata(sessionDir, {
      customFields: { ...customFields, [key]: value },
    });
  }

  async getSessionInfo(sessionId: string): Promise<TrajectorySessionInfo | null> {
    const sessionDir = path.join(this.rootDir, sessionId);
    try {
      const dirStat = await fs.stat(sessionDir);
      if (!dirStat.isDirectory()) return null;

      const trajectoryFile = path.join(sessionDir, 'trajectory.jsonl');
      const metadata = await this.readSessionMetadata(sessionDir);

      let sizeBytes = 0;
      try {
        const fileStat = await fs.stat(trajectoryFile);
        sizeBytes = fileStat.size;
      } catch {
        // ignore
      }

      return {
        sessionId,
        directory: sessionDir,
        sizeBytes,
        modifiedAt: dirStat.mtime,
        createdAt: dirStat.birthtime,
        eventCount: metadata?.eventCount,
        status: metadata?.status,
        tags: metadata?.tags,
      };
    } catch {
      return null;
    }
  }

  async searchSessions(criteria: MetadataSearchCriteria): Promise<TrajectorySessionInfo[]> {
    const sessions = await this.listAllSessions();
    const results: TrajectorySessionInfo[] = [];

    for (const session of sessions) {
      let matches = true;

      if (criteria.sessionId && !session.sessionId.includes(criteria.sessionId)) {
        matches = false;
      }

      if (criteria.status && session.status !== criteria.status) {
        matches = false;
      }

      if (criteria.minEventCount !== undefined) {
        if (session.eventCount === undefined || session.eventCount < criteria.minEventCount) {
          matches = false;
        }
      }

      if (criteria.maxEventCount !== undefined) {
        if (session.eventCount === undefined || session.eventCount > criteria.maxEventCount) {
          matches = false;
        }
      }

      if (criteria.tags && criteria.tags.length > 0) {
        const sessionTags = new Set(session.tags ?? []);
        if (!criteria.tags.every((tag) => sessionTags.has(tag))) {
          matches = false;
        }
      }

      if (matches) {
        results.push(session);
      }
    }

    return results;
  }

  private async listAllSessions(): Promise<TrajectorySessionInfo[]> {
    const sessions: TrajectorySessionInfo[] = [];

    try {
      const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const info = await this.getSessionInfo(entry.name);
        if (info) {
          sessions.push(info);
        }
      }
    } catch (err) {
      logger.error(`[Trajectory Metadata] Failed to list sessions: ${String(err)}`);
    }

    return sessions;
  }

  async getDirectorySummary(directory?: string): Promise<TrajectoryMetadataSummary> {
    const targetDir = directory ?? this.rootDir;
    const summary: TrajectoryMetadataSummary = {
      totalSessions: 0,
      totalEvents: 0,
      totalBytes: 0,
      byStatus: {
        started: 0,
        running: 0,
        completed: 0,
        failed: 0,
        aborted: 0,
      },
      byProvider: {},
      byModel: {},
    };

    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      let oldestTime = Infinity;
      let newestTime = 0;

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const sessionDir = path.join(targetDir, entry.name);
        const sessionInfo = await this.getSessionInfo(entry.name);
        const metadata = await this.readSessionMetadata(sessionDir);

        if (sessionInfo) {
          summary.totalSessions++;
          summary.totalBytes += sessionInfo.sizeBytes;

          if (metadata) {
            summary.totalEvents += metadata.eventCount;

            if (metadata.status) {
              summary.byStatus[metadata.status] = (summary.byStatus[metadata.status] ?? 0) + 1;
            }
            if (metadata.provider) {
              summary.byProvider[metadata.provider] = (summary.byProvider[metadata.provider] ?? 0) + 1;
            }
            if (metadata.modelId) {
              summary.byModel[metadata.modelId] = (summary.byModel[metadata.modelId] ?? 0) + 1;
            }
          }

          const mtime = sessionInfo.modifiedAt.getTime();
          if (mtime < oldestTime) {
            oldestTime = mtime;
            summary.oldestSession = entry.name;
          }
          if (mtime > newestTime) {
            newestTime = mtime;
            summary.newestSession = entry.name;
          }
        }
      }
    } catch (err) {
      logger.error(`[Trajectory Metadata] Failed to get directory summary: ${String(err)}`);
    }

    return summary;
  }

  async listSessions(directory?: string): Promise<Array<{ sessionId: string; createdAt: string; eventCount: number; sizeBytes: number; status?: TrajectoryStatus }>> {
    const targetDir = directory ?? this.rootDir;
    const sessions: Array<{ sessionId: string; createdAt: string; eventCount: number; sizeBytes: number; status?: TrajectoryStatus }> = [];

    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const sessionDir = path.join(targetDir, entry.name);
        const info = await this.getSessionInfo(entry.name);
        const metadata = await this.readSessionMetadata(sessionDir);

        if (info) {
          sessions.push({
            sessionId: entry.name,
            createdAt: info.createdAt.toISOString(),
            eventCount: info.eventCount ?? metadata?.eventCount ?? 0,
            sizeBytes: info.sizeBytes,
            status: info.status,
          });
        }
      }

      sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (err) {
      logger.error(`[Trajectory Metadata] Failed to list sessions: ${String(err)}`);
    }

    return sessions;
  }

  async getFullRecord(sessionId: string): Promise<TrajectoryRecord | null> {
    const sessionDir = path.join(this.rootDir, sessionId);
    const trajectoryFile = path.join(sessionDir, 'trajectory.jsonl');

    try {
      const info = await this.getSessionInfo(sessionId);
      if (!info) return null;

      const metadata = await this.readSessionMetadata(sessionDir);
      if (!metadata) return null;

      const events: TrajectoryEvent[] = [];
      try {
        const content = await fs.readFile(trajectoryFile, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as TrajectoryEvent;
            events.push(event);
          } catch {
            // skip
          }
        }
      } catch {
        // ignore
      }

      const dirStat = await fs.stat(sessionDir);

      return {
        metadata,
        events,
        filePath: trajectoryFile,
        sizeBytes: info.sizeBytes,
        createdAt: dirStat.birthtime.toISOString(),
        updatedAt: dirStat.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }
}

export function createTrajectoryMetadataManager(rootDir: string): TrajectoryMetadataManager {
  return new TrajectoryMetadataManager(rootDir);
}
