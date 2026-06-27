/**
 * Workspace Manager
 * 工作区管理系统 - 多项目工作区管理
 */

export type WorkspaceStatus = "active" | "inactive" | "loading" | "error" | "archived";

export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  description?: string;
  status: WorkspaceStatus;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  icon?: string;
  color?: string;
  tags: string[];
  projectType?: string;
  language?: string;
  git?: {
    remote?: string;
    branch?: string;
    hasChanges: boolean;
  };
  settings: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  stats?: {
    files?: number;
    sizeBytes?: number;
    lastModified?: number;
  };
}

export interface WorkspaceConfig {
  name: string;
  path: string;
  description?: string;
  icon?: string;
  color?: string;
  tags?: string[];
  settings?: Record<string, unknown>;
}

export interface WorkspaceFile {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: number;
  createdAt?: number;
  extension?: string;
  children?: WorkspaceFile[];
}

export interface WorkspaceSearchResult {
  matches: Array<{
    filePath: string;
    line: number;
    column: number;
    text: string;
    matchLength: number;
  }>;
  totalMatches: number;
  totalFiles: number;
  durationMs: number;
}

class WorkspaceManager {
  private readonly workspaces = new Map<string, WorkspaceInfo>();
  private activeWorkspaceId: string | null = null;
  private readonly recentWorkspaces: string[] = [];
  private maxRecentWorkspaces = 10;

  constructor() {
    // 初始化默认工作区
    this.initializeDefaultWorkspace();
  }

  private initializeDefaultWorkspace(): void {
    const defaultWorkspace: WorkspaceInfo = {
      id: "default",
      name: "Default Workspace",
      path: process.cwd(),
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastOpenedAt: Date.now(),
      tags: ["default"],
      settings: {
        theme: "system",
        language: "zh-CN",
        autoSave: true,
        formatOnSave: false,
      },
    };

    this.workspaces.set("default", defaultWorkspace);
    this.activeWorkspaceId = "default";
    this.addToRecent("default");
  }

  // ========== Workspace CRUD ==========

  create(config: WorkspaceConfig): WorkspaceInfo {
    const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const workspace: WorkspaceInfo = {
      id,
      name: config.name,
      path: config.path,
      description: config.description,
      status: "inactive",
      createdAt: now,
      updatedAt: now,
      icon: config.icon,
      color: config.color,
      tags: config.tags ?? [],
      settings: config.settings ?? {},
    };

    this.workspaces.set(id, workspace);
    return workspace;
  }

  delete(workspaceId: string): boolean {
    if (workspaceId === "default") {
      return false;
    }

    if (this.activeWorkspaceId === workspaceId) {
      this.activeWorkspaceId = "default";
    }

    this.removeFromRecent(workspaceId);
    return this.workspaces.delete(workspaceId);
  }

  update(workspaceId: string, updates: Partial<WorkspaceInfo>): WorkspaceInfo | undefined {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return undefined;

    Object.assign(workspace, updates);
    workspace.updatedAt = Date.now();
    this.workspaces.set(workspaceId, workspace);

    return workspace;
  }

  get(workspaceId: string): WorkspaceInfo | undefined {
    return this.workspaces.get(workspaceId);
  }

  list(status?: WorkspaceStatus): WorkspaceInfo[] {
    let workspaces = Array.from(this.workspaces.values());
    if (status) {
      workspaces = workspaces.filter((w) => w.status === status);
    }
    return workspaces.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ========== Active Workspace ==========

  getActive(): WorkspaceInfo | undefined {
    return this.activeWorkspaceId ? this.workspaces.get(this.activeWorkspaceId) : undefined;
  }

  async switchTo(workspaceId: string): Promise<WorkspaceInfo> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // 停用当前工作区
    if (this.activeWorkspaceId) {
      const current = this.workspaces.get(this.activeWorkspaceId);
      if (current) {
        current.status = "inactive";
        current.updatedAt = Date.now();
        this.workspaces.set(this.activeWorkspaceId, current);
      }
    }

    // 激活新工作区
    workspace.status = "loading";
    workspace.updatedAt = Date.now();
    this.workspaces.set(workspaceId, workspace);

    try {
      await this.simulateWorkspaceLoad(workspace);
      workspace.status = "active";
      workspace.lastOpenedAt = Date.now();
      workspace.updatedAt = Date.now();
      this.activeWorkspaceId = workspaceId;
      this.addToRecent(workspaceId);
    } catch (error) {
      workspace.status = "error";
      workspace.updatedAt = Date.now();
      this.workspaces.set(workspaceId, workspace);
      throw error;
    }

    this.workspaces.set(workspaceId, workspace);
    return workspace;
  }

