/**
 * 文件系统类型定义
 */

/** 文件条目类型 */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modifiedTime?: string;
  children?: FileEntry[];
}

/** 文件树节点（带展开状态） */
export interface FileTreeNode extends FileEntry {
  expanded?: boolean;
  loading?: boolean;
}

/** 文件操作类型 */
export type FileOperation = 'view' | 'edit' | 'delete' | 'rename' | 'create_file' | 'create_folder';

/** 文件操作请求 */
export interface FileOperationRequest {
  operation: FileOperation;
  path: string;
  content?: string;
  newName?: string;
}

/** 文件操作响应 */
export interface FileOperationResponse {
  success: boolean;
  data?: string | FileEntry[];
  error?: string;
}

/** 文件搜索结果 */
export interface FileSearchResult {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  matchType: 'name' | 'content';
}

/** 文件编辑器状态 */
export interface FileEditorState {
  path: string;
  content: string;
  language: string;
  modified: boolean;
  readOnly: boolean;
}