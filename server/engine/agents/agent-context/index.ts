export { AgentContextSchema } from './types.js';
export type { AgentContext, ContextSnapshot, ContextPropagationOptions } from './types.js';

export {
  storeContext,
  getContext,
  removeContext,
  updateContext,
  getContextSnapshot,
  getContextHistory,
  clearAllContexts,
  listActiveContexts,
  countActiveContexts,
} from './context-store.js';

export {
  createContext,
  getOrCreateContext,
  cloneContext,
  mergeContext,
  updateContextValue,
  deleteContextValue,
  endContext,
  getContextDuration,
  getContextDebugInfo,
} from './context-manager.js';

export {
  serializeContext,
  deserializeContext,
  createContextHeaders,
  extractContextFromHeaders,
  propagateContext,
  createContextSnapshot,
} from './context-propagation.js';