  private async simulateWorkspaceLoad(workspace: WorkspaceInfo): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 模拟加载工作区信息
    workspace.stats = {
      files: Math.floor(Math.random() * 5000) + 100,
      sizeBytes: Math.floor(Math.random() * 500 * 1024 * 1024),
      lastModified: Date.now(),
    };
  }

  // ========== Recent Workspaces ==========

  getRecent(): WorkspaceInfo[] {
    return this.recentWorkspaces
      .map((id) => this.workspaces.get(id))
      .filter((w): w is WorkspaceInfo => w !== undefined);
  }

  private addToRecent(workspaceId: string): void {
    const index = this.recentWorkspaces.indexOf(workspaceId);
    if (index >= 0) {
      this.recentWorkspaces.splice(index, 1);
    }
    this.recentWorkspaces.unshift(workspaceId);

    if (this.recentWorkspaces.length > this.maxRecentWorkspaces) {
      this.recentWorkspaces.length = this.maxRecentWorkspaces;
    }
  }

  private removeFromRecent(workspaceId: string): void {
    const index = this.recentWorkspaces.indexOf(workspaceId);
    if (index >= 0) {
      this.recentWorkspaces.splice(index, 1);
    }
  }

  // ========== File System Operations ==========

  listFiles(workspaceId: string, directoryPath = "/"): WorkspaceFile[] {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return [];

    // 模拟文件列表
    const files: WorkspaceFile[] = [
      { path: `${directoryPath}/src`, name: "src", isDirectory: true, modifiedAt: Date.now() },
      { path: `${directoryPath}/package.json`, name: "package.json", isDirectory: false, size: 2048, modifiedAt: Date.now() },
      { path: `${directoryPath}/README.md`, name: "README.md", isDirectory: false, size: 5120, modifiedAt: Date.now() },
      { path: `${directoryPath}/tsconfig.json`, name: "tsconfig.json", isDirectory: false, size: 1024, modifiedAt: Date.now() },
    ];

    return files;
  }

  async searchInWorkspace(
    workspaceId: string,
    query: string,
    options?: {
      filePattern?: string;
      maxResults?: number;
      caseSensitive?: boolean;
      regex?: boolean;
    },
  ): Promise<WorkspaceSearchResult> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return { matches: [], totalMatches: 0, totalFiles: 0, durationMs: 0 };
    }

    const startTime = Date.now();
    const maxResults = options?.maxResults ?? 100;

    // 模拟搜索结果
    const matches: WorkspaceSearchResult["matches"] = [];
    const fileCount = Math.floor(Math.random() * 10) + 1;

    for (let i = 0; i < Math.min(fileCount, maxResults); i++) {
      matches.push({
        filePath: `/src/file_${i}.ts`,
        line: Math.floor(Math.random() * 100) + 1,
        column: Math.floor(Math.random() * 50) + 1,
        text: `Example line containing ${query}`,
        matchLength: query.length,
      });
    }

    return {
      matches: matches.slice(0, maxResults),
      totalMatches: matches.length,
      totalFiles: fileCount,
      durationMs: Date.now() - startTime,
    };
  }

  // ========== Settings ==========

  getSetting(workspaceId: string, key: string): unknown {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return undefined;
    return workspace.settings[key];
  }

  setSetting(workspaceId: string, key: string, value: unknown): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;

    workspace.settings[key] = value;
    workspace.updatedAt = Date.now();
    this.workspaces.set(workspaceId, workspace);
    return true;
  }

  getSettings(workspaceId: string): Record<string, unknown> {
    const workspace = this.workspaces.get(workspaceId);
    return workspace?.settings ?? {};
  }

  // ========== Git Integration ==========

  getGitInfo(workspaceId: string): WorkspaceInfo["git"] | undefined {
    const workspace = this.workspaces.get(workspaceId);
    return workspace?.git;
  }

  updateGitInfo(workspaceId: string, git: Partial<WorkspaceInfo["git"]>): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;

    workspace.git = {
      ...workspace.git,
      hasChanges: workspace.git?.hasChanges ?? false,
      ...git,
    };
    workspace.updatedAt = Date.now();
    this.workspaces.set(workspaceId, workspace);
    return true;
  }

  // ========== Stats ==========

  getStats(): {
    totalWorkspaces: number;
    activeWorkspaces: number;
    archivedWorkspaces: number;
    recentWorkspaces: number;
    activeWorkspaceId?: string;
  } {
    const workspaces = Array.from(this.workspaces.values());

    return {
      totalWorkspaces: workspaces.length,
      activeWorkspaces: workspaces.filter((w) => w.status === "active").length,
      archivedWorkspaces: workspaces.filter((w) => w.status === "archived").length,
      recentWorkspaces: this.recentWorkspaces.length,
      activeWorkspaceId: this.activeWorkspaceId ?? undefined,
    };
  }

  clear(): void {
    this.workspaces.clear();
    this.activeWorkspaceId = null;
    this.recentWorkspaces.length = 0;
    this.initializeDefaultWorkspace();
  }
}

const WORKSPACE_INSTANCE = new WorkspaceManager();

export function getWorkspaceManager(): WorkspaceManager {
  return WORKSPACE_INSTANCE;
}

export function createWorkspace(config: WorkspaceConfig): WorkspaceInfo {
  return WORKSPACE_INSTANCE.create(config);
}

export function getActiveWorkspace(): WorkspaceInfo | undefined {
  return WORKSPACE_INSTANCE.getActive();
}

export function switchWorkspace(workspaceId: string): Promise<WorkspaceInfo> {
  return WORKSPACE_INSTANCE.switchTo(workspaceId);
}

export function resetWorkspaceManagerForTests(): void {
  WORKSPACE_INSTANCE.clear();
}

export type { WorkspaceManager };
