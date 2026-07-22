/**
 * 技能安装类型定义
 *
 * 定义技能安装流程中使用的通用类型、接口和枚举。
 */

/** 技能安装结果 */
export type InstallResult = {
  /** 是否安装成功 */
  ok: boolean;
  /** 错误信息（失败时） */
  error?: string;
  /** 技能标识（slug） */
  slug?: string;
  /** 版本号 */
  version?: string;
  /** 安装目标目录 */
  targetDir?: string;
};

/** 技能安装来源类型 */
export type InstallSource = 'clawhub' | 'git' | 'local' | 'archive';

/** 技能安装规范 */
export type SkillInstallSpec = {
  /** 安装类型 */
  kind: 'brew' | 'node' | 'go' | 'uv' | 'download';
  /** 技能 ID */
  id?: string;
  /** 显示标签 */
  label?: string;
  /** 可执行文件列表 */
  bins?: string[];
  /** 支持的操作系统 */
  os?: string[];
  /** Homebrew formula 名称 */
  formula?: string;
  /** npm/pip 包名 */
  package?: string;
  /** Go 模块路径 */
  module?: string;
  /** 下载 URL */
  url?: string;
  /** 本地归档文件路径 */
  archive?: string;
  /** 是否需要解压 */
  extract?: boolean;
  /** 解压时剥离的目录层级 */
  stripComponents?: number;
  /** 目标安装目录 */
  targetDir?: string;
  /** 校验和（SHA256） */
  checksum?: string;
};

/** 下载选项 */
export type DownloadOptions = {
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 进度回调 */
  onProgress?: (downloaded: number, total: number) => void;
};

/** 解压选项 */
export type ExtractOptions = {
  /** 剥离的目录层级 */
  stripComponents?: number;
  /** 是否覆盖已存在文件 */
  overwrite?: boolean;
};

/** ClawHub 技能归档信息 */
export type ClawHubSkillArchive = {
  /** 技能 slug */
  slug: string;
  /** 版本号 */
  version: string;
  /** 归档下载 URL */
  downloadUrl: string;
  /** SHA256 校验和 */
  sha256: string;
  /** 文件大小（字节） */
  size: number;
};

/** 工作区技能支持文件 */
export type WorkspaceSkillSupportFile = {
  /** 文件相对路径 */
  path: string;
  /** 文件内容 */
  content: string;
  /** 是否为二进制内容（base64 编码） */
  binary?: boolean;
};
