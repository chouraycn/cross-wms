/**
 * 企业微信文档 API 服务 — 通过 pywebview js_api 桥接调用 wecom-cli
 *
 * 与 tencentDocsApi.ts 平行，共享 PyWebViewApi 声明（在 tencentDocsApi.ts 中定义）
 * 企业文档使用 wecom-cli 子进程调用，个人文档使用 docs.qq.com OpenAPI HTTP 调用
 */

// ===================== 类型定义 =====================

/** 企业微信认证状态 */
export interface WeComAuthStatus {
  /** wecom-cli 是否已安装 */
  cliInstalled: boolean;
  /** 是否已完成授权 */
  authorized: boolean;
  /** 检查时间戳（秒） */
  checkedAt: number;
}

/** 文档品类（从 URL 路径推断） */
export type WeComDocCategory = 'doc' | 'smartsheet' | 'smartpage';

/** 智能表格子表信息 */
export interface WeComSheetInfo {
  sheet_id: string;
  title: string;
  [key: string]: unknown;
}

/** 智能表格字段信息 */
export interface WeComFieldInfo {
  field_id: string;
  field_title: string;
  field_type: string;
  [key: string]: unknown;
}

/** 智能表格记录 */
export interface WeComRecord {
  record_id: string;
  create_time?: string;
  update_time?: string;
  values: Record<string, Array<{ text?: string; type?: string; id?: string; style?: number; [key: string]: unknown }>>;
}

/** 智能表格数据响应 */
export interface WeComSheetData {
  errcode: number;
  errmsg: string;
  records: WeComRecord[];
  total: number;
  has_more: boolean;
}

/** 智能表格结构响应 */
export interface WeComSmartsheetStructure {
  sheets: WeComSheetInfo[];
  fields: Record<string, WeComFieldInfo[]>;  // key = sheet_id
}

// ===================== 公用 bridge 调用（复用 waitForApi 模式） =====================

/**
 * 调用 pywebview API 方法并解析 JSON 结果
 * waitForApi 函数在 tencentDocsApi.ts 中定义，这里通过动态导入避免循环依赖
 * 在 pywebview 环境外（浏览器开发模式）直接报错
 */
async function callApi<T>(method: string, ...args: unknown[]): Promise<T> {
  if (!window.pywebview?.api) {
    throw new Error('企业文档功能仅在桌面应用中可用（需要 pywebview 环境）');
  }
  const api = window.pywebview.api as unknown as Record<string, (...a: unknown[]) => Promise<string>>;
  const fn = api[method];
  if (typeof fn !== 'function') {
    throw new Error(`API method "${method}" not available`);
  }
  const jsonStr = await fn(...args);
  const result = JSON.parse(jsonStr);

  if (!result.ok && result.error) {
    throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error));
  }

  return result as T;
}

// ===================== 公共 API =====================

/** 检查企业微信认证状态 */
export async function getWeComAuthStatus(): Promise<WeComAuthStatus> {
  return callApi<WeComAuthStatus>('wecom_check_auth');
}

/** 读取企业文档/智能表格内容（返回 Markdown） */
export async function getWeComDocContent(docid: string, category: WeComDocCategory): Promise<string> {
  const result = await callApi<{ ok: boolean; content: string; format: string; error?: string }>(
    'wecom_doc_content', docid, category,
  );
  if (!result.ok) throw new Error(result.error || 'Failed to read doc content');
  return result.content;
}

/** 读取智能文档内容（smartpage 品类，返回 Markdown） */
export async function getWeComSmartPageContent(docid: string): Promise<string> {
  const result = await callApi<{ ok: boolean; content: string; format: string; error?: string }>(
    'wecom_smartpage_content', docid,
  );
  if (!result.ok) throw new Error(result.error || 'Failed to read smartpage content');
  return result.content;
}

/** 获取智能表格结构（子表列表 + 各子表字段） */
export async function getWeComSmartsheetStructure(docid: string): Promise<WeComSmartsheetStructure> {
  const result = await callApi<{
    ok: boolean;
    sheets: WeComSheetInfo[];
    fields: Record<string, WeComFieldInfo[]>;
    error?: string;
  }>('wecom_smartsheet_structure', docid);
  if (!result.ok) throw new Error(result.error || 'Failed to get smartsheet structure');
  return { sheets: result.sheets, fields: result.fields };
}

/** 获取智能表格数据 */
export async function getWeComSmartsheetData(docid: string, sheetId: string): Promise<WeComSheetData> {
  const result = await callApi<{ ok: boolean; data: WeComSheetData; error?: string }>(
    'wecom_smartsheet_data', docid, sheetId,
  );
  if (!result.ok) throw new Error(result.error || 'Failed to get smartsheet data');
  return result.data;
}

// ===================== URL 解析工具 =====================

/** 判断是否为企业文档 URL */
export function isWeComDocUrl(url: string): boolean {
  return /doc\.weixin\.qq\.com\/(doc|smartsheet|smartpage)\//.test(url);
}

/** 从企业文档 URL 提取 docid */
export function extractWeComDocIdFromUrl(url: string): string {
  const match = url.match(/doc\.weixin\.qq\.com\/(doc|smartsheet|smartpage)\/([A-Za-z0-9_-]+)/);
  if (match) return match[2];
  // 如果直接传入 docid（纯字母数字下划线连字符）
  if (/^[A-Za-z0-9_-]+$/.test(url)) return url;
  return '';
}

/** 从企业文档 URL 判断品类 */
export function getWeComDocCategoryFromUrl(url: string): WeComDocCategory {
  if (url.includes('/smartsheet/')) return 'smartsheet';
  if (url.includes('/smartpage/')) return 'smartpage';
  if (url.includes('/doc/')) return 'doc';
  return 'doc'; // 默认
}

/** 品类中文标签 */
export function getWeComCategoryLabel(category: WeComDocCategory): string {
  switch (category) {
    case 'smartsheet': return '智能表格';
    case 'smartpage': return '智能文档';
    case 'doc': return '文档';
  }
}

// ===================== 数据转换 =====================

/**
 * 将 wecom 智能表格数据转换为统一的表格渲染格式
 */
export function convertWeComSheetToTable(
  fields: WeComFieldInfo[],
  records: WeComRecord[],
): { headers: string[]; rows: string[][] } {
  const headers = fields.map((f) => f.field_title);
  const rows = records.map((record) =>
    fields.map((field) => {
      const cellValues = record.values[field.field_title];
      if (!cellValues || !Array.isArray(cellValues)) return '';
      return cellValues.map((cv) => cv.text || '').join(', ');
    }),
  );
  return { headers, rows };
}

/**
 * 将 wecom 智能表格数据按字段 ID (field_id) 匹配（用于 key_type=FIELD_ID 场景）
 */
export function convertWeComSheetToTableById(
  fields: WeComFieldInfo[],
  records: WeComRecord[],
): { headers: string[]; rows: string[][] } {
  const headers = fields.map((f) => f.field_title);
  // 建立 field_id → field_title 的映射
  const idToTitle: Record<string, string> = {};
  for (const f of fields) {
    idToTitle[f.field_id] = f.field_title;
  }

  const rows = records.map((record) =>
    fields.map((field) => {
      // 同时尝试 field_id 和 field_title 作为 key
      const cellValues =
        record.values[field.field_id] || record.values[field.field_title];
      if (!cellValues || !Array.isArray(cellValues)) return '';
      return cellValues.map((cv) => cv.text || '').join(', ');
    }),
  );
  return { headers, rows };
}
