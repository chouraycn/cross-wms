/**
 * 自动化通知器
 *
 * 监听 automation 事件，根据每个 automation 的 notificationConfig
 * 通过配置的渠道（in-app / webhook / desktop）发送通知。
 *
 * 用法（在 engine.ts 启动时调用一次）：
 *   import { initNotifier, destroyNotifier } from './notifier.js';
 *   initNotifier();
 *   // 关闭时
 *   destroyNotifier();
 */

import eventBus, {
  AutomationEventType,
  type AutomationEventPayload,
  onAutomationEvent,
} from './eventBus.js';
import { getAutomationById } from '../dao/automationDao.js';

// ===================== 本地类型定义 =====================

/** 通知渠道 */
type NotificationChannel = 'in-app' | 'webhook' | 'desktop';

/** 通知配置（与前端 types.ts 保持一致） */
interface NotificationConfig {
  channels: NotificationChannel[];
  webhookUrl?: string;
  onSuccess: boolean;
  onFailure: boolean;
  template?: string;
}

// ===================== 模板变量替换 =====================

/**
 * 替换模板中的 {{variable}} 变量
 *
 * 支持变量：
 *   {{automationId}}  {{taskType}}  {{status}}  {{timestamp}}
 *   {{data}}  {{error}}  {{name}}  {{message}}
 */
function renderTemplate(
  template: string,
  payload: AutomationEventPayload,
  automationName: string,
): string {
  let result = template;
  const vars: Record<string, string> = {
    automationId: payload.automationId,
    taskType: payload.taskType,
    status: payload.status,
    timestamp: payload.timestamp,
    data: payload.data !== undefined ? JSON.stringify(payload.data) : '',
    error: payload.error ?? '',
    name: automationName,
    message: payload.data !== undefined
      ? JSON.stringify(payload.data)
      : payload.error ?? '',
  };

  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// ===================== 通知渠道实现 =====================

/**
 * in-app 通知：发布内部事件，由 WebSocket 推送到前端
 */
function sendInAppNotification(
  payload: AutomationEventPayload,
  automationName: string,
  template?: string,
): void {
  const message = template
    ? renderTemplate(template, payload, automationName)
    : `自动化「${automationName}」${payload.status === 'success' ? '执行成功' : '执行失败'}`;

  // 发布内部通知事件，WebSocket 处理器可监听此事件推送到前端
  eventBus.emit('notification:in-app', {
    automationId: payload.automationId,
    automationName,
    message,
    status: payload.status,
    timestamp: payload.timestamp,
  });
}

/**
 * Webhook 通知：POST 到用户配置的 webhookUrl
 */
async function sendWebhookNotification(
  webhookUrl: string,
  payload: AutomationEventPayload,
  automationName: string,
  template?: string,
): Promise<void> {
  const message = template
    ? renderTemplate(template, payload, automationName)
    : `[CrossWMS] 自动化「${automationName}」状态：${payload.status}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        automationId: payload.automationId,
        automationName,
        status: payload.status,
        message,
        timestamp: payload.timestamp,
        data: payload.data,
        error: payload.error,
      }),
      signal: controller.signal as AbortSignal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error(
        `[Notifier] Webhook 通知失败 (${res.status}):`,
        webhookUrl,
      );
    }
  } catch (err) {
    console.error('[Notifier] Webhook 通知异常:', err);
  }
}

/**
 * Desktop 通知：输出到服务器日志
 * （服务器环境无法弹出系统通知，由前端收到 in-app 事件后自行弹出）
 */
function sendDesktopNotification(
  payload: AutomationEventPayload,
  automationName: string,
  template?: string,
): void {
  const message = template
    ? renderTemplate(template, payload, automationName)
    : `自动化「${automationName}」${payload.status === 'success' ? '执行成功' : '执行失败'}`;

  console.log(
    `[Desktop Notification] ${message} (time: ${payload.timestamp})`,
  );
}

// ===================== 事件处理 =====================

/**
 * 判断该事件是否需要发送通知
 */
function shouldNotify(
  eventType: AutomationEventType,
  config: NotificationConfig,
): boolean {
  if (eventType === AutomationEventType.AUTOMATION_COMPLETED && config.onSuccess) return true;
  if (eventType === AutomationEventType.AUTOMATION_FAILED && config.onFailure) return true;
  // started / step 事件暂不触发通知（可扩展）
  return false;
}

/**
 * 核心事件处理：查询 automation 配置，按渠道发送通知
 */
async function handleAutomationEvent(
  eventType: AutomationEventType,
  payload: AutomationEventPayload,
): Promise<void> {
  try {
    const automation = getAutomationById(payload.automationId);
    if (!automation) return;

    const config = automation.notificationConfig as NotificationConfig | null;
    if (!config || !shouldNotify(eventType, config)) return;

    const name = automation.name ?? payload.automationId;

    const tasks = config.channels.map((channel) => {
      switch (channel) {
        case 'in-app':
          return Promise.resolve(sendInAppNotification(payload, name, config.template));
        case 'webhook':
          if (config.webhookUrl) {
            return sendWebhookNotification(
              config.webhookUrl,
              payload,
              name,
              config.template,
            );
          }
          return Promise.resolve();
        case 'desktop':
          return Promise.resolve(sendDesktopNotification(payload, name, config.template));
        default:
          return Promise.resolve();
      }
    });

    await Promise.allSettled(tasks);
  } catch (err) {
    console.error('[Notifier] 处理事件异常:', err);
  }
}

// ===================== 公开 API =====================

let initialized = false;
const unsubscribers: (() => void)[] = [];

/**
 * 初始化通知器，订阅自动化事件
 * 应在引擎启动时调用一次
 */
export function initNotifier(): void {
  if (initialized) {
    console.warn('[Notifier] 已初始化，跳过重复初始化');
    return;
  }
  initialized = true;

  // 只订阅 completed / failed 两个终结事件
  const events = [
    AutomationEventType.AUTOMATION_COMPLETED,
    AutomationEventType.AUTOMATION_FAILED,
  ] as const;

  for (const event of events) {
    const unsub = onAutomationEvent(event, (payload) => {
      // 异步处理，不阻塞事件循环
      handleAutomationEvent(event, payload).catch((err) => {
        console.error('[Notifier] handleAutomationEvent 异常:', err);
      });
    });
    unsubscribers.push(unsub);
  }

  console.log('[Notifier] 初始化完成，监听事件：', events);
}

/**
 * 销毁通知器，取消所有事件订阅
 * 应在引擎关闭时调用
 */
export function destroyNotifier(): void {
  for (const unsub of unsubscribers) {
    try { unsub(); } catch { /* ignore */ }
  }
  unsubscribers.length = 0;
  initialized = false;
  console.log('[Notifier] 已销毁');
}
