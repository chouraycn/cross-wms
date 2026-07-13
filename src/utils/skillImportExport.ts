/**
 * Skill Import/Export & Backup — 技能导入导出与备份功能
 *
 * 支持技能的打包、备份和迁移：
 * 1. 技能导出 — 将技能打包为 .claw-skill 文件
 * 2. 技能导入 — 从文件/URL 导入技能
 * 3. 批量备份 — 一键备份所有已安装技能
 * 4. 批量恢复 — 从备份文件恢复技能
 * 5. 技能迁移 — 在不同设备间迁移技能
 * 6. 版本兼容 — 检查导入技能的兼容性
 * 7. 冲突处理 — 同名技能的合并/覆盖策略
 *
 * 导出格式：
 * - .claw-skill: 单技能压缩包（ZIP 格式，简化为 JSON + base64）
 * - .claw-bundle: 多技能备份包
 */

// ===================== 类型定义 =====================

/** 导出格式 */
export type ExportFormat = 'json' | 'bundle';

/** 冲突处理策略 */
export type ConflictStrategy = 'skip' | 'overwrite' | 'rename' | 'merge';

/** 技能文件信息 */
export interface SkillFile {
  /** 文件名 */
  name: string;
  /** 文件路径（相对技能目录） */
  path: string;
  /** 文件内容（base64） */
  content: string;
  /** 文件大小（字节） */
  size: number;
  /** MIME 类型 */
  mimeType?: string;
}

/** 导出的技能数据 */
export interface ExportedSkill {
  /** 格式版本 */
  formatVersion: number;
  /** 导出时间 */
  exportedAt: number;
  /** 导出工具版本 */
  exporterVersion: string;
  /** 技能信息 */
  skill: {
    id: string;
    name: string;
    version?: string;
    description?: string;
    author?: string;
    category?: string;
    tags?: string[];
    trigger?: string;
    icon?: string;
    homepage?: string;
    license?: string;
    metadata?: Record<string, unknown>;
  };
  /** 技能文件 */
  files: SkillFile[];
  /** 依赖声明 */
  dependencies?: {
    skills?: string[];
    tools?: string[];
    bins?: string[];
  };
  /** 数字签名（可选） */
  signature?: string;
}

/** 多技能备份包 */
export interface SkillBundle {
  /** 格式版本 */
  formatVersion: number;
  /** 导出时间 */
  exportedAt: number;
  /** 导出工具版本 */
  exporterVersion: string;
  /** 源设备信息 */
  sourceDevice?: {
    platform: string;
    hostname?: string;
  };
  /** 技能列表 */
  skills: ExportedSkill[];
  /** 摘要 */
  summary: {
    total: number;
    totalSize: number;
    categories: string[];
  };
}

/** 导入结果 */
export interface ImportResult {
  success: boolean;
  skillId?: string;
  skillName?: string;
  conflict?: boolean;
  strategy?: ConflictStrategy;
  error?: string;
  warnings: string[];
  importedFiles?: string[];
}

/** 批量导入结果 */
export interface BatchImportResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  results: ImportResult[];
  totalDurationMs: number;
}

/** 备份选项 */
export interface BackupOptions {
  /** 包含的技能 ID 列表，空表示全部 */
  skillIds?: string[];
  /** 是否包含执行历史 */
  includeHistory?: boolean;
  /** 是否包含配置 */
  includeConfig?: boolean;
  /** 压缩级别 */
  compression?: 'none' | 'standard' | 'high';
  /** 输出格式 */
  format?: ExportFormat;
}

/** 导入选项 */
export interface ImportOptions {
  /** 冲突处理策略 */
  conflictStrategy?: ConflictStrategy;
  /** 是否跳过验证 */
  skipValidation?: boolean;
  /** 是否启用沙箱（限制权限） */
  sandboxed?: boolean;
  /** 目标目录 */
  targetDir?: string;
}

// ===================== 常量 =====================

/** 当前格式版本 */
const FORMAT_VERSION = 1;

/** 导出工具版本 */
const EXPORTER_VERSION = '1.0.0';

/** 文件大小限制（单技能 10MB） */
const MAX_SKILL_SIZE = 10 * 1024 * 1024;

/** 备份包大小限制（100MB） */
const MAX_BUNDLE_SIZE = 100 * 1024 * 1024;

/** 支持的文件扩展名 */
const SUPPORTED_EXTENSIONS = ['.md', '.json', '.yaml', '.yml', '.js', '.ts', '.py', '.sh', '.txt', '.html', '.css'];

// ===================== SkillImportExport 类 =====================

export class SkillImportExport {
  private options: { baseDir?: string };

  constructor(options: { baseDir?: string } = {}) {
    this.options = options;
  }

  // ===================== 1. 导出 =====================

