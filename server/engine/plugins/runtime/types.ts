// Re-export from parent
export * from "../types.js";

// openclaw compat: runtime types used by plugin-sdk/core.ts
// Minimal stubs until the full runtime is ported.

/** Trusted runtime logger surface (openclaw compat stub). */
export type RuntimeLogger = {
  debug?: (message: string, meta?: Record<string, any>) => void;
  info: (message: string, meta?: Record<string, any>) => void;
  warn: (message: string, meta?: Record<string, any>) => void;
  error: (message: string, meta?: Record<string, any>) => void;
};

/** Trusted in-process runtime surface injected into native plugins (openclaw compat stub). */
export type PluginRuntime = {
  subagent?: {
    run?: (params: any) => Promise<any>;
    waitForRun?: (params: any) => Promise<any>;
    getSessionMessages?: (params: any) => Promise<any>;
    deleteSession?: (params: any) => Promise<void>;
  };
  nodes?: {
    list?: (params?: any) => Promise<any>;
    invoke?: (params: any) => Promise<any>;
  };
  channel?: any;
  logger?: RuntimeLogger;
  [key: string]: any;
};
