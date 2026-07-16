import { networkInterfaces } from 'node:os';

export function pickPrimaryLanIPv4(): string | undefined {
  const interfaces = networkInterfaces();
  for (const name of ['en0', 'eth0', 'en1']) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return undefined;
}

export function normalizeHostHeader(host: string): string {
  let normalized = host.toLowerCase().trim();
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }
  const portIdx = normalized.lastIndexOf(':');
  if (portIdx > 0 && !normalized.includes('::')) {
    normalized = normalized.slice(0, portIdx);
  }
  return normalized.replace(/\.+$/, '');
}

export function isLoopbackAddress(ip: string): boolean {
  const lower = ip.toLowerCase().trim();
  return lower === '127.0.0.1' || lower === '::1' || lower.startsWith('127.');
}

export function isPrivateOrLoopbackAddress(ip: string): boolean {
  if (isLoopbackAddress(ip)) return true;
  return isPrivateIpv4(ip) || isPrivateIpv6(ip);
}

function isPrivateIpv4(ip: string): boolean {
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe80:')) return true;
  return false;
}

export function resolveClientIp(params: {
  remoteAddr?: string;
  forwardedFor?: string;
  realIp?: string;
  trustedProxies?: string[];
  allowRealIpFallback?: boolean;
}): string | undefined {
  const { remoteAddr, forwardedFor, realIp, trustedProxies, allowRealIpFallback } = params;
  if (!forwardedFor) {
    if (allowRealIpFallback && realIp) return realIp;
    return remoteAddr;
  }
  const hops = forwardedFor.split(',').map(s => s.trim()).filter(Boolean);
  if (hops.length === 0) return remoteAddr;
  if (!trustedProxies || trustedProxies.length === 0) return hops[0];
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!trustedProxies.includes(hops[i])) return hops[i];
  }
  return hops[0];
}

export function resolveRequestClientIp(
  req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } },
  trustedProxies?: string[],
  allowRealIpFallback?: boolean,
): string | undefined {
  const forwardedFor = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : undefined;
  const realIp = typeof req.headers['x-real-ip'] === 'string' ? req.headers['x-real-ip'] : undefined;
  return resolveClientIp({
    remoteAddr: req.socket?.remoteAddress,
    forwardedFor,
    realIp,
    trustedProxies,
    allowRealIpFallback,
  });
}

export function resolveGatewayBindHost(
  bind: 'loopback' | 'lan' | 'tailnet' | 'auto' | 'custom',
  customHost?: string,
): string {
  switch (bind) {
    case 'loopback': return '127.0.0.1';
    case 'lan': return '0.0.0.0';
    case 'tailnet': return '0.0.0.0';
    case 'auto': return '127.0.0.1';
    case 'custom': return customHost ?? '127.0.0.1';
    default: return '127.0.0.1';
  }
}

export function resolveGatewayListenHosts(bindHost: string): string[] {
  if (bindHost === '127.0.0.1') {
    return ['127.0.0.1'];
  }
  return [bindHost];
}

export function isSecureWebSocketUrl(url: string, opts?: { allowPrivateWs?: boolean }): boolean {
  if (url.startsWith('wss://')) return true;
  if (!url.startsWith('ws://')) return false;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (isLoopbackAddress(hostname)) return true;
    if (isPrivateOrLoopbackAddress(hostname)) return opts?.allowPrivateWs ?? false;
    if (hostname.endsWith('.ts.net') || hostname.endsWith('.local')) return true;
    return false;
  } catch {
    return false;
  }
}

export function isLocalishHost(host: string): boolean {
  const lower = host.toLowerCase();
  return isLoopbackAddress(lower) || lower.endsWith('.ts.net') || lower.endsWith('.local') || isPrivateOrLoopbackAddress(lower);
}
