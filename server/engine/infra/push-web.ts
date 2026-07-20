// 移植自 openclaw/src/infra/push-web.ts
// 降级：web-push / VAPID 依赖简化

export type VapidKeys = {
  publicKey: string;
  privateKey: string;
  subject?: string;
};

export type WebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  agentId?: string;
  createdAtMs?: number;
};

const subscriptions = new Map<string, WebPushSubscription>();

/** Resolves VAPID keys from config or generates new ones. */
export function resolveVapidKeys(cfg?: { vapidPublicKey?: string; vapidPrivateKey?: string; vapidSubject?: string }): VapidKeys | null {
  if (cfg?.vapidPublicKey?.trim() && cfg?.vapidPrivateKey?.trim()) {
    return { publicKey: cfg.vapidPublicKey.trim(), privateKey: cfg.vapidPrivateKey.trim(), subject: cfg.vapidSubject?.trim() };
  }
  // Cannot generate without web-push crypto
  return null;
}

/** Registers a web push subscription. */
export function registerWebPushSubscription(params: {
  subscription: WebPushSubscription;
  agentId?: string;
}): { ok: boolean } {
  if (!params.subscription?.endpoint?.trim()) return { ok: false };
  subscriptions.set(params.subscription.endpoint, {
    ...params.subscription,
    agentId: params.agentId,
    createdAtMs: Date.now(),
  });
  return { ok: true };
}

/** Lists all web push subscriptions. */
export function listWebPushSubscriptions(): WebPushSubscription[] {
  return [...subscriptions.values()];
}

/** Clears a web push subscription by endpoint. */
export function clearWebPushSubscriptionByEndpoint(endpoint: string): boolean {
  return subscriptions.delete(endpoint);
}

/** Broadcasts a web push notification. Simplified without web-push library. */
export async function broadcastWebPush(params: {
  payload: Record<string, unknown>;
  vapidKeys?: VapidKeys;
  agentId?: string;
}): Promise<{ sent: number; failed: number }> {
  // web-push library not available
  return { sent: 0, failed: subscriptions.size };
}
