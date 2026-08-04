/**
 * Push Gateway Methods — 推送通知 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/push.ts
 * - 精简版：push.test / push.web.vapidPublicKey / push.web.subscribe / push.web.unsubscribe
 * - 内存存储 Web Push 订阅（生产环境应使用数据库）
 * - VAPID 密钥在模块加载时生成（进程级，不持久化）
 */

import { createECDH } from 'node:crypto';
import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { logger } from '../logger.js';

type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// ==================== VAPID 密钥 ====================

interface VapidKeyPair {
  publicKey: string;   // Base64url 编码的未压缩公钥（65 字节，0x04 前缀）
  privateKey: string;  // Base64url 编码的私钥（32 字节）
}

function generateVapidKeyPair(): VapidKeyPair {
  // Web Push 使用 NIST P-256 曲线（_prime256v1 / secp256r1）
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  // 公钥以未压缩格式导出（0x04 || X || Y，共 65 字节）
  const publicKeyBytes = ecdh.getPublicKey('buffer') as Buffer;
  const privateKeyBytes = ecdh.getPrivateKey() as Buffer;
  return {
    publicKey: publicKeyBytes.toString('base64url'),
    privateKey: privateKeyBytes.toString('base64url'),
  };
}

// 模块加载时生成稳定的 VAPID 密钥对
const VAPID_KEYS: VapidKeyPair = generateVapidKeyPair();

// ==================== Web Push 订阅存储 ====================

interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  /** 关联用户 / 设备标识 */
  userId?: string;
  /** 订阅时间戳 */
  subscribedAt: number;
}

// 内存存储：以 endpoint 为 key（一个 endpoint 唯一对应一个订阅）
const subscriptions = new Map<string, WebPushSubscription>();

// ==================== Push Test ====================

async function pushTest(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as {
    endpoint?: string;
    userId?: string;
    title?: string;
    body?: string;
  };

  const title = typeof p.title === 'string' && p.title.trim()
    ? p.title.trim().slice(0, 200)
    : 'Test notification';
  const body = typeof p.body === 'string' && p.body
    ? p.body.slice(0, 1000)
    : 'This is a test push notification from cross-wms gateway.';

  // 若指定了 endpoint，尝试匹配现有订阅
  let target: WebPushSubscription | null = null;
  if (typeof p.endpoint === 'string' && p.endpoint.trim()) {
    target = subscriptions.get(p.endpoint) ?? null;
  } else if (typeof p.userId === 'string' && p.userId.trim()) {
    // 取该用户的第一个订阅
    for (const sub of subscriptions.values()) {
      if (sub.userId === p.userId) {
        target = sub;
        break;
      }
    }
  }

  // 精简版：不实际调用 Web Push 协议发送（需要 web-push 库与 VAPID JWT 签名）
  // 仅记录意图并返回模拟结果
  const sentAt = Date.now();
  const deliverTo = target
    ? { endpoint: target.endpoint, matched: true as const }
    : { endpoint: p.endpoint ?? null, matched: false as const };

  logger.info(
    `[gateway] push.test: title="${title}" target=${deliverTo.endpoint ?? 'none'}`,
  );

  return {
    ok: true,
    sentAt,
    title,
    body,
    delivered: false, // 精简版不实际投递
    target: deliverTo,
    note: 'push.test is a no-op stub in this build; wire to a web-push provider to deliver',
  };
}

// ==================== Push Web VAPID Public Key ====================

async function pushWebVapidPublicKey(_params: unknown, _ctx: GatewayMethodContext) {
  return {
    ok: true,
    publicKey: VAPID_KEYS.publicKey,
    ts: Date.now(),
  };
}

// ==================== Push Web Subscribe ====================

async function pushWebSubscribe(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userId?: string;
  };

  if (typeof p.endpoint !== 'string' || !p.endpoint.trim()) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'endpoint is required' },
    };
  }
  if (
    !p.keys
    || typeof p.keys.p256dh !== 'string' || !p.keys.p256dh
    || typeof p.keys.auth !== 'string' || !p.keys.auth
  ) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'keys.p256dh and keys.auth are required' },
    };
  }

  const endpoint = p.endpoint.trim();
  const now = Date.now();
  const subscription: WebPushSubscription = {
    endpoint,
    keys: {
      p256dh: p.keys.p256dh,
      auth: p.keys.auth,
    },
    userId: typeof p.userId === 'string' && p.userId.trim() ? p.userId.trim() : undefined,
    subscribedAt: now,
  };

  const existed = subscriptions.has(endpoint);
  subscriptions.set(endpoint, subscription);

  return {
    ok: true,
    action: existed ? ('updated' as const) : ('created' as const),
    endpoint,
    subscribedAt: now,
    totalSubscriptions: subscriptions.size,
  };
}

// ==================== Push Web Unsubscribe ====================

async function pushWebUnsubscribe(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as {
    endpoint?: string;
    userId?: string;
  };

  let removed = 0;

  if (typeof p.endpoint === 'string' && p.endpoint.trim()) {
    const endpoint = p.endpoint.trim();
    if (subscriptions.delete(endpoint)) {
      removed++;
    }
  } else if (typeof p.userId === 'string' && p.userId.trim()) {
    const userId = p.userId.trim();
    for (const [endpoint, sub] of subscriptions) {
      if (sub.userId === userId) {
        subscriptions.delete(endpoint);
        removed++;
      }
    }
  } else {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'endpoint or userId is required' },
    };
  }

  return {
    ok: true,
    removed,
    totalSubscriptions: subscriptions.size,
  };
}

/**
 * 注册所有 Push 域方法
 */
export function registerPushMethods(registry: GatewayMethodRegistry): void {
  registry.register('push.test', pushTest);
  registry.register('push.web.vapidPublicKey', pushWebVapidPublicKey);
  registry.register('push.web.subscribe', pushWebSubscribe);
  registry.register('push.web.unsubscribe', pushWebUnsubscribe);
}
