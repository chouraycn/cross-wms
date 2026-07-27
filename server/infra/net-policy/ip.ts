export function isCanonicalDottedDecimalIPv4(value: string): boolean {
  if (typeof value !== 'string') return false;
  const parts = value.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const num = Number.parseInt(part, 10);
    return Number.isFinite(num) && num >= 0 && num <= 255 && String(num) === part;
  });
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const ipParts = ip.split('.').map(Number);
  const [network, prefix] = cidr.split('/');
  const prefixNum = Number(prefix);
  
  if (!prefixNum || prefixNum < 0 || prefixNum > 32) {
    return ip === cidr;
  }
  
  const networkParts = network.split('.').map(Number);
  const mask = ~((1 << (32 - prefixNum)) - 1);
  
  for (let i = 0; i < 4; i++) {
    if ((ipParts[i] & (mask >> ((3 - i) * 8))) !== (networkParts[i] & (mask >> ((3 - i) * 8)))) {
      return false;
    }
  }
  return true;
}

export function isLoopbackIpAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  const normalized = ip.trim().toLowerCase();
  if (normalized === '::1' || normalized === '[::1]') return true;
  const parts = normalized.split('.').map(Number);
  return parts.length === 4 && parts[0] === 127;
}

export function isPrivateOrLoopbackIpAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  if (isLoopbackIpAddress(ip)) return true;
  
  const normalized = ip.trim().toLowerCase();
  
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80:')) return true;
  
  const parts = normalized.split('.').map(Number);
  if (parts.length !== 4) return false;
  
  const [a, b] = parts;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254)
  );
}

export function normalizeIpAddress(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const trimmed = ip.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}