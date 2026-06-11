/**
 * 统一的会话存储模块
 *
 * 以 localStorage 为唯一真相源（Single Source of Truth），
 * 提供 load / save / subscribe 能力，消除 ChatPage / CrossWmsChat / SessionReferenceSelector
 * 三个组件各自维护 localStorage 读取逻辑的不一致问题。
 *
 * @version 1.9.0
 */

import type { Session } from '../types/chat';

/** localStorage key — 与历史版本保持兼容 */
export const SESSIONS_STORAGE_KEY = 'cdf-know-clow-chat-sessions';

/** 最大会话保存数量 */
export const MAX_SESSIONS = 20;

// ===================== 序列化 / 反序列化 =====================

/**
 * 从 localStorage 加载会话列表
 *
 * 反序列化时将 ISO 字符串恢复为 Date 对象。
 * 数据损坏时静默返回空数组。
 */
export function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((s: Record<string, unknown>) => ({
          ...s,
          messages: Array.isArray(s.messages)
            ? s.messages.map((m: Record<string, unknown>) => ({
                ...m,
                timestamp: new Date(m.timestamp as string),
              }))
            : [],
          // 确保 title/updatedAt 存在
          title: typeof s.title === 'string' ? s.title : '',
          updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : typeof s.createdAt === 'string' ? s.createdAt : undefined,
        })) as Session[];
      }
    }
  } catch {
    // 数据损坏时静默返回空数组
  }
  return [];
}

/**
 * 保存会话列表到 localStorage
 *
 * 序列化时将 Date 转为 ISO 字符串。
 * 仅保留最近 MAX_SESSIONS 条会话。
 * 超出配额时发出 storage-warning 事件。
 */
export function saveSessions(sessions: Session[]): void {
  try {
    const serializable = sessions.slice(0, MAX_SESSIONS).map((s) => ({
      ...s,
      messages: s.messages.map((m) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
    }));
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(serializable));
    // 写入后清除缓存，确保下次 getSessionsSnapshot 重新解析
    cachedRaw = null;
  } catch (e) {
    console.error(`[${SESSIONS_STORAGE_KEY}] 保存失败:`, e);
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      window.dispatchEvent(new CustomEvent('cdf-know-clow-storage-warning', {
        detail: { key: SESSIONS_STORAGE_KEY },
      }));
    }
  }
}

/**
 * 创建新空会话
 *
 * @param defaultModel - 默认模型 ID，默认 'auto'
 */
export function createNewSession(defaultModel?: string): Session {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    model: defaultModel || 'auto',
    messages: [],
  };
}

// ===================== useSyncExternalStore 支持 =====================

/** 会话变更事件名（用于组件间同步） */
export const SESSIONS_UPDATED_EVENT = 'cdf-know-clow-chat-updated';

/**
 * 快照缓存：避免 getSessionsSnapshot 每次调用都 JSON.parse 产生新引用，
 * 导致 useSyncExternalStore 触发无限重渲染。
 */
let cachedRaw: string | null = null;
let cachedSessions: Session[] = [];

/**
 * 通知其他组件会话数据已更新
 *
 * 在 saveSessions 之后调用，触发 useSyncExternalStore 订阅者重新读取。
 */
export function notifySessionsUpdated(): void {
  window.dispatchEvent(new CustomEvent(SESSIONS_UPDATED_EVENT));
}

/**
 * 保存并通知：一步完成"写入 localStorage + 广播更新事件"
 *
 * 推荐使用此函数替代手动调用 saveSessions + notifySessionsUpdated。
 */
export function saveAndNotify(sessions: Session[]): void {
  saveSessions(sessions);
  notifySessionsUpdated();
}

// ===================== 内部订阅管理 =====================

type Listener = () => void;

/** 当前活跃的订阅者列表 */
const listeners: Listener[] = [];

/** 触发所有订阅者重新读取 */
function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

// 监听 localStorage storage 事件（跨标签页同步）
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === SESSIONS_STORAGE_KEY) {
      emitChange();
    }
  });

  // 监听自定义事件（同标签页内组件间同步）
  window.addEventListener(SESSIONS_UPDATED_EVENT, () => {
    emitChange();
  });
}

/**
 * 订阅会话变更 — 兼容 useSyncExternalStore API
 *
 * @param listener - 变更回调
 * @returns 取消订阅函数
 */
export function subscribeSessions(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) {
      listeners.splice(idx, 1);
    }
  };
}

