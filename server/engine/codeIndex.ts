/**
 * Code Index Engine — 代码索引引擎
 *
 * 提供项目代码索引功能：
 * - 扫描项目源代码目录
 * - 提取符号定义（函数、类、变量、接口等）
 * - 计算符号位置
 * - 存储到 SQLite 数据库
 * - 支持符号搜索和查询
 */

import { logger } from '../logger.js';
import { readFile, readdir, stat, writeFile } from 'fs/promises';
import { join, relative, extname, basename, dirname } from 'path';
import { initDb } from '../db.js';
import type Database from 'better-sqlite3';

// ===================== 符号类型 =====================

/**
 * 符号类型
 */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'variable'
  | 'constant'
  | 'enum'
  | 'enum_member'
  | 'method'
  | 'property'
  | 'namespace'
  | 'module'
  | 'type_alias'
  | 'import'
  | 'export'
  | 'parameter'
  | 'unknown';

/**
 * 符号定义
 */
export interface SymbolDefinition {
  /** 符号名称 */
  name: string;
  /** 符号类型 */
  kind: SymbolKind;
  /** 文件路径（相对路径） */
  filePath: string;
  /** 文件路径（绝对路径） */
  absolutePath: string;
  /** 起始行号（1-based） */
  line: number;
  /** 起始列号（1-based） */
  column: number;
  /** 结束行号（可选） */
  endLine?: number;
  /** 结束列号（可选） */
  endColumn?: number;
  /** 符号详情（如类型签名） */
  detail?: string;
  /** 文档注释 */
  documentation?: string;
  /** 所属容器（如类名、模块名） */
  containerName?: string;
  /** 语言类型 */
  language: string;
  /** 索引时间 */
  indexedAt: number;
}

/**
 * 文件索引信息
 */
export interface FileIndexInfo {
  /** 文件路径 */
  filePath: string;
  /** 语言类型 */
  language: string;
  /** 符号数量 */
  symbolCount: number;
  /** 文件大小（字节） */
  fileSize: number;
  /** 行数 */
  lineCount: number;
  /** 索引时间 */
  indexedAt: number;
  /** 状态 */
  status: 'success' | 'error' | 'pending';
  /** 错误信息 */
  error?: string;
}

/**
 * 索引状态
 */
export interface IndexStatus {
  /** 是否正在索引 */
  isIndexing: boolean;
  /** 索引进度 */
  progress: number;
  /** 已索引文件数 */
  indexedFiles: number;
  /** 总文件数 */
  totalFiles: number;
  /** 已索引符号数 */
  totalSymbols: number;
  /** 当前正在索引的文件 */
  currentFile?: string;
  /** 开始时间 */
  startTime?: number;
  /** 预计剩余时间（毫秒） */
  estimatedTimeRemaining?: number;
  /** 错误文件数 */
  errorFiles: number;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  /** 符号定义 */
  symbol: SymbolDefinition;
  /** 匹配分数 */
  score: number;
  /** 匹配类型 */
  matchType: 'exact' | 'prefix' | 'contains' | 'fuzzy';
}

// ===================== 代码索引引擎类 =====================

/**
 * 代码索引引擎
 */
export class CodeIndexEngine {
  private db: Database.Database;
  private indexStatus: IndexStatus = {
    isIndexing: false,
    progress: 0,
    indexedFiles: 0,
    totalFiles: 0,
    totalSymbols: 0,
    errorFiles: 0,
  };
  private statusListeners: Set<(status: IndexStatus) => void> = new Set();

  constructor() {
    this.db = initDb();
    this.initTables();
  }

  // ========== 数据库初始化 ==========

  /**
   * 初始化数据库表
   */
  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        file_path TEXT NOT NULL,
        absolute_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        end_line INTEGER,
        end_column INTEGER,
        detail TEXT,
        documentation TEXT,
        container_name TEXT,
        language TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_symbols_name ON code_symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_kind ON code_symbols(kind);
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON code_symbols(file_path);
      CREATE INDEX IF NOT EXISTS idx_symbols_language ON code_symbols(language);
      CREATE INDEX IF NOT EXISTS idx_symbols_container ON code_symbols(container_name);

