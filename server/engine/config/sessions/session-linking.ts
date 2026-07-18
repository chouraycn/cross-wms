import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { SessionStore } from './store.js';
import type { SessionMetadata } from './types.js';

export interface SessionLink {
  id: string;
  sourceSessionId: string;
  targetSessionId: string;
  type: 'parent' | 'child' | 'related' | 'duplicate';
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface LinkOptions {
  type?: SessionLink['type'];
  metadata?: Record<string, unknown>;
}

export interface LinkResult {
  success: boolean;
  link?: SessionLink;
  error?: string;
}

export class SessionLinking {
  private store: SessionStore;
  private linksPath: string;
  private links: Map<string, SessionLink[]>;

  constructor(store: SessionStore) {
    this.store = store;
    const paths = store.getPaths();
    this.linksPath = path.join(paths.baseDir, '.links.json');
    this.links = this.loadLinks();
  }

  link(sourceSessionId: string, targetSessionId: string, options: LinkOptions = {}): LinkResult {
    if (sourceSessionId === targetSessionId) {
      return { success: false, error: '不能链接到自身' };
    }

    const source = this.store.getMetadata(sourceSessionId);
    const target = this.store.getMetadata(targetSessionId);

    if (!source || !target) {
      return { success: false, error: '会话不存在' };
    }

    const link: SessionLink = {
      id: `${sourceSessionId}_${targetSessionId}`,
      sourceSessionId,
      targetSessionId,
      type: options.type || 'related',
      createdAt: new Date().toISOString(),
      metadata: options.metadata || {},
    };

    const existingLinks = this.links.get(sourceSessionId) || [];
    if (existingLinks.some(l => l.targetSessionId === targetSessionId)) {
      return { success: false, error: '链接已存在' };
    }

    existingLinks.push(link);
    this.links.set(sourceSessionId, existingLinks);

    const targetLinks = this.links.get(targetSessionId) || [];
    targetLinks.push({
      ...link,
      id: `${targetSessionId}_${sourceSessionId}`,
      sourceSessionId: targetSessionId,
      targetSessionId: sourceSessionId,
      type: options.type === 'parent' ? 'child' : options.type === 'child' ? 'parent' : options.type || 'related',
    });
    this.links.set(targetSessionId, targetLinks);

    this.saveLinks();

    logger.info(`[SessionLinking] 创建链接: ${sourceSessionId} -> ${targetSessionId} (${link.type})`);
    return { success: true, link };
  }

  unlink(sessionId1: string, sessionId2: string): boolean {
    const links1 = this.links.get(sessionId1) || [];
    const links2 = this.links.get(sessionId2) || [];

    const index1 = links1.findIndex(l => l.targetSessionId === sessionId2);
    const index2 = links2.findIndex(l => l.targetSessionId === sessionId1);

    if (index1 >= 0) {
      links1.splice(index1, 1);
      this.links.set(sessionId1, links1);
    }

    if (index2 >= 0) {
      links2.splice(index2, 1);
      this.links.set(sessionId2, links2);
    }

    if (index1 >= 0 || index2 >= 0) {
      this.saveLinks();
      logger.info(`[SessionLinking] 删除链接: ${sessionId1} <-> ${sessionId2}`);
      return true;
    }

    return false;
  }

  getLinks(sessionId: string): SessionLink[] {
    return this.links.get(sessionId) || [];
  }

  getLinkedSessions(sessionId: string, type?: SessionLink['type']): SessionMetadata[] {
    const links = this.links.get(sessionId) || [];
    const filtered = type ? links.filter(l => l.type === type) : links;

    const result: SessionMetadata[] = [];
    for (const link of filtered) {
      const metadata = this.store.getMetadata(link.targetSessionId);
      if (metadata) {
        result.push(metadata);
      }
    }

    return result;
  }

  getParentSessions(sessionId: string): SessionMetadata[] {
    return this.getLinkedSessions(sessionId, 'parent');
  }

  getChildSessions(sessionId: string): SessionMetadata[] {
    return this.getLinkedSessions(sessionId, 'child');
  }

  getRelatedSessions(sessionId: string): SessionMetadata[] {
    return this.getLinkedSessions(sessionId, 'related');
  }

  createParentChildLink(parentId: string, childId: string): LinkResult {
    return this.link(parentId, childId, { type: 'parent' });
  }

  createRelatedLink(sessionId1: string, sessionId2: string): LinkResult {
    return this.link(sessionId1, sessionId2, { type: 'related' });
  }

  removeAllLinks(sessionId: string): void {
    const links = this.links.get(sessionId) || [];

    for (const link of links) {
      const targetLinks = this.links.get(link.targetSessionId) || [];
      const index = targetLinks.findIndex(l => l.targetSessionId === sessionId);
      if (index >= 0) {
        targetLinks.splice(index, 1);
        this.links.set(link.targetSessionId, targetLinks);
      }
    }

    this.links.delete(sessionId);
    this.saveLinks();

    logger.info(`[SessionLinking] 删除所有链接: ${sessionId}`);
  }

  getLinkGraph(sessionId: string, depth: number = 2): Map<string, SessionLink[]> {
    const graph = new Map<string, SessionLink[]>();
    const visited = new Set<string>();

    this.buildGraph(sessionId, depth, visited, graph);

    return graph;
  }

  private buildGraph(
    sessionId: string,
    depth: number,
    visited: Set<string>,
    graph: Map<string, SessionLink[]>
  ): void {
    if (depth <= 0 || visited.has(sessionId)) return;

    visited.add(sessionId);
    const links = this.getLinks(sessionId);
    graph.set(sessionId, links);

    for (const link of links) {
      this.buildGraph(link.targetSessionId, depth - 1, visited, graph);
    }
  }

  private loadLinks(): Map<string, SessionLink[]> {
    const map = new Map<string, SessionLink[]>();

    try {
      if (fs.existsSync(this.linksPath)) {
        const content = fs.readFileSync(this.linksPath, 'utf-8');
        const links: SessionLink[] = JSON.parse(content);

        for (const link of links) {
          const existing = map.get(link.sourceSessionId) || [];
          existing.push(link);
          map.set(link.sourceSessionId, existing);
        }
      }
    } catch (err) {
      logger.warn('[SessionLinking] 加载链接失败:', err);
    }

    return map;
  }

  private saveLinks(): void {
    try {
      const links: SessionLink[] = [];
      for (const [, linkList] of this.links) {
        links.push(...linkList);
      }

      const dir = path.dirname(this.linksPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.linksPath, JSON.stringify(links, null, 2), 'utf-8');
    } catch (err) {
      logger.warn('[SessionLinking] 保存链接失败:', err);
    }
  }
}