export type ChildSessionInfo = {
  sessionKey: string;
  parentSessionKey: string;
  spawnedAt: number;
  spawnedBy?: string;
  role?: string;
  status?: 'active' | 'completed' | 'failed' | 'interrupted';
};

const childSessionsMap = new Map<string, ChildSessionInfo[]>();
const parentSessionsMap = new Map<string, string>();

export function registerChildSession(params: {
  childSessionKey: string;
  parentSessionKey: string;
  spawnedBy?: string;
  role?: string;
}): ChildSessionInfo {
  const childInfo: ChildSessionInfo = {
    sessionKey: params.childSessionKey,
    parentSessionKey: params.parentSessionKey,
    spawnedAt: Date.now(),
    spawnedBy: params.spawnedBy,
    role: params.role,
    status: 'active',
  };

  const children = childSessionsMap.get(params.parentSessionKey) ?? [];
  children.push(childInfo);
  childSessionsMap.set(params.parentSessionKey, children);
  parentSessionsMap.set(params.childSessionKey, params.parentSessionKey);

  return childInfo;
}

export function getChildSessions(parentSessionKey: string): ChildSessionInfo[] {
  return childSessionsMap.get(parentSessionKey) ?? [];
}

export function getChildSessionKeys(parentSessionKey: string): string[] {
  return getChildSessions(parentSessionKey).map((child) => child.sessionKey);
}

export function getParentSessionKey(childSessionKey: string): string | undefined {
  return parentSessionsMap.get(childSessionKey);
}

export function updateChildSessionStatus(
  childSessionKey: string,
  status: ChildSessionInfo['status'],
): void {
  const parentKey = parentSessionsMap.get(childSessionKey);
  if (!parentKey) return;

  const children = childSessionsMap.get(parentKey);
  if (!children) return;

  const child = children.find((c) => c.sessionKey === childSessionKey);
  if (child) {
    child.status = status;
  }
}

export function hasActiveChildSessions(parentSessionKey: string): boolean {
  const children = getChildSessions(parentSessionKey);
  return children.some((child) => child.status === 'active');
}

export function getSessionDepth(sessionKey: string): number {
  let depth = 0;
  let current = sessionKey;
  const visited = new Set<string>();

  while (true) {
    const parent = parentSessionsMap.get(current);
    if (!parent || visited.has(parent)) break;
    visited.add(parent);
    depth++;
    current = parent;
  }

  return depth;
}

export function clearChildSessionRelations(sessionKey: string): void {
  const parentKey = parentSessionsMap.get(sessionKey);
  if (parentKey) {
    const children = childSessionsMap.get(parentKey);
    if (children) {
      const filtered = children.filter((c) => c.sessionKey !== sessionKey);
      if (filtered.length > 0) {
        childSessionsMap.set(parentKey, filtered);
      } else {
        childSessionsMap.delete(parentKey);
      }
    }
    parentSessionsMap.delete(sessionKey);
  }

  const children = childSessionsMap.get(sessionKey);
  if (children) {
    for (const child of children) {
      parentSessionsMap.delete(child.sessionKey);
    }
    childSessionsMap.delete(sessionKey);
  }
}