      CREATE TABLE IF NOT EXISTS code_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL UNIQUE,
        language TEXT NOT NULL,
        symbol_count INTEGER NOT NULL DEFAULT 0,
        file_size INTEGER NOT NULL DEFAULT 0,
        line_count INTEGER NOT NULL DEFAULT 0,
        indexed_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_files_path ON code_files(file_path);
      CREATE INDEX IF NOT EXISTS idx_files_language ON code_files(language);
    `);
    logger.info('[Code Index] 数据库表已初始化');
  }

  // ========== 状态管理 ==========

  /**
   * 获取索引状态
   */
  getStatus(): IndexStatus {
    return { ...this.indexStatus };
  }

  /**
   * 订阅状态变化
   */
  subscribeStatus(listener: (status: IndexStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * 更新状态
   */
  private updateStatus(updates: Partial<IndexStatus>): void {
    this.indexStatus = { ...this.indexStatus, ...updates };
    for (const listener of this.statusListeners) {
      listener(this.getStatus());
    }
  }

  // ========== 文件扫描 ==========

  /**
   * 扫描项目目录
   */
  async scanDirectory(
    rootPath: string,
    options?: {
      excludeDirs?: string[];
      extensions?: string[];
      maxDepth?: number;
    },
  ): Promise<string[]> {
    const excludeDirs = options?.excludeDirs ?? [
      'node_modules',
      '.git',
      'dist',
      'build',
      'out',
      '.next',
      'coverage',
      '__tests__',
      '__mocks__',
      'test',
      'tests',
      'e2e',
      '.cache',
      '.temp',
      '.tmp',
      'vendor',
      'third_party',
      'assets',
      'public',
      'static',
    ];

    const extensions = options?.extensions ?? [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.py',
      '.go',
      '.rs',
      '.java',
      '.json',
      '.yaml',
      '.yml',
      '.md',
    ];

    const maxDepth = options?.maxDepth ?? 10;
    const files: string[] = [];

    const scan = async (dir: string, depth: number): Promise<void> => {
      if (depth > maxDepth) return;

      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          if (entry.isDirectory()) {
            // 跳过排除目录
            if (excludeDirs.includes(entry.name)) continue;
            // 跳过隐藏目录
            if (entry.name.startsWith('.')) continue;

            await scan(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        logger.warn(`[Code Index] 扫描目录失败: ${dir}`, error);
      }
    };

    await scan(rootPath, 0);
    logger.info(`[Code Index] 扫描完成: ${files.length} 个文件`);
    return files;
  }

  // ========== 符号提取 ==========

  /**
   * 根据语言类型提取符号
   */
  async extractSymbols(filePath: string, content: string): Promise<SymbolDefinition[]> {
    const ext = extname(filePath).toLowerCase();
    const language = this.getLanguageFromExtension(ext);
    const symbols: SymbolDefinition[] = [];

    switch (language) {
      case 'typescript':
      case 'javascript':
        symbols.push(...this.extractJsTsSymbols(filePath, content, language));
        break;
      case 'python':
        symbols.push(...this.extractPythonSymbols(filePath, content));
        break;
      case 'go':
        symbols.push(...this.extractGoSymbols(filePath, content));
        break;
      case 'rust':
        symbols.push(...this.extractRustSymbols(filePath, content));
        break;
      case 'java':
        symbols.push(...this.extractJavaSymbols(filePath, content));
        break;
      default:
        // 通用符号提取
        symbols.push(...this.extractGenericSymbols(filePath, content, language));
    }

    return symbols;
  }

  /**
   * 提取 JavaScript/TypeScript 符号
   */
  private extractJsTsSymbols(
    filePath: string,
    content: string,
    language: string,
  ): SymbolDefinition[] {
    const symbols: SymbolDefinition[] = [];
    const lines = content.split('\n');
    const indexedAt = Date.now();

    // 提取函数定义
    const funcRegex = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm;
    const arrowFuncRegex = /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm;

    // 提取类定义
    const classRegex = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm;
    const interfaceRegex = /^(?:export\s+)?interface\s+(\w+)/gm;
    const typeRegex = /^(?:export\s+)?type\s+(\w+)/gm;

    // 提取枚举定义
    const enumRegex = /^(?:export\s+)?enum\s+(\w+)/gm;

    // 提取常量定义
    const constRegex = /^(?:export\s+)?const\s+(\w+)\s*=/gm;

    // 提取变量定义
    const varRegex = /^(?:export\s+)?(?:let|var)\s+(\w+)\s*=/gm;

    // 处理函数定义
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmedLine = line.trim();

      // 函数定义
      if (/^(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(/.test(trimmedLine)) {
        const match = trimmedLine.match(/function\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'function',
            filePath: filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language,
            indexedAt,
          });
        }
      }

      // 箭头函数
      if (/^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/.test(trimmedLine)) {
        const match = trimmedLine.match(/(?:const|let|var)\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'function',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language,
            indexedAt,
          });
        }
      }

      // 类定义
      if (/^(?:export\s+)?(?:abstract\s+)?class\s+\w+/.test(trimmedLine)) {
        const match = trimmedLine.match(/class\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'class',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language,
            indexedAt,
          });
        }
      }

      // 接口定义
      if (/^(?:export\s+)?interface\s+\w+/.test(trimmedLine)) {
        const match = trimmedLine.match(/interface\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'interface',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language,
            indexedAt,
          });
        }
      }

      // 类型定义
      if (/^(?:export\s+)?type\s+\w+/.test(trimmedLine)) {
        const match = trimmedLine.match(/type\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'type_alias',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language,
            indexedAt,
          });
        }
      }

      // 枚举定义
      if (/^(?:export\s+)?enum\s+\w+/.test(trimmedLine)) {
        const match = trimmedLine.match(/enum\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'enum',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language,
            indexedAt,
          });
        }
      }

      // 常量定义
      if (/^(?:export\s+)?const\s+\w+\s*=/.test(trimmedLine)) {
        const match = trimmedLine.match(/const\s+(\w+)/);
        if (match && !trimmedLine.includes('=>')) {
          symbols.push({
            name: match[1],
            kind: 'constant',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language,
            indexedAt,
          });
        }
      }
    });

    return symbols;
  }

  /**
   * 提取 Python 符号
   */
  private extractPythonSymbols(filePath: string, content: string): SymbolDefinition[] {
    const symbols: SymbolDefinition[] = [];
    const lines = content.split('\n');
    const indexedAt = Date.now();

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmedLine = line.trim();

      // 函数定义
      if (/^def\s+\w+\s*\(/.test(trimmedLine)) {
        const match = trimmedLine.match(/def\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'function',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language: 'python',
            indexedAt,
          });
        }
      }

      // 类定义
      if (/^class\s+\w+/.test(trimmedLine)) {
        const match = trimmedLine.match(/class\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'class',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language: 'python',
            indexedAt,
          });
        }
      }
    });

    return symbols;
  }

  /**
   * 提取 Go 符号
   */
  private extractGoSymbols(filePath: string, content: string): SymbolDefinition[] {
    const symbols: SymbolDefinition[] = [];
    const lines = content.split('\n');
    const indexedAt = Date.now();

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmedLine = line.trim();

      // 函数定义
      if (/^func\s+(?:\([^)]+\)\s+)?\w+\s*\(/.test(trimmedLine)) {
        const match = trimmedLine.match(/func\s+(?:\([^)]+\)\s+)?(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'function',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language: 'go',
            indexedAt,
          });
        }
      }

      // 类型定义
      if (/^type\s+\w+\s+(?:struct|interface)/.test(trimmedLine)) {
        const match = trimmedLine.match(/type\s+(\w+)/);
        if (match) {
          const kind = trimmedLine.includes('struct') ? 'class' : 'interface';
          symbols.push({
            name: match[1],
            kind,
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language: 'go',
            indexedAt,
          });
        }
      }
    });

    return symbols;
  }

  /**
   * 提取 Rust 符号
   */
  private extractRustSymbols(filePath: string, content: string): SymbolDefinition[] {
    const symbols: SymbolDefinition[] = [];
    const lines = content.split('\n');
    const indexedAt = Date.now();

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmedLine = line.trim();

      // 函数定义
      if (/^(?:pub\s+)?(?:async\s+)?fn\s+\w+/.test(trimmedLine)) {
        const match = trimmedLine.match(/fn\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'function',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language: 'rust',
            indexedAt,
          });
        }
      }

      // 结构体定义
      if (/^(?:pub\s+)?struct\s+\w+/.test(trimmedLine)) {
        const match = trimmedLine.match(/struct\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'class',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language: 'rust',
            indexedAt,
          });
        }
      }

      // trait 定义
      if (/^(?:pub\s+)?trait\s+\w+/.test(trimmedLine)) {
        const match = trimmedLine.match(/trait\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'interface',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language: 'rust',
            indexedAt,
          });
        }
      }
    });

    return symbols;
  }

  /**
   * 提取 Java 符号
   */
  private extractJavaSymbols(filePath: string, content: string): SymbolDefinition[] {
    const symbols: SymbolDefinition[] = [];
    const lines = content.split('\n');
    const indexedAt = Date.now();

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmedLine = line.trim();

      // 类定义
      if (/^(?:public|private|protected)?\s*(?:abstract|final)?\s*class\s+\w+/.test(trimmedLine)) {
        const match = trimmedLine.match(/class\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'class',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language: 'java',
            indexedAt,
          });
        }
      }

      // 接口定义
      if (/^(?:public|private)?\s*interface\s+\w+/.test(trimmedLine)) {
        const match = trimmedLine.match(/interface\s+(\w+)/);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 'interface',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language: 'java',
            indexedAt,
          });
        }
      }

      // 方法定义
      if (/^(?:public|private|protected)?\s*(?:static|abstract|final)?\s*\w+\s+\w+\s*\(/.test(trimmedLine)) {
        const match = trimmedLine.match(/\s+(\w+)\s*\(/);
        if (match && !['class', 'interface', 'new', 'if', 'for', 'while', 'switch', 'catch'].includes(match[1])) {
          symbols.push({
            name: match[1],
            kind: 'method',
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language: 'java',
            indexedAt,
          });
        }
      }
    });

    return symbols;
  }

  /**
   * 提取通用符号（基于正则匹配）
   */
  private extractGenericSymbols(
    filePath: string,
    content: string,
    language: string,
  ): SymbolDefinition[] {
    const symbols: SymbolDefinition[] = [];
    const indexedAt = Date.now();

    // 使用通用正则匹配可能的符号
    const genericPatterns = [
      // 函数模式
      { regex: /^(?:\w+\s+)?(\w+)\s*\([^)]*\)\s*{/, kind: 'function' as SymbolKind },
      // 类/结构体模式
      { regex: /^(?:\w+\s+)?(?:class|struct)\s+(\w+)/, kind: 'class' as SymbolKind },
      // 接口模式
      { regex: /^(?:\w+\s+)?(?:interface|trait)\s+(\w+)/, kind: 'interface' as SymbolKind },
    ];

    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      for (const pattern of genericPatterns) {
        const match = line.match(pattern.regex);
        if (match) {
          symbols.push({
            name: match[1],
            kind: pattern.kind,
            filePath,
            absolutePath: filePath,
            line: lineNum,
            column: line.indexOf(match[1]) + 1,
            language,
            indexedAt,
          });
        }
      }
    });

    return symbols;
  }

  /**
   * 根据文件扩展名获取语言类型
   */
  private getLanguageFromExtension(ext: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
    };
    return langMap[ext] ?? 'unknown';
  }

  // ========== 索引操作 ==========

  /**
   * 构建索引
   */
  async buildIndex(
    rootPath: string,
    options?: {
      excludeDirs?: string[];
      extensions?: string[];
      maxDepth?: number;
      clearExisting?: boolean;
    },
  ): Promise<IndexStatus> {
    if (this.indexStatus.isIndexing) {
      logger.warn('[Code Index] 已有索引任务正在执行');
      return this.getStatus();
    }

    logger.info(`[Code Index] 开始构建索引: ${rootPath}`);
    const startTime = Date.now();

    // 清空现有索引
    if (options?.clearExisting ?? true) {
      this.clearIndex();
    }

    // 扫描文件
    const files = await this.scanDirectory(rootPath, options);
    this.updateStatus({
      isIndexing: true,
      totalFiles: files.length,
      indexedFiles: 0,
      totalSymbols: 0,
      progress: 0,
      startTime,
      errorFiles: 0,
    });

    // 累计符号数
    let totalSymbols = 0;

    // 索引每个文件
    for (const filePath of files) {
      this.updateStatus({ currentFile: filePath });

      try {
        const content = await readFile(filePath, 'utf-8');
        const relativePath = relative(rootPath, filePath);

        // 提取符号
        const symbols = await this.extractSymbols(filePath, content);

        // 保存符号到数据库
        this.saveSymbols(symbols, relativePath);

        // 保存文件信息
        const fileInfo: FileIndexInfo = {
          filePath: relativePath,
          language: this.getLanguageFromExtension(extname(filePath)),
          symbolCount: symbols.length,
          fileSize: content.length,
          lineCount: content.split('\n').length,
          indexedAt: Date.now(),
          status: 'success',
        };
        this.saveFileInfo(fileInfo);

        totalSymbols += symbols.length;

        // 更新进度
        const progress = ((this.indexStatus.indexedFiles + 1) / files.length) * 100;
        const elapsed = Date.now() - startTime;
        const avgTimePerFile = elapsed / (this.indexStatus.indexedFiles + 1);
        const estimatedTimeRemaining = avgTimePerFile * (files.length - this.indexStatus.indexedFiles - 1);

        this.updateStatus({
          indexedFiles: this.indexStatus.indexedFiles + 1,
          totalSymbols,
          progress,
          estimatedTimeRemaining,
        });
      } catch (error) {
        logger.error(`[Code Index] 索引文件失败: ${filePath}`, error);
        this.updateStatus({ errorFiles: this.indexStatus.errorFiles + 1 });

        // 保存失败文件信息
        const relativePath = relative(rootPath, filePath);
        const fileInfo: FileIndexInfo = {
          filePath: relativePath,
          language: this.getLanguageFromExtension(extname(filePath)),
          symbolCount: 0,
          fileSize: 0,
          lineCount: 0,
          indexedAt: Date.now(),
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        };
        this.saveFileInfo(fileInfo);
      }
    }

    // 完成索引
    this.updateStatus({
      isIndexing: false,
      progress: 100,
      currentFile: undefined,
      estimatedTimeRemaining: 0,
    });

    const duration = Date.now() - startTime;
    logger.info(`[Code Index] 索引完成: ${this.indexStatus.indexedFiles} 文件, ${totalSymbols} 符号, ${duration}ms`);

    return this.getStatus();
  }

  /**
   * 保存符号到数据库
   */
  private saveSymbols(symbols: SymbolDefinition[], relativePath: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO code_symbols (
        name, kind, file_path, absolute_path, line, column,
        end_line, end_column, detail, documentation,
        container_name, language, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items: SymbolDefinition[]) => {
      for (const item of items) {
        stmt.run(
          item.name,
          item.kind,
          relativePath,
          item.absolutePath,
          item.line,
          item.column,
          item.endLine ?? null,
          item.endColumn ?? null,
          item.detail ?? null,
          item.documentation ?? null,
          item.containerName ?? null,
          item.language,
          item.indexedAt,
        );
      }
    });

    insertMany(symbols);
  }

  /**
   * 保存文件信息
   */
  private saveFileInfo(info: FileIndexInfo): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO code_files (
        file_path, language, symbol_count, file_size,
        line_count, indexed_at, status, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      info.filePath,
      info.language,
      info.symbolCount,
      info.fileSize,
      info.lineCount,
      info.indexedAt,
      info.status,
      info.error ?? null,
    );
  }

  /**
   * 清空索引
   */
  clearIndex(): void {
    this.db.exec('DELETE FROM code_symbols');
    this.db.exec('DELETE FROM code_files');
    logger.info('[Code Index] 索引已清空');
  }

  // ========== 搜索操作 ==========

  /**
   * 搜索符号
   */
  searchSymbols(
    query: string,
    options?: {
      kind?: SymbolKind;
      language?: string;
      filePath?: string;
      limit?: number;
    },
  ): SearchResult[] {
    const limit = options?.limit ?? 50;
    const conditions: string[] = [];
    const params: unknown[] = [];

    // 构建查询条件
    if (query) {
      conditions.push('name LIKE ?');
      params.push(`%${query}%`);
    }

    if (options?.kind) {
      conditions.push('kind = ?');
      params.push(options.kind);
    }

    if (options?.language) {
      conditions.push('language = ?');
      params.push(options.language);
    }

    if (options?.filePath) {
      conditions.push('file_path LIKE ?');
      params.push(`%${options.filePath}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM code_symbols ${whereClause} ORDER BY indexed_at DESC LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<{
      name: string;
      kind: string;
      file_path: string;
      absolute_path: string;
      line: number;
      column: number;
      end_line?: number;
      end_column?: number;
      detail?: string;
      documentation?: string;
      container_name?: string;
      language: string;
      indexed_at: number;
    }>;

