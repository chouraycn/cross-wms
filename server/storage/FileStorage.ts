// ============================================================================
// storage/FileStorage.ts — 明文文件存储层
//
// 双层架构的第二层（文件层），不依赖任何数据库引擎。
// 直接以文件系统为后端，管理会话 JSONL、记忆 Markdown、
// 配置文件 JSON5 三类数据。
//
// 所有路径均根目录于 ~/.cdf-know-clow/。
// ============================================================================

import * as path from 'path';
import * as fs from 'fs';
import JSON5 from 'json5';
import { AppPaths } from '../config/appPaths.js';

/** 确保目录存在，不存在则递归创建 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 明文文件存储工具类。
 *
 * 所有方法均为静态，无需实例化。
 * 文件 I/O 操作不经过任何数据库层，直接读写磁盘文件。
 */
export class FileStorage {
  // ==========================================================================
  // 目录管理
  // ==========================================================================

  /** 确保所有必要的存储目录存在 */
  static ensureDirectories(): void {
    ensureDir(FileStorage.sessionsDir);
    ensureDir(FileStorage.memoryDir);
    ensureDir(FileStorage.configDir);
  }

  // ==========================================================================
  // 会话 — JSONL 格式
  // ==========================================================================

  /** 会话文件存放目录 ~/.cdf-know-clow/sessions/ */
  static sessionsDir: string = AppPaths.sessionsDir;

  /**
   * 向指定会话文件追加一行 JSON。
   * @param sessionId 会话 ID（将作为文件名）
   * @param jsonLine  要序列化并追加的 JSON 对象
   */
  static appendSessionLine(sessionId: string, jsonLine: object): void {
    ensureDir(FileStorage.sessionsDir);
    const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
    fs.appendFileSync(filePath, JSON.stringify(jsonLine) + '\n', 'utf-8');
  }

  /**
   * 读取指定会话文件的所有行。
   * @returns 按行反序列化后的对象数组
   */
  static readSessionLines(sessionId: string): object[] {
    const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
    const content = fs.readFileSync(filePath, 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as object);
  }

  /** 删除指定会话文件 */
  static deleteSessionFile(sessionId: string): void {
    const filePath = path.join(FileStorage.sessionsDir, `${sessionId}.jsonl`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /** 列出所有会话文件名（不含扩展名） */
  static listSessionFiles(): string[] {
    ensureDir(FileStorage.sessionsDir);
    return fs
      .readdirSync(FileStorage.sessionsDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => f.replace(/\.jsonl$/, ''));
  }

  // ==========================================================================
  // 记忆 — Markdown 格式
  // ==========================================================================

  /** 记忆文件存放目录 ~/.cdf-know-clow/memory/ */
  static memoryDir: string = AppPaths.memoryDir;

  /**
   * 写入记忆文件（Markdown）。
   * @param filename 文件名（如 agent-xyz.md）
   * @param content  Markdown 正文
   */
  static writeMemoryFile(filename: string, content: string): void {
    ensureDir(FileStorage.memoryDir);
    const filePath = path.join(FileStorage.memoryDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  /**
   * 读取记忆文件全部内容。
   * @returns 文件正文（UTF-8）
   */
  static readMemoryFile(filename: string): string {
    const filePath = path.join(FileStorage.memoryDir, filename);
    return fs.readFileSync(filePath, 'utf-8');
  }

  /** 列出 memoryDir 下所有 *.md 文件名 */
  static listMemoryFiles(): string[] {
    ensureDir(FileStorage.memoryDir);
    return fs.readdirSync(FileStorage.memoryDir).filter((f) => f.endsWith('.md'));
  }

  // ==========================================================================
  // 配置 — JSON / JSON5 格式
  // ==========================================================================

  /** 配置文件存放目录 ~/.cdf-know-clow/config/ */
  static configDir: string = AppPaths.configDir;

  /**
   * 写入配置文件。
   * @param filename 文件名（如 app-settings.json5）
   * @param config   可序列化的配置对象
   */
  static writeConfig(filename: string, config: object): void {
    ensureDir(FileStorage.configDir);
    const filePath = path.join(FileStorage.configDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  /**
   * 读取并反序列化配置文件。
   * @returns 泛型 T 的配置对象
   */
  static readConfig<T>(filename: string): T {
    const filePath = path.join(FileStorage.configDir, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON5.parse(content) as T;
  }

  /** 删除指定配置文件 */
  static deleteConfig(filename: string): void {
    const filePath = path.join(FileStorage.configDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /** 列出 configDir 下所有 *.json5 文件名 */
  static listConfigFiles(): string[] {
    ensureDir(FileStorage.configDir);
    return fs.readdirSync(FileStorage.configDir).filter((f) => f.endsWith('.json5'));
  }
}