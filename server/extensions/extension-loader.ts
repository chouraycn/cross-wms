// Minimal stub for extensionLoader used by metrics/routes/index entry points.
// Real implementation is provided at runtime by the plugins subsystem; this
// stub exists only so the type-checker can resolve the import during compile.

export interface ExtensionManifest {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export interface ExtensionLoadResult {
  id: string;
  ok: boolean;
  error?: string;
}

interface ExtensionLoader {
  list(): ExtensionManifest[];
  get(id: string): ExtensionManifest | undefined;
  discover(dir?: string): Promise<ExtensionManifest[]>;
  load(manifest: ExtensionManifest): Promise<ExtensionLoadResult>;
  loadAll(): Promise<number>;
  enable(id: string, config?: Record<string, unknown>): Promise<ExtensionLoadResult>;
  disable(id: string): Promise<ExtensionLoadResult>;
}

const noopExtensionLoader: ExtensionLoader = {
  list() {
    return [];
  },
  get() {
    return undefined;
  },
  async discover() {
    return [];
  },
  async load(manifest) {
    return { id: manifest.id, ok: true };
  },
  async loadAll() {
    return 0;
  },
  async enable(id) {
    return { id, ok: true };
  },
  async disable(id) {
    return { id, ok: true };
  },
};

export const extensionLoader: ExtensionLoader = noopExtensionLoader;