    // 转换为搜索结果
    const results: SearchResult[] = rows.map((row) => {
      const symbol: SymbolDefinition = {
        name: row.name,
        kind: row.kind as SymbolKind,
        filePath: row.file_path,
        absolutePath: row.absolute_path,
        line: row.line,
        column: row.column,
        endLine: row.end_line,
        endColumn: row.end_column,
        detail: row.detail,
        documentation: row.documentation,
        containerName: row.container_name,
        language: row.language,
        indexedAt: row.indexed_at,
      };

      // 计算匹配分数
      let score = 1;
      let matchType: 'exact' | 'prefix' | 'contains' | 'fuzzy' = 'contains';

      if (query) {
        if (symbol.name === query) {
          score = 100;
          matchType = 'exact';
        } else if (symbol.name.startsWith(query)) {
          score = 80;
          matchType = 'prefix';
        } else if (symbol.name.includes(query)) {
          score = 50;
          matchType = 'contains';
        }
      }

      return { symbol, score, matchType };
    });

    // 按分数排序
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * 获取文件的所有符号
   */
  getFileSymbols(filePath: string): SymbolDefinition[] {
    const rows = this.db.prepare(`
      SELECT * FROM code_symbols WHERE file_path = ? ORDER BY line ASC
    `).all(filePath) as Array<{
      name: string;
      kind: string;
      file_path: string;
      absolute_path: string;
      line: number;
      column: number;
      end_line?: number;
      end_column?: number;
      detail?: string;
      documentation?: string;
      container_name?: string;
      language: string;
      indexed_at: number;
    }>;

    return rows.map((row) => ({
      name: row.name,
      kind: row.kind as SymbolKind,
      filePath: row.file_path,
      absolutePath: row.absolute_path,
      line: row.line,
      column: row.column,
      endLine: row.end_line,
      endColumn: row.end_column,
      detail: row.detail,
      documentation: row.documentation,
      containerName: row.container_name,
      language: row.language,
      indexedAt: row.indexed_at,
    }));
  }

