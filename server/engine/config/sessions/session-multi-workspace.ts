import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { SessionStore } from './store.js';
import type { SessionMetadata, SessionStoreConfig } from './types.js';

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  baseDir: string;
  archivedDir: string;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
  metadata: Record<string, unknown>;
}

export interface WorkspaceConfig {
  workspaces: Workspace[];
  defaultWorkspaceId: string;
}

export interface MultiWorkspaceOptions {
  configPath?: string;
}

export class SessionMultiWorkspace {
  private workspaces: Map<string, Workspace>;
  private stores: Map<string, SessionStore>;
  private configPath: string;
  private defaultWorkspaceId: string;

  constructor(options: MultiWorkspaceOptions = {}) {
    this.configPath = options.configPath || '.workspaces.json';
    this.workspaces = new Map<string, Workspace>();
    this.stores = new Map<string, SessionStore>();
    this.defaultWorkspaceId = '';
    this.loadConfig();
  }

  addWorkspace(workspace: Omit<Workspace, 'createdAt' | 'updatedAt'>): Workspace {
    if (this.workspaces.has(workspace.id)) {
      throw new Error(`工作空间已存在: ${workspace.id}`);
    }

    const now = new Date().toISOString();
    const newWorkspace: Workspace = {
      ...workspace,
      createdAt: now,
      updatedAt: now,
    };

    this.workspaces.set(workspace.id, newWorkspace);

    if (newWorkspace.isDefault) {
      this.defaultWorkspaceId = workspace.id;
      for (const [id, ws] of this.workspaces) {
        if (id !== workspace.id) {
          ws.isDefault = false;
        }
      }
    }

    this.saveConfig();

    logger.info(`[SessionMultiWorkspace] 添加工作空间: ${workspace.id}`);
    return newWorkspace;
  }

  removeWorkspace(workspaceId: string): boolean {
    if (!this.workspaces.has(workspaceId)) {
      return false;
    }

    const workspace = this.workspaces.get(workspaceId)!;
    if (workspace.isDefault) {
      throw new Error('不能删除默认工作空间');
    }

    const store = this.stores.get(workspaceId);
    if (store) {
      store.clearCache();
      this.stores.delete(workspaceId);
    }

    this.workspaces.delete(workspaceId);
    this.saveConfig();

    logger.info(`[SessionMultiWorkspace] 删除工作空间: ${workspaceId}`);
    return true;
  }

  getWorkspace(workspaceId: string): Workspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  getDefaultWorkspace(): Workspace | undefined {
    return this.workspaces.get(this.defaultWorkspaceId);
  }

  getAllWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values());
  }

  setDefaultWorkspace(workspaceId: string): boolean {
    if (!this.workspaces.has(workspaceId)) {
      return false;
    }

    for (const [id, ws] of this.workspaces) {
      ws.isDefault = id === workspaceId;
      ws.updatedAt = new Date().toISOString();
    }

    this.defaultWorkspaceId = workspaceId;
    this.saveConfig();

    logger.info(`[SessionMultiWorkspace] 设置默认工作空间: ${workspaceId}`);
    return true;
  }

  getSessionStore(workspaceId: string): SessionStore {
    let store = this.stores.get(workspaceId);

    if (!store) {
      const workspace = this.workspaces.get(workspaceId);
      if (!workspace) {
        throw new Error(`工作空间不存在: ${workspaceId}`);
      }

      const config: SessionStoreConfig = {
        baseDir: workspace.baseDir,
        archivedDir: workspace.archivedDir,
        cacheMaxSize: 100,
        cacheTTLMs: 5 * 60 * 1000,
        enableFileLocking: true,
        atomicWrites: true,
        diskBudget: {
          maxTotalBytes: 5 * 1024 * 1024 * 1024,
          maxSessionSizeBytes: 50 * 1024 * 1024,
          warningThresholdPercent: 80,
          cleanupStrategy: 'oldest_first',
        },
        enableAutoMaintenance: true,
        maintenanceIntervalMs: 24 * 60 * 60 * 1000,
      };

      store = new SessionStore(config);
      store.init().catch(err => {
        logger.error('[SessionMultiWorkspace] 初始化会话存储失败:', workspaceId, err);
      });

      this.stores.set(workspaceId, store);
    }

    return store;
  }

  listAllSessions(): SessionMetadata[] {
    const allSessions: SessionMetadata[] = [];

    for (const [id, workspace] of this.workspaces) {
      try {
        const store = this.getSessionStore(id);
        const sessions = store.listSessions().sessions;
        for (const session of sessions) {
          allSessions.push({
            ...session,
            extra: { ...session.extra, workspaceId: id, workspaceName: workspace.name },
          });
        }
      } catch {
        // ignore
      }
    }

    return allSessions.sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  listSessionsByWorkspace(workspaceId: string): SessionMetadata[] {
    const store = this.getSessionStore(workspaceId);
    return store.listSessions().sessions;
  }

  createSessionInWorkspace(workspaceId: string, metadata: Partial<SessionMetadata>): SessionMetadata {
    const store = this.getSessionStore(workspaceId);
    return store.createSession(metadata);
  }

  getSessionInWorkspace(workspaceId: string, sessionId: string): SessionMetadata | null {
    const store = this.getSessionStore(workspaceId);
    return store.getMetadata(sessionId);
  }

  deleteSessionFromWorkspace(workspaceId: string, sessionId: string, permanent: boolean = false): boolean {
    const store = this.getSessionStore(workspaceId);
    store.deleteSession(sessionId, permanent);
    return true;
  }

  closeAllStores(): void {
    for (const [id, store] of this.stores) {
      store.clearCache();
      logger.debug(`[SessionMultiWorkspace] 关闭存储: ${id}`);
    }
    this.stores.clear();
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        const config: WorkspaceConfig = JSON.parse(content);

        for (const workspace of config.workspaces) {
          this.workspaces.set(workspace.id, workspace);
        }

        this.defaultWorkspaceId = config.defaultWorkspaceId;
      } else {
        this.createDefaultWorkspace();
      }
    } catch (err) {
      logger.warn('[SessionMultiWorkspace] 加载配置失败:', err);
      this.createDefaultWorkspace();
    }
  }

  private createDefaultWorkspace(): void {
    const defaultWorkspace: Workspace = {
      id: 'default',
      name: '默认工作空间',
      description: '默认会话存储',
      baseDir: path.join(process.cwd(), 'data', 'sessions'),
      archivedDir: path.join(process.cwd(), 'data', 'sessions-archived'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDefault: true,
      metadata: {},
    };

    this.workspaces.set('default', defaultWorkspace);
    this.defaultWorkspaceId = 'default';
    this.saveConfig();

    logger.info('[SessionMultiWorkspace] 创建默认工作空间');
  }

  private saveConfig(): void {
    try {
      const config: WorkspaceConfig = {
        workspaces: Array.from(this.workspaces.values()),
        defaultWorkspaceId: this.defaultWorkspaceId,
      };

      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (err) {
      logger.warn('[SessionMultiWorkspace] 保存配置失败:', err);
    }
  }
}