/**
 * 获取当前会话快照 — 兼容 useSyncExternalStore API
 *
 * 使用缓存机制：只有 localStorage 中的原始字符串变化时才重新解析，
 * 否则返回上一次的数组引用，避免 useSyncExternalStore 因引用不同而无限重渲染。
 */
export function getSessionsSnapshot(): Session[] {
  const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSessions = loadSessions();
  }
  return cachedSessions;
}

/**
 * 获取服务端渲染快照（SSR fallback）
 */
export function getSessionsServerSnapshot(): Session[] {
  return [];
}

// ===================== 会话标题自动生成 =====================

/**
 * 基于首条用户消息内容生成会话标题
 *
 * 规则（按优先级匹配）：
 * - 包含"库存" → "库存查询"
 * - 包含"入库"或"出库" → "出入库分析"
 * - 包含"报表"或"统计" → "报表分析"
 * - 包含"补货" → "补货建议"
 * - 包含"盘点" → "盘点查询"
 * - 否则取前 10 个字符 + "..."
 *
 * 额外使用轻量级规则提取名词短语，提升标题可读性。
 */
export function generateSessionTitle(session: Session): string {
  const firstUserMsg = session.messages.find((m) => m.role === 'user');
  if (!firstUserMsg) return '新对话';

  const content = firstUserMsg.content.trim();
  if (!content) return '新对话';

  // 1. 关键词规则匹配（优先级最高）
  if (/库存/.test(content)) return '库存查询';
  if (/入库|出库/.test(content)) return '出入库分析';
  if (/报表|统计/.test(content)) return '报表分析';
  if (/补货/.test(content)) return '补货建议';
  if (/盘点/.test(content)) return '盘点查询';

  // 2. 轻量级名词短语提取：尝试提取"动词 + 名词"或"名词 + 名词"结构
  // 匹配常见业务名词短语（2-4 字）
  const nounPhraseMatch = content.match(
    /(查询|查看|分析|统计|生成|导出|盘点|预警|监控|对比|审核|确认|处理|调整|同步|导入|导出|创建|更新|删除|设置|配置|管理|分配|调拨|退库|报废|质检|复核|上架|下架|移库|封仓|解封|冻结|解冻)[\s\u4e00-\u9fa5]{1,4}/
  );
  if (nounPhraseMatch) {
    const phrase = nounPhraseMatch[0].replace(/\s+/g, '').slice(0, 5);
    if (phrase.length >= 3) return phrase;
  }

  // 3. 回退：取前 10 个字符 + "..."
  return content.slice(0, 10) + (content.length > 10 ? '...' : '');
}

// ===================== 会话导出功能 =====================

/**
 * 将会话导出为 Markdown 格式
 *
 * 格式：
 * # 会话标题
 * 导出时间：YYYY-MM-DD HH:mm:ss
 *
 * ---
 *
 * ## 消息 1
 * **角色**：用户
 * **时间**：2024-01-01 10:00:00
 *
 * 消息内容...
 */
export function exportSessionToMarkdown(session: Session): string {
  const now = new Date().toLocaleString('zh-CN');
  const title = session.title || '未命名会话';

  let markdown = `# ${title}\n\n`;
  markdown += `**导出时间**：${now}\n\n`;
  markdown += `**消息数量**：${session.messages.length}\n\n`;
  markdown += `---\n\n`;

  session.messages.forEach((msg, index) => {
    const roleText = msg.role === 'user' ? '用户' : 'AI 助手';
    const timeText = msg.timestamp.toLocaleString('zh-CN');

    markdown += `## 消息 ${index + 1}\n\n`;
    markdown += `- **角色**：${roleText}\n`;
    markdown += `- **时间**：${timeText}\n`;
    if (msg.model) {
      markdown += `- **模型**：${msg.model}\n`;
    }
    markdown += `\n`;
    markdown += `${msg.content}\n\n`;
    markdown += `---\n\n`;
  });

  return markdown;
}

/**
 * 将会话导出为 JSON 格式
 *
 * 包含完整的会话数据，可用于备份或迁移
 */
export function exportSessionToJSON(session: Session): string {
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    session: {
      ...session,
      messages: session.messages.map((m) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
    },
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * 创建 Blob 并触发浏览器下载
 *
 * @param content - 文件内容
 * @param filename - 下载文件名
 * @param mimeType - MIME 类型
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
