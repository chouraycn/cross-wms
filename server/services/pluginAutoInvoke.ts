/**
 * Plugin Auto-Invoke — reasoning 流触发器匹配引擎
 *
 * v3.0: 在 AI 思考流中检测已启用插件的 trigger 关键词，
 * 当匹配时返回 client_tool 事件，让前端/后端协作执行插件工具。
 *
 * 触发器定义在 plugin.json 的 triggers 数组中：
 * - 当前 schema 只有 keyword + description 字段
 * - 后续可扩展 type: 'keyword' | 'regex' | 'schema'
 *
 * 防重复触发：同一会话中，同一个关键词不应反复触发同一插件。
 * 通过 sessionTriggerHistory 维护 sessionId:pluginId:keyword → 已触发集合。
 */

import { listEnabledPlugins } from '../dao/plugins.js';
import { pluginRegistry } from '../engine/pluginRegistry.js';

// ===================== 类型定义 =====================

/** 触发器匹配结果 */
export interface TriggerMatch {
  /** 插件 ID */
  pluginId: string;
  /** 完整工具名，含 plugin_ 前缀 */
  toolName: string;
  /** 传递给工具的参数 */
  args: Record<string, unknown>;
  /** 匹配到的关键词 */
  matchedKeyword?: string;
  /** 匹配到的模式（未来正则匹配时使用） */
  matchedPattern?: string;
}

/** 已缓存的触发器映射（pluginId → triggers） */
interface CachedTriggers {
  /** 插件 ID */
  pluginId: string;
  /** manifest.name，用于构建 plugin_<name>_<tool> 工具名 */
  manifestName: string;
  /** 触发器列表 */
  triggers: Array<{
    /** 关键词 */
    keyword: string;
    /** 触发说明 */
    description: string;
    /** manifest 中的 tool name（不含前缀），当前 schema 暂为空 */
    toolName: string;
  }>;
}

// ===================== 缓存与防重复 =====================

/** 触发器缓存 */
let triggerCache: CachedTriggers[] = [];

/** 缓存时间戳 */
let triggerCacheTimestamp = 0;

/** 缓存 TTL：1 分钟 */
const TRIGGER_CACHE_TTL = 60_000;

/**
 * 会话级触发历史 — 防止同一会话中重复触发同一关键词
 * key: `${sessionId}:${pluginId}:${keyword}`
 * value: 触发时间戳
 */
const sessionTriggerHistory = new Map<string, number>();

/** 触发历史 TTL：5 分钟（同一关键词 5 分钟内不重复触发） */
const TRIGGER_HISTORY_TTL = 5 * 60_000;

// ===================== 内部函数 =====================

/**
 * 刷新触发器缓存（从 DB 加载已启用插件的 triggers）
 * 缓存 TTL 为 1 分钟，避免频繁查 DB
 */
async function refreshTriggerCache(): Promise<void> {
  const now = Date.now();
  if (now - triggerCacheTimestamp < TRIGGER_CACHE_TTL && triggerCache.length > 0) {
    return;
  }

  const enabledPlugins = listEnabledPlugins();
  const newCache: CachedTriggers[] = [];

  for (const plugin of enabledPlugins) {
    try {
      const manifest = JSON.parse(plugin.manifest_json || '{}');
      if (manifest.triggers && Array.isArray(manifest.triggers) && manifest.triggers.length > 0) {
        newCache.push({
          pluginId: plugin.id,
          manifestName: manifest.name,
          triggers: manifest.triggers.map((t: Record<string, unknown>) => ({
            keyword: String(t.keyword || ''),
            description: String(t.description || ''),
            toolName: String(t.toolName || ''),
          })),
        });
      }
    } catch {
      // 跳过解析失败的插件
    }
  }

  triggerCache = newCache;
  triggerCacheTimestamp = now;
}

/**
 * 清理过期的触发历史记录
 */
function cleanupTriggerHistory(): void {
  const now = Date.now();
  for (const [key, timestamp] of sessionTriggerHistory) {
    if (now - timestamp > TRIGGER_HISTORY_TTL) {
      sessionTriggerHistory.delete(key);
    }
  }
}