  /**
   * 导出单个技能
   */
  async exportSkill(
    skillInfo: ExportedSkill['skill'],
    files: SkillFile[],
    options: { includeDependencies?: boolean; sign?: boolean } = {},
  ): Promise<ExportedSkill> {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_SKILL_SIZE) {
      throw new Error(`技能文件过大（${this.formatBytes(totalSize)}），最大限制 ${this.formatBytes(MAX_SKILL_SIZE)}`);
    }

    const exported: ExportedSkill = {
      formatVersion: FORMAT_VERSION,
      exportedAt: Date.now(),
      exporterVersion: EXPORTER_VERSION,
      skill: skillInfo,
      files,
    };

    if (options.sign) {
      exported.signature = this.generateSignature(exported);
    }

    return exported;
  }

  /**
   * 批量导出为备份包
   */
  async exportBundle(
    skills: Array<{ info: ExportedSkill['skill']; files: SkillFile[] }>,
    options: BackupOptions = {},
  ): Promise<SkillBundle> {
    const exportedSkills: ExportedSkill[] = [];

    for (const skill of skills) {
      try {
        const exported = await this.exportSkill(skill.info, skill.files);
        exportedSkills.push(exported);
      } catch (e) {
        console.warn(`导出技能 ${skill.info.name} 失败：`, e);
      }
    }

    const totalSize = exportedSkills.reduce(
      (sum, s) => sum + s.files.reduce((fSum, f) => fSum + f.size, 0),
      0,
    );

    if (totalSize > MAX_BUNDLE_SIZE) {
      throw new Error(`备份包过大（${this.formatBytes(totalSize)}），最大限制 ${this.formatBytes(MAX_BUNDLE_SIZE)}`);
    }

    const categories = new Set<string>();
    for (const s of exportedSkills) {
      if (s.skill.category) categories.add(s.skill.category);
    }

    const bundle: SkillBundle = {
      formatVersion: FORMAT_VERSION,
      exportedAt: Date.now(),
      exporterVersion: EXPORTER_VERSION,
      sourceDevice: {
        platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      },
      skills: exportedSkills,
      summary: {
        total: exportedSkills.length,
        totalSize,
        categories: Array.from(categories),
      },
    };

    return bundle;
  }

  // ===================== 2. 导入 =====================

  /**
   * 导入单个技能
   */
  async importSkill(
    exported: ExportedSkill,
    options: ImportOptions = {},
  ): Promise<ImportResult> {
    const warnings: string[] = [];

    // 1. 格式版本检查
    if (exported.formatVersion > FORMAT_VERSION) {
      warnings.push(`技能格式版本较新（v${exported.formatVersion}），可能不完全兼容`);
    }

    // 2. 必填字段检查
    if (!exported.skill.id || !exported.skill.name) {
      return {
        success: false,
        error: '技能数据不完整：缺少 id 或 name',
        warnings,
      };
    }

    // 3. 文件完整性检查
    if (!exported.files || exported.files.length === 0) {
      return {
        success: false,
        error: '技能不包含任何文件',
        warnings,
      };
    }

    // 4. 大小检查
    const totalSize = exported.files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_SKILL_SIZE) {
      return {
        success: false,
        error: `技能文件过大（${this.formatBytes(totalSize)}）`,
        warnings,
      };
    }

    // 5. 文件类型检查（安全过滤）
    const dangerousFiles = exported.files.filter(
      (f) => f.name.endsWith('.exe') || f.name.endsWith('.bat') || f.name.endsWith('.cmd'),
    );
    if (dangerousFiles.length > 0) {
      warnings.push(`检测到 ${dangerousFiles.length} 个可执行文件，导入时需谨慎`);
    }

    // 6. 签名验证（如果有）
    if (exported.signature) {
      const valid = this.verifySignature(exported);
      if (!valid) {
        warnings.push('数字签名验证失败，技能可能被篡改');
      }
    }

    // 7. 冲突检测（模拟：返回成功但标记冲突状态）
    const hasConflict = await this.checkConflict(exported.skill.id);
    const strategy = options.conflictStrategy || 'rename';

    if (hasConflict && strategy === 'skip') {
      return {
        success: false,
        skillId: exported.skill.id,
        skillName: exported.skill.name,
        conflict: true,
        strategy,
        error: '技能已存在，已跳过',
        warnings,
      };
    }

    // 8. 执行导入（此处为模拟，实际需要文件系统 API）
    const importedFiles = exported.files.map((f) => f.path);

    return {
      success: true,
      skillId: exported.skill.id,
      skillName: exported.skill.name,
      conflict: hasConflict,
      strategy,
      warnings,
      importedFiles,
    };
  }

  /**
   * 批量导入
   */
  async importBundle(
    bundle: SkillBundle,
    options: ImportOptions = {},
  ): Promise<BatchImportResult> {
    const startTime = Date.now();
    const results: ImportResult[] = [];
    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const skill of bundle.skills) {
      const result = await this.importSkill(skill, options);
      results.push(result);

      if (result.success) {
        success++;
      } else if (result.conflict && options.conflictStrategy === 'skip') {
        skipped++;
      } else {
        failed++;
      }
    }

    return {
      total: bundle.skills.length,
      success,
      failed,
      skipped,
      results,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // ===================== 3. 序列化 / 反序列化 =====================

  /**
   * 将导出数据序列化为 JSON 字符串
   */
  serializeSkill(exported: ExportedSkill): string {
    return JSON.stringify(exported);
  }

  /**
   * 从 JSON 字符串解析技能数据
   */
  parseSkill(json: string): ExportedSkill {
    const parsed = JSON.parse(json);

    if (!parsed.formatVersion || !parsed.skill || !parsed.files) {
      throw new Error('无效的技能文件格式');
    }

    return parsed as ExportedSkill;
  }

  /**
   * 将备份包序列化为 JSON
   */
  serializeBundle(bundle: SkillBundle): string {
    return JSON.stringify(bundle);
  }

  /**
   * 从 JSON 解析备份包
   */
  parseBundle(json: string): SkillBundle {
    const parsed = JSON.parse(json);

    if (!parsed.formatVersion || !Array.isArray(parsed.skills)) {
      throw new Error('无效的备份包格式');
    }

    return parsed as SkillBundle;
  }

  // ===================== 4. 文件工具 =====================

  /**
   * 读取文件为 base64
   */
  async readFileAsBase64(file: File): Promise<SkillFile> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = (reader.result as string).split(',')[1] || '';
        resolve({
          name: file.name,
          path: file.name,
          content,
          size: file.size,
          mimeType: file.type,
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * 从多个文件构建技能文件列表
   */
  async buildSkillFiles(files: File[]): Promise<SkillFile[]> {
    const result: SkillFile[] = [];

    for (const file of files) {
      if (!this.isSupportedFile(file.name)) {
        console.warn(`跳过不支持的文件类型：${file.name}`);
        continue;
      }

      const skillFile = await this.readFileAsBase64(file);
      result.push(skillFile);
    }

    return result;
  }

  /**
   * 下载导出文件
   */
  download(data: string, filename: string, mimeType = 'application/json'): void {
    if (typeof document === 'undefined') return;

    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ===================== 5. 辅助方法 =====================

  /**
   * 检查是否支持该文件类型
   */
  private isSupportedFile(filename: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * 检查冲突（模拟实现）
   */
  private async checkConflict(skillId: string): Promise<boolean> {
    // 实际实现中应检查本地是否已存在该技能
    // 这里返回 false 作为默认值
    void skillId;
    return false;
  }

  /**
   * 生成数字签名（模拟实现）
   */
  private generateSignature(exported: ExportedSkill): string {
    const data = `${exported.skill.id}:${exported.skill.name}:${exported.exportedAt}`;
    return btoa(data).replace(/=/g, '');
  }

  /**
   * 验证数字签名
   */
  private verifySignature(_exported: ExportedSkill): boolean {
    // 实际实现中应使用真实的公钥验证
    // 这里简单返回 true
    return true;
  }

  /**
   * 格式化字节数
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 验证导出数据完整性
   */
  validateExport(exported: ExportedSkill): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!exported.formatVersion) {
      errors.push('缺少格式版本');
    }
    if (!exported.skill.id) {
      errors.push('缺少技能 ID');
    }
    if (!exported.skill.name) {
      errors.push('缺少技能名称');
    }
    if (!exported.files || exported.files.length === 0) {
      errors.push('技能不包含任何文件');
    }

    if (exported.files) {
      const hasSkillMd = exported.files.some(
        (f) => f.name === 'SKILL.md' || f.path.endsWith('/SKILL.md'),
      );
      if (!hasSkillMd) {
        warnings.push('未找到 SKILL.md 文件，可能不完整');
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

// ===================== Module-level Singleton =====================

/** 技能导入导出单例 */
export const skillImportExport = new SkillImportExport();

// ===================== 便捷函数 =====================

/**
 * 从文件导入技能
 */
export async function importSkillFromFile(
  file: File,
  options?: ImportOptions,
): Promise<ImportResult> {
  const text = await file.text();
  const importer = new SkillImportExport();
  const exported = importer.parseSkill(text);
  return importer.importSkill(exported, options);
}

/**
 * 从备份文件批量导入
 */
export async function importBundleFromFile(
  file: File,
  options?: ImportOptions,
): Promise<BatchImportResult> {
  const text = await file.text();
  const importer = new SkillImportExport();
  const bundle = importer.parseBundle(text);
  return importer.importBundle(bundle, options);
}

/**
 * 导出技能为文件并下载
 */
export function exportSkillToFile(
  skillInfo: ExportedSkill['skill'],
  files: SkillFile[],
  filename?: string,
): void {
  const exporter = new SkillImportExport();
  exporter.exportSkill(skillInfo, files).then((exported) => {
    const json = exporter.serializeSkill(exported);
    const fname = filename || `${skillInfo.id}.claw-skill`;
    exporter.download(json, fname, 'application/json');
  });
}