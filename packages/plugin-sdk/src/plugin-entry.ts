import { emptyPluginConfigSchema } from './types';
import type {
  PluginDefinition,
  PluginConfigSchema,
  RegistrationMode,
  PluginApi,
  PluginLifecycleContext,
} from './types';

export interface DefinePluginEntryOptions {
  id: string;
  name: string;
  description: string;
  configSchema?: PluginConfigSchema | (() => PluginConfigSchema);
  registrationMode?: RegistrationMode;
  register: (api: PluginApi) => void | Promise<void>;
  setup?: (ctx: PluginLifecycleContext) => Promise<void> | void;
}

export type DefinedPluginEntry = PluginDefinition;

function createCachedLazyValueGetter<T>(factory: (() => T) | T): () => T {
  let cached: T | undefined;
  let computed = false;
  return () => {
    if (!computed) {
      cached = typeof factory === 'function' ? (factory as () => T)() : factory;
      computed = true;
    }
    return cached as T;
  };
}

export function definePluginEntry({
  id,
  name,
  description,
  configSchema = emptyPluginConfigSchema,
  registrationMode = 'full',
  register,
  setup,
}: DefinePluginEntryOptions): DefinedPluginEntry {
  if (!id || typeof id !== 'string') {
    throw new Error('definePluginEntry: id is required and must be a string');
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`definePluginEntry: id must match /^[a-z0-9-]+$/, got: ${id}`);
  }
  if (typeof register !== 'function') {
    throw new Error('definePluginEntry: register must be a function');
  }

  const getConfigSchema = createCachedLazyValueGetter(configSchema);

  return {
    id,
    name,
    description,
    get configSchema() {
      return getConfigSchema();
    },
    registrationMode,
    register,
    ...(setup ? { setup } : {}),
  };
}