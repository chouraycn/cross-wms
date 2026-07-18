import { logger } from '../../logger.js';

export interface WorkspaceFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number;
  createdAt: number;
  language?: string;
  isDirectory: boolean;
  relevance?: number;
  tags?: string[];
}

export interface WorkspaceContextConfig {
  maxFiles: number;
  maxTotalSize: number;
  supportedExtensions: string[];
  excludedDirectories: string[];
  excludedPatterns: string[];
  relevanceDecayTimeMs: number;
  maxFileSizeBytes: number;
  autoRefresh: boolean;
  refreshIntervalMs: number;
}

export interface WorkspaceContextStats {
  totalFiles: number;
  totalSize: number;
  byExtension: Record<string, number>;
  byDirectory: Record<string, number>;
  lastRefreshedAt?: number;
  trackedFiles: number;
}

export interface FileSearchOptions {
  query?: string;
  extension?: string | string[];
  directory?: string;
  maxResults?: number;
  minSize?: number;
  maxSize?: number;
  modifiedAfter?: number;
  modifiedBefore?: number;
  sortBy?: 'name' | 'size' | 'modified' | 'relevance';
  sortOrder?: 'asc' | 'desc';
}

const DEFAULT_CONFIG: Required<WorkspaceContextConfig> = {
  maxFiles: 10000,
  maxTotalSize: 500 * 1024 * 1024,
  supportedExtensions: [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h',
    '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.md', '.txt', '.json',
    '.yaml', '.yml', '.toml', '.xml', '.html', '.css', '.scss', '.sql',
  ],
  excludedDirectories: [
    'node_modules', '.git', 'dist', 'build', 'coverage', '.next',
    '__pycache__', '.venv', 'venv', '.idea', '.vscode',
  ],
  excludedPatterns: [
    '*.min.js', '*.min.css', '*.map', '*.lock',
  ],
  relevanceDecayTimeMs: 24 * 60 * 60 * 1000,
  maxFileSizeBytes: 10 * 1024 * 1024,
  autoRefresh: false,
  refreshIntervalMs: 5 * 60 * 1000,
};

export class WorkspaceContext {
  private config: Required<WorkspaceContextConfig>;
  private files: Map<string, WorkspaceFile> = new Map();
  private lastRefreshedAt?: number;
  private workspacePath: string = '';

  constructor(config: Partial<WorkspaceContextConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.debug('[WorkspaceContext] 工作区上下文初始化完成');
  }

  setWorkspacePath(path: string): void {
    this.workspacePath = path;
    logger.debug(`[WorkspaceContext] 工作区路径设置为: ${path}`);
  }

  getWorkspacePath(): string {
    return this.workspacePath;
  }

  addFile(file: Omit<WorkspaceFile, 'relevance'> & { relevance?: number }): boolean {
    if (this.files.size >= this.config.maxFiles) {
      logger.warn('[WorkspaceContext] 已达到最大文件数限制，无法添加更多文件');
      return false;
    }

    if (file.size > this.config.maxFileSizeBytes) {
      logger.debug(`[WorkspaceContext] 文件过大，跳过: ${file.path}`);
      return false;
    }

    const fullFile: WorkspaceFile = {
      ...file,
      relevance: file.relevance ?? 0.5,
    };

    this.files.set(file.path, fullFile);
    return true;
  }

  removeFile(path: string): boolean {
    return this.files.delete(path);
  }

  getFile(path: string): WorkspaceFile | null {
    const file = this.files.get(path);
    if (file) {
      file.relevance = Math.min(1, (file.relevance ?? 0) + 0.1);
      return { ...file };
    }
    return null;
  }

  updateFile(path: string, updates: Partial<WorkspaceFile>): WorkspaceFile | null {
    const file = this.files.get(path);
    if (!file) return null;

    Object.assign(file, updates);
    file.modifiedAt = Date.now();

    return { ...file };
  }

