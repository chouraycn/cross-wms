import type { ChatType } from './types.js';

export function peerKindMatches(bindingKind: ChatType, scopeKind: ChatType): boolean {
  if (bindingKind === scopeKind) {
    return true;
  }
  return (
    (bindingKind === 'group' && scopeKind === 'channel') ||
    (bindingKind === 'channel' && scopeKind === 'group')
  );
}

export function normalizeChatType(value: string | undefined | null): ChatType | null {
  if (!value) return null;
  const lowered = String(value).trim().toLowerCase();
  if (lowered === 'direct' || lowered === 'dm' || lowered === 'private') {
    return 'direct';
  }
  if (lowered === 'group') {
    return 'group';
  }
  if (lowered === 'channel' || lowered === 'public') {
    return 'channel';
  }
  return null;
}
