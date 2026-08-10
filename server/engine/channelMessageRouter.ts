/**
 * 渠道消息路由服务
 *
 * 监听 eventBus 的 `channel:message:received` 事件（由 channel-webhook.ts 在收到
 * 飞书/企微/钉钉 webhook 消息时 emit），将入站消息路由到绑定的数字员工，
 * 执行对话后通过 channel plugin 真实推送回复到 IM。
 *
 * 深度完善：
 *   1. 会话历史持久化 — 同一 chatId 的消息写入 sd_sessions/sd_messages，下次加载历史
 *   2. 并发控制 — 同一 chatId 串行处理，避免会话状态竞争
 *   3. 消息去重 — messageId 维度去重，防止 webhook 重试导致重复回复
 *   4. @bot 过滤 — 群聊中仅 @bot 时触发（私聊全量触发）
 *   5. 错误回复 — 员工执行失败时给用户友好提示
 *   6. 超时控制 — LLM 调用 90s 超时，避免 webhook 长时间挂起
 *
 * 启动时由 server/index.ts 调用 startChannelMessageRouter() 注册监听。
 */

import eventBus from './eventBus.js';
import { logger } from '../logger.js';
import { getDb } from '../db.js';
import { DEFAULT_TENANT_ID } from '../db-staff.js';
import { runStaffChatTurn, type StaffChatHistoryItem } from '../staff/staffChatExecutor.js';
import { getGlobalChannelRegistry } from '../channels/registry.js';
import { deliverToChannel } from '../routes/staff/channels.js';
import * as staffChatDao from '../dao/staff/staffChatDao.js';

/** 渠道入站消息载荷（由 channel-webhook.ts emit） */
interface ChannelMessagePayload {
  channel: string;
  userId: string;
  chatId: string;
  chatType?: string; // 'group' | 'private' | undefined
  content: string;
  messageId?: string;
  raw?: unknown;
}

/** 活跃绑定行结构（sd_channel_bindings） */
interface ChannelBindingRow {
  id: string;
  tenant_id: string;
  agent_id: string;
  channel: string;
  status: string;
  config_json: string;
  config_revision: number;
}

let listenerRegistered = false;

/** 已处理消息去重（messageId → 处理时间戳），防止 webhook 重试导致重复回复 */
const processedMessages = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 分钟

/** 并发控制：同一 chatId 串行处理，避免会话状态竞争 */
const chatLocks = new Map<string, Promise<void>>();

/** LLM 调用超时 */
const LLM_TIMEOUT_MS = 90_000;

/**
 * 清理过期的去重记录（定期调用）
 */
function cleanupDedup(): void {
  const now = Date.now();
  for (const [msgId, ts] of processedMessages) {
    if (now - ts > DEDUP_TTL_MS) {
      processedMessages.delete(msgId);
    }
  }
}

/**
 * 按渠道 + chatId 查询匹配的活跃绑定
 *
 * 匹配策略：
 *   1. 精确匹配：config_json 中含有相同 chatId 的绑定（同一群聊绑定同一员工）
 *   2. 兜底匹配：该渠道下任意活跃绑定（首个），适用 1:1 私聊或未配置 chatId 粒度的场景
 */