  search(options: FileSearchOptions = {}): WorkspaceFile[] {
    const {
      query,
      extension,
      directory,
      maxResults = 50,
      minSize,
      maxSize,
      modifiedAfter,
      modifiedBefore,
      sortBy = 'relevance',
      sortOrder = 'desc',
    } = options;

    const extensions = extension
      ? Array.isArray(extension)
        ? new Set(extension.map(e => e.toLowerCase()))
        : new Set([extension.toLowerCase()])
      : null;

    const queryLower = query?.toLowerCase();
    const queryKeywords = queryLower
      ? new Set(queryLower.split(/[\\/.\s_-]+/).filter(w => w.length > 1))
      : null;

    let results = Array.from(this.files.values());

    if (extensions) {
      results = results.filter(f => extensions.has(f.extension.toLowerCase()));
    }

    if (directory) {
      results = results.filter(f => f.path.startsWith(directory));
    }

    if (minSize !== undefined) {
      results = results.filter(f => f.size >= minSize);
    }

    if (maxSize !== undefined) {
      results = results.filter(f => f.size <= maxSize);
    }

    if (modifiedAfter !== undefined) {
      results = results.filter(f => f.modifiedAt >= modifiedAfter);
    }

    if (modifiedBefore !== undefined) {
      results = results.filter(f => f.modifiedAt <= modifiedBefore);
    }

    if (queryKeywords && queryKeywords.size > 0) {
      results = results.map(f => {
        const pathLower = f.path.toLowerCase();
        const nameLower = f.name.toLowerCase();
        let score = 0;

        if (nameLower.includes(queryLower!)) {
          score += 0.5;
        }
        if (pathLower.includes(queryLower!)) {
          score += 0.3;
        }

        let matchedKeywords = 0;
        for (const keyword of queryKeywords!) {
          if (nameLower.includes(keyword) || pathLower.includes(keyword)) {
            matchedKeywords++;
          }
        }
        score += (matchedKeywords / queryKeywords!.size) * 0.2;

        return { ...f, relevance: score + (f.relevance ?? 0) * 0.5 };
      });
    }

    results.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'modified':
          comparison = a.modifiedAt - b.modifiedAt;
          break;
        case 'relevance':
        default:
          comparison = (a.relevance ?? 0) - (b.relevance ?? 0);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return results.slice(0, maxResults).map(f => ({ ...f }));
  }

  getFilesByExtension(extension: string): WorkspaceFile[] {
    return this.search({ extension });
  }

  getFilesByDirectory(directory: string): WorkspaceFile[] {
    return this.search({ directory });
  }

  getRecentlyModified(limit: number = 20): WorkspaceFile[] {
    return this.search({ sortBy: 'modified', sortOrder: 'desc', maxResults: limit });
  }

  getMostRelevant(limit: number = 20): WorkspaceFile[] {
    return this.search({ sortBy: 'relevance', sortOrder: 'desc', maxResults: limit });
  }

  clear(): number {
    const count = this.files.size;
    this.files.clear();
    logger.debug(`[WorkspaceContext] 清空工作区文件，共 ${count} 个`);
    return count;
  }

  getStats(): WorkspaceContextStats {
    const byExtension: Record<string, number> = {};
    const byDirectory: Record<string, number> = {};
    let totalSize = 0;

    for (const file of this.files.values()) {
      totalSize += file.size;

      const ext = file.extension.toLowerCase() || 'none';
      byExtension[ext] = (byExtension[ext] || 0) + 1;

      const parts = file.path.split('/');
      if (parts.length > 1) {
        const dir = parts.slice(0, -1).join('/') || '/';
        byDirectory[dir] = (byDirectory[dir] || 0) + 1;
      }
    }

    return {
      totalFiles: this.files.size,
      totalSize,
      byExtension,
      byDirectory,
      lastRefreshedAt: this.lastRefreshedAt,
      trackedFiles: this.files.size,
    };
  }

  incrementRelevance(path: string, amount: number = 0.1): void {
    const file = this.files.get(path);
    if (file) {
      file.relevance = Math.min(1, (file.relevance ?? 0) + amount);
    }
  }

  decrementRelevance(path: string, amount: number = 0.05): void {
    const file = this.files.get(path);
    if (file) {
      file.relevance = Math.max(0, (file.relevance ?? 0) - amount);
    }
  }

  decayRelevance(): void {
    const now = Date.now();
    for (const file of this.files.values()) {
      const ageMs = now - file.modifiedAt;
      const decayFactor = Math.pow(
        0.5,
        ageMs / this.config.relevanceDecayTimeMs
      );
      file.relevance = (file.relevance ?? 0) * decayFactor;
    }
    logger.debug('[WorkspaceContext] 文件相关性已衰减');
  }

  getAllFiles(): WorkspaceFile[] {
    return Array.from(this.files.values()).map(f => ({ ...f }));
  }

  getFileCount(): number {
    return this.files.size;
  }

  isSupportedExtension(extension: string): boolean {
    const ext = extension.toLowerCase();
    return this.config.supportedExtensions.some(e => e.toLowerCase() === ext);
  }

  isExcludedPath(path: string): boolean {
    const parts = path.split('/');
    for (const dir of this.config.excludedDirectories) {
      if (parts.includes(dir)) return true;
    }

    const fileName = parts[parts.length - 1];
    for (const pattern of this.config.excludedPatterns) {
      if (this.matchesPattern(fileName, pattern)) {
        return true;
      }
    }

    return false;
  }

  private matchesPattern(filename: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(filename);
  }
}