  /**
   * 获取所有已索引文件
   */
  getIndexedFiles(): FileIndexInfo[] {
    const rows = this.db.prepare(`
      SELECT * FROM code_files ORDER BY indexed_at DESC
    `).all() as Array<{
      file_path: string;
      language: string;
      symbol_count: number;
      file_size: number;
      line_count: number;
      indexed_at: number;
      status: string;
      error?: string;
    }>;

    return rows.map((row) => ({
      filePath: row.file_path,
      language: row.language,
      symbolCount: row.symbol_count,
      fileSize: row.file_size,
      lineCount: row.line_count,
      indexedAt: row.indexed_at,
      status: row.status as 'success' | 'error' | 'pending',
      error: row.error,
    }));
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalFiles: number;
    totalSymbols: number;
    symbolsByKind: Record<SymbolKind, number>;
    symbolsByLanguage: Record<string, number>;
    lastIndexedAt?: number;
  } {
    const fileCount = this.db.prepare('SELECT COUNT(*) as count FROM code_files').get() as { count: number };
    const symbolCount = this.db.prepare('SELECT COUNT(*) as count FROM code_symbols').get() as { count: number };
    const lastIndexed = this.db.prepare('SELECT MAX(indexed_at) as last FROM code_files').get() as { last: number | null };

    // 按类型统计
    const kindRows = this.db.prepare('SELECT kind, COUNT(*) as count FROM code_symbols GROUP BY kind').all() as Array<{ kind: string; count: number }>;
    const symbolsByKind = {} as Record<SymbolKind, number>;
    for (const row of kindRows) {
      symbolsByKind[row.kind as SymbolKind] = row.count;
    }

    // 按语言统计
    const langRows = this.db.prepare('SELECT language, COUNT(*) as count FROM code_symbols GROUP BY language').all() as Array<{ language: string; count: number }>;
    const symbolsByLanguage: Record<string, number> = {};
    for (const row of langRows) {
      symbolsByLanguage[row.language] = row.count;
    }

    return {
      totalFiles: fileCount.count,
      totalSymbols: symbolCount.count,
      symbolsByKind,
      symbolsByLanguage,
      lastIndexedAt: lastIndexed.last ?? undefined,
    };
  }
}

// ===================== 单例实例 =====================

let CODE_INDEX_INSTANCE: CodeIndexEngine | null = null;

/**
 * 获取代码索引引擎实例
 */
export function getCodeIndexEngine(): CodeIndexEngine {
  if (!CODE_INDEX_INSTANCE) {
    CODE_INDEX_INSTANCE = new CodeIndexEngine();
  }
  return CODE_INDEX_INSTANCE;
}

/**
 * 重置代码索引引擎（用于测试）
 */
export function resetCodeIndexEngine(): void {
  CODE_INDEX_INSTANCE = null;
}