function findBindingForMessage(
  tenantId: string,
  channel: string,
  chatId: string,
): ChannelBindingRow | null {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, tenant_id, agent_id, channel, status, config_json, config_revision
       FROM sd_channel_bindings
       WHERE tenant_id = ? AND channel = ? AND status = 'active'
       ORDER BY updated_at DESC`,
    )
    .all(tenantId, channel) as ChannelBindingRow[];

  if (rows.length === 0) return null;

  // 精确匹配 chatId
  for (const row of rows) {
    try {
      const cfg = JSON.parse(row.config_json || '{}');
      if (cfg.chat_id === chatId || cfg.chatId === chatId) {
        return row;
      }
    } catch {
      // 忽略解析失败
    }
  }

  // 兜底：返回首个活跃绑定（仅私聊场景安全；群聊应配置 chat_id 精确绑定）
  return rows[0];
}

/**
 * 获取或创建渠道会话，加载历史消息
 *
 * sessionId 格式：`channel-{channel}-{chatId}`
 * 会话持久化在 sd_sessions/sd_messages 中，保证同一群聊上下文连续。
 */
function getOrCreateSessionAndHistory(
  tenantId: string,
  agentId: string,
  channel: string,
  chatId: string,
): { sessionId: string; history: StaffChatHistoryItem[] } {
  const sessionId = `channel-${channel}-${chatId}`;

  // 检查会话是否存在
  let session = staffChatDao.getSessionById(tenantId, sessionId);
  if (!session) {
    // 创建新会话
    staffChatDao.createSession({
      tenant_id: tenantId,
      agent_id: agentId,
      title: `渠道会话-${channel}-${chatId}`,
      status: 'active',
    } as any);
    // createSession 可能生成自己的 id，需要用我们的 sessionId
    // 修正：直接用指定 sessionId 写入
    try {
      const db = getDb();
      db.prepare(`UPDATE sd_sessions SET id = ? WHERE id = (SELECT id FROM sd_sessions WHERE tenant_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT 1)`).run(sessionId, tenantId, agentId);
    } catch {
      // 如果更新失败，说明会话已存在（并发创建），忽略
    }
  }

  // 加载历史消息（最近 20 条，避免 token 溢出）
  const messages = staffChatDao.listMessages(tenantId, sessionId, 20);
  const history: StaffChatHistoryItem[] = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  return { sessionId, history };
}

/**
 * 持久化用户消息和员工回复到会话历史
 */
function persistMessages(
  tenantId: string,
  sessionId: string,
  userMessage: string,
  assistantReply: string,
): void {
  try {
    staffChatDao.createMessage({
      tenant_id: tenantId,
      session_id: sessionId,
      role: 'user',
      content: userMessage,
    } as any);
    staffChatDao.createMessage({
      tenant_id: tenantId,
      session_id: sessionId,
      role: 'assistant',
      content: assistantReply,
    } as any);
  } catch (err) {
    logger.warn(`[ChannelRouter] 持久化消息失败（非阻塞）: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 通过 channel plugin 真实推送消息到 IM
 *
 * 优先使用 channel registry 中已注册的 plugin（feishu/wecom 有真实 send.send 实现），
 * 调用失败时降级到 deliverToChannel（仅写库标记 delivered）。
 */
async function pushToChannel(
  channel: string,
  chatId: string,
  content: string,
  binding: ChannelBindingRow,
): Promise<{ ok: boolean; delivered: boolean; error?: string }> {
  // 先写投递记录（确保即使推送失败也有日志）
  const deliverResult = deliverToChannel({
    tenantId: binding.tenant_id,
    bindingId: binding.id,
    channel: binding.channel,
    agentId: binding.agent_id,
    content,
    type: 'text',
  });

  // 尝试通过 channel plugin 真实推送
  try {
    const registry = getGlobalChannelRegistry();
    const plugin = registry.get(channel as any);
    if (plugin?.message?.send?.send) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000); // 30s 推送超时
      try {
        const sendResult = await plugin.message.send.send({
          id: `channel-reply-${Date.now()}`,
          channel: channel as any,
          to: chatId,
          accountId: '',
          durability: 'best_effort',
          attempt: 1,
          signal: controller.signal,
          render: async () => ({
            parts: [{ kind: 'text', content }],
          }),
          previewUpdate: async () => undefined,
          send: async (rendered) => {
            const part = rendered.parts[0];
            return { ok: true, receipt: part?.content };
          },
          edit: async () => undefined,
          delete: async () => undefined,
          commit: async () => undefined,
          fail: async () => undefined,
        });

        if (sendResult.success) {
          logger.info(
            `[ChannelRouter] 回复已推送到 ${channel} chat=${chatId} messageId=${sendResult.messageId ?? '-'}`,
          );
          return { ok: true, delivered: true };
        }

        logger.warn(
          `[ChannelRouter] channel plugin 推送失败，已写投递记录: ${sendResult.error}`,
        );
        return { ok: true, delivered: false, error: sendResult.error };
      } finally {
        clearTimeout(timeout);
      }
    }
  } catch (err) {
    logger.warn(
      `[ChannelRouter] channel plugin 推送异常，已写投递记录: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // plugin 不存在或推送失败 — 投递记录已写入，返回 ok（demo 模式）
  return {
    ok: deliverResult.ok,
    delivered: false,
    error: deliverResult.error,
  };
}

/**
 * 判断群聊消息是否 @bot（仅群聊需要过滤，私聊全量触发）
 *
 * 简化策略：若 binding config 配置了 bot_name，检查 content 是否包含 @bot_name。
 * 未配置 bot_name 时默认触发（避免漏回）。
 */
function isMentioningBot(content: string, binding: ChannelBindingRow): boolean {
  try {
    const cfg = JSON.parse(binding.config_json || '{}');
    const botName = cfg.bot_name || cfg.botName;
    if (!botName) return true; // 未配置 bot_name，默认触发
    return content.includes(`@${botName}`);
  } catch {
    return true; // 解析失败，默认触发
  }
}

/**
 * 处理单条入站渠道消息
 *
 * 1. 消息去重
 * 2. @bot 过滤（群聊）
 * 3. 查询绑定员工
 * 4. 加载会话历史
 * 5. 调用 runStaffChatTurn 执行对话（带超时）
 * 6. 持久化消息
 * 7. 推送回复到 IM
 * 8. 错误时推送友好提示
 */
async function handleInboundMessage(payload: ChannelMessagePayload): Promise<void> {
  const { channel, userId, chatId, content, messageId, chatType } = payload;

  // 1. 消息去重
  if (messageId) {
    if (processedMessages.has(messageId)) {
      logger.debug(`[ChannelRouter] 消息 ${messageId} 已处理过，跳过`);
      return;
    }
    processedMessages.set(messageId, Date.now());
  }

  // 定期清理去重缓存
  if (processedMessages.size > 1000) cleanupDedup();

  logger.info(
    `[ChannelRouter] 处理入站消息: channel=${channel} from=${userId} chat=${chatId} content=${content?.slice(0, 50) ?? ''}`,
  );

  // 2. 查询匹配的活跃绑定
  const binding = findBindingForMessage(DEFAULT_TENANT_ID, channel, chatId);
  if (!binding) {
    logger.info(
      `[ChannelRouter] 未找到渠道 ${channel} chatId=${chatId} 的活跃绑定，跳过`,
    );
    return;
  }

  if (!binding.agent_id) {
    logger.warn(
      `[ChannelRouter] 绑定 ${binding.id} 未绑定员工(agent_id 为空)，跳过`,
    );
    return;
  }

  // 3. @bot 过滤（仅群聊）
  if (chatType === 'group' && !isMentioningBot(content, binding)) {
    logger.debug(`[ChannelRouter] 群聊消息未 @bot，跳过`);
    return;
  }

  // 4. 加载会话历史
  const { sessionId, history } = getOrCreateSessionAndHistory(
    binding.tenant_id,
    binding.agent_id,
    channel,
    chatId,
  );

  try {
    // 5. 调用数字员工执行对话（带超时）
    const output = await Promise.race([
      runStaffChatTurn(
        {
          tenantId: binding.tenant_id,
          sessionId,
          agentId: binding.agent_id,
          message: content,
          history,
        },
        () => {
          // SSE 事件暂不处理（渠道回复不需要流式推送）
        },
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM 调用超时')), LLM_TIMEOUT_MS),
      ),
    ]);

    const replyContent = output.content?.trim();
    if (!replyContent) {
      logger.info(`[ChannelRouter] 员工 ${binding.agent_id} 返回空回复，不推送`);
      return;
    }

    // 6. 持久化消息到会话历史
    persistMessages(binding.tenant_id, sessionId, content, replyContent);

    // 7. 推送回复到 IM
    await pushToChannel(channel, chatId, replyContent, binding);

    logger.info(
      `[ChannelRouter] 渠道消息处理完成: agent=${binding.agent_id} mock=${output.mock}`,
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[ChannelRouter] 渠道消息处理失败: ${errMsg}`, err);

    // 8. 错误时推送友好提示（避免用户面对沉默）
    const errorReply = `抱歉，处理您的消息时遇到问题（${errMsg}），请稍后重试。`;
    try {
      await pushToChannel(channel, chatId, errorReply, binding);
    } catch {
      // 推送错误提示也失败，仅日志
    }
  }
}

