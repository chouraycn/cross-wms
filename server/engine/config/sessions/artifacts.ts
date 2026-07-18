import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../logger.js';
import { SessionStore } from './store.js';
import type { SessionArtifact } from './types.js';
import { SessionArtifactSchema } from './types.js';

export class SessionArtifactsManager {
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  getArtifacts(sessionId: string): SessionArtifact[] {
    const sessionData = this.store.getSession(sessionId);
    return sessionData?.artifacts || [];
  }

  getArtifact(sessionId: string, artifactId: string): SessionArtifact | null {
    const artifacts = this.getArtifacts(sessionId);
    return artifacts.find(a => a.id === artifactId) || null;
  }

  async addArtifact(
    sessionId: string,
    artifact: Partial<SessionArtifact> & { name: string; type: string }
  ): Promise<SessionArtifact | null> {
    const artifacts = this.getArtifacts(sessionId);

    const newArtifact: SessionArtifact = SessionArtifactSchema.parse({
      ...artifact,
      id: artifact.id || uuidv4(),
      createdAt: artifact.createdAt || new Date().toISOString(),
      size: artifact.size || 0,
      metadata: artifact.metadata || {},
    });

    artifacts.push(newArtifact);
    const updated = await this.updateArtifacts(sessionId, artifacts);
    return updated ? newArtifact : null;
  }

  async removeArtifact(sessionId: string, artifactId: string): Promise<boolean> {
    const artifacts = this.getArtifacts(sessionId);
    const filtered = artifacts.filter(a => a.id !== artifactId);

    if (filtered.length === artifacts.length) return false;

    const updated = await this.updateArtifacts(sessionId, filtered);
    return updated !== null;
  }

  async updateArtifacts(
    sessionId: string,
    artifacts: SessionArtifact[]
  ): Promise<SessionArtifact[] | null> {
    const sessionData = this.store.getSession(sessionId);
    if (!sessionData) return null;

    const writer = this.store.getWriter();
    const firstLine = JSON.stringify({
      session: sessionData.metadata,
      messages: [],
      ...sessionData,
      artifacts,
    });

    const result = await writer.rewriteFirstLine(sessionId, firstLine);
    if (result.success) {
      this.store.getCache().invalidateSessionData(sessionId);
      return artifacts;
    }

    return null;
  }

  async updateArtifact(
    sessionId: string,
    artifactId: string,
    updates: Partial<SessionArtifact>
  ): Promise<SessionArtifact | null> {
    const artifacts = this.getArtifacts(sessionId);
    const index = artifacts.findIndex(a => a.id === artifactId);

    if (index < 0) return null;

    artifacts[index] = SessionArtifactSchema.parse({
      ...artifacts[index],
      ...updates,
    });

    const updated = await this.updateArtifacts(sessionId, artifacts);
    return updated ? artifacts[index] : null;
  }

  async clearArtifacts(sessionId: string): Promise<boolean> {
    const updated = await this.updateArtifacts(sessionId, []);
    return updated !== null;
  }

  getArtifactsByType(sessionId: string, type: string): SessionArtifact[] {
    const artifacts = this.getArtifacts(sessionId);
    return artifacts.filter(a => a.type === type);
  }

  getArtifactCount(sessionId: string): number {
    return this.getArtifacts(sessionId).length;
  }

  getTotalSize(sessionId: string): number {
    const artifacts = this.getArtifacts(sessionId);
    return artifacts.reduce((sum, a) => sum + a.size, 0);
  }

  async addFileArtifact(
    sessionId: string,
    filePath: string,
    options: { name?: string; type?: string; mimeType?: string } = {}
  ): Promise<SessionArtifact | null> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const stats = fs.statSync(filePath);

      return this.addArtifact(sessionId, {
        name: options.name || path.basename(filePath),
        type: options.type || 'file',
        path: filePath,
        size: stats.size,
        mimeType: options.mimeType,
      });
    } catch (err) {
      logger.error('[SessionArtifacts] 添加文件产物失败:', sessionId, err);
      return null;
    }
  }
}
