import { logger } from '../../logger.js';

export type ChannelTarget = {
  type: 'direct' | 'channel' | 'thread' | 'group';
  id: string;
  subId?: string;
};

export type TargetResolutionResult = {
  ok: boolean;
  target?: ChannelTarget;
  error?: string;
};

export function parseTarget(targetStr: string): TargetResolutionResult {
  if (!targetStr) {
    return { ok: false, error: 'Empty target' };
  }

  const parts = targetStr.split('/');
  const type = parts[0];

  if (type === 'dm' || type === 'direct') {
    return {
      ok: true,
      target: { type: 'direct', id: parts[1] ?? '' },
    };
  }

  if (type === 'channel') {
    return {
      ok: true,
      target: { type: 'channel', id: parts[1] ?? '', subId: parts[2] },
    };
  }

  if (type === 'thread') {
    return {
      ok: true,
      target: { type: 'thread', id: parts[1] ?? '', subId: parts[2] },
    };
  }

  if (type === 'group') {
    return {
      ok: true,
      target: { type: 'group', id: parts[1] ?? '' },
    };
  }

  logger.warn(`[Channels:Targets] Unknown target type: ${type}`);
  return { ok: false, error: `Unknown target type: ${type}` };
}

export function resolveTarget(target: ChannelTarget): string {
  switch (target.type) {
    case 'direct': return `dm/${target.id}`;
    case 'channel': return `channel/${target.id}${target.subId ? `/${target.subId}` : ''}`;
    case 'thread': return `thread/${target.id}${target.subId ? `/${target.subId}` : ''}`;
    case 'group': return `group/${target.id}`;
    default: return `${target.type}/${target.id}`;
  }
}

export function validateTarget(target: ChannelTarget): boolean {
  if (!target.id) return false;
  if (target.type === 'direct' || target.type === 'group') return true;
  if (target.type === 'channel' || target.type === 'thread') return true;
  return false;
}
