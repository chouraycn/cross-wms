import { logger } from "../../../logger.js";
import type { PluginSandboxOptions } from "./types.js";

export interface PluginSandbox {
  execute<T>(fn: () => T | Promise<T>): Promise<T>;
  release(): void;
}

const DEFAULT_OPTIONS: PluginSandboxOptions = {
  allowedGlobals: ["console", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  memoryLimitMb: 128,
  timeoutMs: 30000,
};

export function createSandbox(options: PluginSandboxOptions = {}): PluginSandbox {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  return {
    async execute<T>(fn: () => T | Promise<T>): Promise<T> {
      const timeoutMs = mergedOptions.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs!;

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Plugin execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      try {
        const result = await Promise.race([fn(), timeoutPromise]);
        return result;
      } catch (error) {
        logger.error("[ChannelPlugins:Sandbox] Execution error", { error });
        throw error;
      }
    },

    release(): void {
      logger.debug("[ChannelPlugins:Sandbox] Sandbox released");
    },
  };
}

export async function executeInSandbox<T>(
  fn: () => T | Promise<T>,
  sandbox: PluginSandbox
): Promise<T> {
  return sandbox.execute(fn);
}

export function createContextSanitizer(allowedGlobals: string[] = []) {
  return (context: Record<string, unknown>): Record<string, unknown> => {
    const sanitized: Record<string, unknown> = {};
    const allowed = new Set([...DEFAULT_OPTIONS.allowedGlobals!, ...allowedGlobals]);

    for (const [key, value] of Object.entries(context)) {
      if (allowed.has(key)) {
        sanitized[key] = value;
      } else {
        logger.debug(`[ChannelPlugins:Sandbox] Filtered global: ${key}`);
      }
    }

    return sanitized;
  };
}

export function createModuleLoader(allowedModules: string[] = []) {
  return (moduleName: string): unknown => {
    if (!allowedModules.includes(moduleName)) {
      throw new Error(`Module not allowed: ${moduleName}`);
    }

    try {
      return require(moduleName);
    } catch {
      throw new Error(`Failed to load module: ${moduleName}`);
    }
  };
}