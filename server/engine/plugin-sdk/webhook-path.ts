/**
 * Webhook 路径规整 — 将 webhook 路径规范化为绝对路径并去除尾部斜杠
 *
 * 空值统一解析为 `/`，便于路由注册与请求匹配使用同一规范键。
 *
 * 参考 openclaw/src/plugin-sdk/webhook-path.ts
 */

/**
 * 将插件 webhook 路径规范化为不带尾部斜杠的绝对路径。
 *
 * 空值返回 `/`，保证路由注册与请求匹配使用同一规范键。
 */
export function normalizeWebhookPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '/';
  }
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (withSlash.length > 1 && withSlash.endsWith('/')) {
    return withSlash.slice(0, -1);
  }
  return withSlash;
}

/**
 * 从显式路径配置、URL pathname、调用方默认值依次解析 webhook 路径。
 *
 * 无效的 webhook URL 返回 `null` 而不是猜测。
 */
export function resolveWebhookPath(params: {
  webhookPath?: string;
  webhookUrl?: string;
  defaultPath?: string | null;
}): string | null {
  const trimmedPath = params.webhookPath?.trim();
  if (trimmedPath) {
    return normalizeWebhookPath(trimmedPath);
  }
  if (params.webhookUrl?.trim()) {
    try {
      const parsed = new URL(params.webhookUrl);
      return normalizeWebhookPath(parsed.pathname || '/');
    } catch {
      return null;
    }
  }
  return params.defaultPath ?? null;
}
