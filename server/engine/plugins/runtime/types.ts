// Re-export from parent
export * from "../types.js";

// openclaw compat: runtime types used by plugin-sdk/core.ts
// Minimal stubs until the full runtime is ported.

/** Trusted runtime logger surface (openclaw compat stub). */
export type RuntimeLogger = {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

/** Trusted in-process runtime surface injected into native plugins (openclaw compat stub). */
export type PluginRuntime = {
  subagent?: {
    run?: (params: unknown) => Promise<unknown>;
    waitForRun?: (params: unknown) => Promise<unknown>;
    getSessionMessages?: (params: unknown) => Promise<unknown>;
    deleteSession?: (params: unknown) => Promise<void>;
  };
  nodes?: {
    list?: (params?: unknown) => Promise<unknown>;
    invoke?: (params: unknown) => Promise<unknown>;
  };
  channel?: unknown;
  logger?: RuntimeLogger;
  [key: string]: unknown;
};