/**
 * 检查是否已触发过（防重复）
 * @param sessionId - 会话 ID
 * @param pluginId - 插件 ID
 * @param keyword - 匹配的关键词
 * @returns true 表示已触发过，应跳过
 */
function isAlreadyTriggered(sessionId: string, pluginId: string, keyword: string): boolean {
  const key = `${sessionId}:${pluginId}:${keyword}`;
  return sessionTriggerHistory.has(key);
}

/**
 * 记录触发历史
 * @param sessionId - 会话 ID
 * @param pluginId - 插件 ID
 * @param keyword - 匹配的关键词
 */
function markTriggered(sessionId: string, pluginId: string, keyword: string): void {
  const key = `${sessionId}:${pluginId}:${keyword}`;
  sessionTriggerHistory.set(key, Date.now());
}

// ===================== 公开 API =====================

/**
 * 匹配 reasoning 文本中的触发器
 *
 * @param reasoningText - 当前累积的 reasoning 内容
 * @param sessionId - 会话 ID（用于防重复触发）
 * @returns 匹配到的触发器列表
 */
export async function matchTriggers(
  reasoningText: string,
  sessionId: string
): Promise<TriggerMatch[]> {
  if (!reasoningText || reasoningText.length < 10) return [];

  await refreshTriggerCache();
  cleanupTriggerHistory();

  const matches: TriggerMatch[] = [];

  for (const cached of triggerCache) {
    for (const trigger of cached.triggers) {
      if (!trigger.keyword) continue;

      // 简单关键词匹配（大小写不敏感）
      if (reasoningText.toLowerCase().includes(trigger.keyword.toLowerCase())) {
        // 防重复触发：同一会话中同一关键词不重复触发同一插件
        if (isAlreadyTriggered(sessionId, cached.pluginId, trigger.keyword)) {
          continue;
        }

        // 构建完整工具名：plugin_<manifestName>_<toolName>
        // 如果 trigger 定义了 toolName，使用它；否则使用 manifest 的第一个工具
        let fullToolName: string;
        if (trigger.toolName) {
          fullToolName = `plugin_${cached.manifestName}_${trigger.toolName}`;
        } else {
          // 没有指定 toolName，尝试使用 manifest 的第一个工具
          try {
            const manifest = JSON.parse(
              listEnabledPlugins().find(p => p.id === cached.pluginId)?.manifest_json || '{}'
            );
            if (manifest.tools && manifest.tools.length > 0) {
              fullToolName = `plugin_${cached.manifestName}_${manifest.tools[0].name}`;
            } else {
              // 没有工具定义，使用通用名称
              fullToolName = `plugin_${cached.manifestName}`;
            }
          } catch {
            fullToolName = `plugin_${cached.manifestName}`;
          }
        }

        matches.push({
          pluginId: cached.pluginId,
          toolName: fullToolName,
          args: { keyword: trigger.keyword, reasoning: reasoningText.slice(-500) },
          matchedKeyword: trigger.keyword,
        });

        // 记录触发历史，防止重复
        markTriggered(sessionId, cached.pluginId, trigger.keyword);
      }
    }
  }

  return matches;
}

/**
 * 执行匹配到的插件工具
 *
 * @param match - 触发器匹配结果
 * @returns 插件执行结果
 */
export async function executePluginTrigger(match: TriggerMatch): Promise<{ output: string; durationMs: number }> {
  const startTime = Date.now();
  try {
    const result = await pluginRegistry.invokePluginTool(match.toolName, match.args);
    return {
      output: typeof result === 'string' ? result : JSON.stringify(result),
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      output: `[Plugin Error: ${errorMsg}]`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * 清除指定会话的触发历史（会话结束时调用）
 * @param sessionId - 会话 ID
 */
export function clearSessionTriggerHistory(sessionId: string): void {
  for (const key of sessionTriggerHistory.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      sessionTriggerHistory.delete(key);
    }
  }
}
