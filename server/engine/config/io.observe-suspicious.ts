// 移植自 openclaw/src/config/io.observe-suspicious.ts
// 检测配置读取阶段的可疑变化（相对 last-known-good）。
//
// 降级说明：源文件依赖 ../utils.js 的 isRecord。此处内联等价实现。

/** 内联降级实现：判断是否为普通记录对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export type ConfigObserveSuspiciousBaseline = {
  bytes: number;
  hasMeta: boolean;
  gatewayMode: string | null;
};

function isUpdateChannelOnlyRoot(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'update') {
    return false;
  }
  const update = value.update;
  if (!isRecord(update)) {
    return false;
  }
  const updateKeys = Object.keys(update);
  return updateKeys.length === 1 && typeof update.channel === 'string';
}

export function resolveConfigObserveSuspiciousReasons(params: {
  bytes: number;
  hasMeta: boolean;
  gatewayMode: string | null;
  parsed: unknown;
  lastKnownGood?: ConfigObserveSuspiciousBaseline;
}): string[] {
  const reasons: string[] = [];
  const baseline = params.lastKnownGood;
  if (!baseline) {
    return reasons;
  }
  if (baseline.bytes >= 512 && params.bytes < Math.floor(baseline.bytes * 0.5)) {
    reasons.push(`size-drop-vs-last-good:${baseline.bytes}->${params.bytes}`);
  }
  if (baseline.hasMeta && !params.hasMeta) {
    reasons.push('missing-meta-vs-last-good');
  }
  if (baseline.gatewayMode && !params.gatewayMode) {
    reasons.push('gateway-mode-missing-vs-last-good');
  }
  if (baseline.gatewayMode && isUpdateChannelOnlyRoot(params.parsed)) {
    reasons.push('update-channel-only-root');
  }
  return reasons;
}
