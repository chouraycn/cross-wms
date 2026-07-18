// 移植自 openclaw/src/channels/plugins/directory-config-helpers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function applyDirectoryQueryAndLimit(..._args: unknown[]): unknown {
  throw new Error("not implemented: applyDirectoryQueryAndLimit");
}

export function toDirectoryEntries(..._args: unknown[]): unknown {
  throw new Error("not implemented: toDirectoryEntries");
}

export function collectNormalizedDirectoryIds(..._args: unknown[]): unknown {
  throw new Error("not implemented: collectNormalizedDirectoryIds");
}

export function listDirectoryEntriesFromSources(..._args: unknown[]): unknown {
  throw new Error("not implemented: listDirectoryEntriesFromSources");
}

export function listInspectedDirectoryEntriesFromSources(..._args: unknown[]): unknown {
  throw new Error("not implemented: listInspectedDirectoryEntriesFromSources");
}

export function createInspectedDirectoryEntriesLister(..._args: unknown[]): unknown {
  throw new Error("not implemented: createInspectedDirectoryEntriesLister");
}

export function listResolvedDirectoryEntriesFromSources(..._args: unknown[]): unknown {
  throw new Error("not implemented: listResolvedDirectoryEntriesFromSources");
}

export function createResolvedDirectoryEntriesLister(..._args: unknown[]): unknown {
  throw new Error("not implemented: createResolvedDirectoryEntriesLister");
}

export function listDirectoryUserEntriesFromAllowFrom(..._args: unknown[]): unknown {
  throw new Error("not implemented: listDirectoryUserEntriesFromAllowFrom");
}

export function listDirectoryUserEntriesFromAllowFromAndMapKeys(..._args: unknown[]): unknown {
  throw new Error("not implemented: listDirectoryUserEntriesFromAllowFromAndMapKeys");
}

export function listDirectoryGroupEntriesFromMapKeys(..._args: unknown[]): unknown {
  throw new Error("not implemented: listDirectoryGroupEntriesFromMapKeys");
}

export function listDirectoryGroupEntriesFromMapKeysAndAllowFrom(..._args: unknown[]): unknown {
  throw new Error("not implemented: listDirectoryGroupEntriesFromMapKeysAndAllowFrom");
}

export function listResolvedDirectoryUserEntriesFromAllowFrom(..._args: unknown[]): unknown {
  throw new Error("not implemented: listResolvedDirectoryUserEntriesFromAllowFrom");
}

export function listResolvedDirectoryGroupEntriesFromMapKeys(..._args: unknown[]): unknown {
  throw new Error("not implemented: listResolvedDirectoryGroupEntriesFromMapKeys");
}
