// @ts-nocheck
// Proxyline stub: provides proxy lifecycle management for cross-wms.
// This is a minimal stub that satisfies the interface contract.

export type ProxylineUndiciOptions = {
  dispatcher?: unknown;
  [key: string]: unknown;
};

export type ProxylineHandle = {
  stop(): void;
  registerBypass(options: { url: string }): (() => void) | undefined;
};

export type ProxylineInstallOptions = {
  mode: string;
  proxyUrl: string;
  proxyTls?: unknown;
  ifActive?: string;
  undici?: ProxylineUndiciOptions;
};

export function installGlobalProxy(options: ProxylineInstallOptions): ProxylineHandle {
  const bypasses = new Map<string, Set<string>>();

  return {
    stop(): void {
      bypasses.clear();
    },
    registerBypass({ url }: { url: string }): (() => void) | undefined {
      const key = url;
      if (!bypasses.has(key)) {
        bypasses.set(key, new Set());
      }
      const entry = bypasses.get(key)!;
      const id = `bypass-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      entry.add(id);
      return () => {
        entry.delete(id);
        if (entry.size === 0) {
          bypasses.delete(key);
        }
      };
    },
  };
}
