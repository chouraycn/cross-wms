// Builds plugin API facades exposed to bundled and external plugins.
import type { OpenClawPluginApi } from "./types.js";

type PluginApiFacadeFields = Pick<
  OpenClawPluginApi,
  "agent" | "lifecycle" | "runContext" | "session"
>;
/** Plugin API shape without nested facade namespaces attached. */
export type OpenClawPluginApiWithoutFacades = Omit<OpenClawPluginApi, keyof PluginApiFacadeFields>;
type PluginApiFacadeSource = Pick<
  OpenClawPluginApi,
  | "clearRunContext"
  | "emitAgentEvent"
  | "enqueueNextTurnInjection"
  | "getRunContext"
  | "registerAgentEventSubscription"
  | "registerControlUiDescriptor"
  | "registerRuntimeLifecycle"
  | "registerSessionAction"
  | "registerSessionExtension"
  | "registerSessionSchedulerJob"
  | "scheduleSessionTurn"
  | "sendSessionAttachment"
  | "setRunContext"
  | "unscheduleSessionTurnsByTag"
>;

/** Attaches nested facade namespaces to the flat plugin API implementation. */
export function attachPluginApiFacades<T extends object>(
  api: T & PluginApiFacadeSource & Partial<PluginApiFacadeFields>,
): T & PluginApiFacadeFields {
  api.session = {
    state: {
      registerSessionExtension: (...args: unknown[]) => api.registerSessionExtension(...args as never[]),
    },
    workflow: {
      enqueueNextTurnInjection: (...args: unknown[]) => api.enqueueNextTurnInjection(...args as never[]),
      registerSessionSchedulerJob: (...args: unknown[]) => api.registerSessionSchedulerJob(...args as never[]),
      sendSessionAttachment: (...args: unknown[]) => api.sendSessionAttachment(...args as never[]),
      scheduleSessionTurn: (...args: unknown[]) => api.scheduleSessionTurn(...args as never[]),
      unscheduleSessionTurnsByTag: (...args: unknown[]) => api.unscheduleSessionTurnsByTag(...args as never[]),
    },
    controls: {
      registerSessionAction: (...args: unknown[]) => api.registerSessionAction(...args as never[]),
      registerControlUiDescriptor: (...args: unknown[]) => api.registerControlUiDescriptor(...args as never[]),
    },
  };
  api.agent = {
    events: {
      registerAgentEventSubscription: (...args: unknown[]) => api.registerAgentEventSubscription(...args as never[]),
      emitAgentEvent: (...args: unknown[]) => api.emitAgentEvent(...args as never[]),
    },
  };
  api.runContext = {
    setRunContext: (...args: unknown[]) => api.setRunContext(...args as never[]),
    getRunContext: (...args: unknown[]) => api.getRunContext(...args as never[]),
    clearRunContext: (...args: unknown[]) => api.clearRunContext(...args as never[]),
  };
  api.lifecycle = {
    registerRuntimeLifecycle: (...args: unknown[]) => api.registerRuntimeLifecycle(...args as never[]),
  };
  return api as T & PluginApiFacadeFields;
}