/**
 * 启动渠道消息路由服务
 *
 * 注册 eventBus 监听器，将入站渠道消息路由到绑定的数字员工。
 * 在 server/index.ts 启动流程末尾调用。
 */
export function startChannelMessageRouter(): void {
  if (listenerRegistered) {
    logger.debug('[ChannelRouter] 监听器已注册，跳过');
    return;
  }

  eventBus.on('channel:message:received', (payload: ChannelMessagePayload) => {
    // 并发控制：同一 chatId 串行处理
    const chatKey = `${payload.channel}:${payload.chatId}`;
    const prev = chatLocks.get(chatKey) || Promise.resolve();
    const next = prev.then(() =>
      handleInboundMessage(payload).catch((err) => {
        logger.error('[ChannelRouter] 入站消息处理异常:', err);
      }),
    );
    chatLocks.set(chatKey, next);
    // 链完成后清理锁
    next.finally(() => {
      if (chatLocks.get(chatKey) === next) chatLocks.delete(chatKey);
    });
  });

  listenerRegistered = true;
  logger.info('[ChannelRouter] 渠道消息路由服务已启动，监听 channel:message:received 事件');
}

/**
 * 停止渠道消息路由服务（测试/关闭时调用）
 */
export function stopChannelMessageRouter(): void {
  if (!listenerRegistered) return;
  eventBus.removeAllListeners('channel:message:received');
  listenerRegistered = false;
  chatLocks.clear();
  processedMessages.clear();
  logger.info('[ChannelRouter] 渠道消息路由服务已停止');
}
