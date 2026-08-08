// Builds plugin API facades exposed to bundled and external plugins.
import type { OpenClawPluginApi } from "./types.js";

export type PluginApiFacadeFields = Pick<
  OpenClawPluginApi,
  "agent" | "lifecycle" | "runContext" | "session"
>;
/** Plugin API shape without nested facade namespaces attached. */
export type OpenClawPluginApiWithoutFacades = Omit<OpenClawPluginApi, keyof PluginApiFacadeFields>;

/** Callable method signatures for the flat plugin API methods consumed by facades. */
export type PluginApiFacadeSource = {
  clearRunContext: (...args: any[]) => unknown;
  emitAgentEvent: (...args: any[]) => unknown;
  enqueueNextTurnInjection: (...args: any[]) => unknown;
  getRunContext: (...args: any[]) => unknown;
  registerAgentEventSubscription: (...args: any[]) => unknown;
  registerControlUiDescriptor: (...args: any[]) => unknown;
  registerRuntimeLifecycle: (...args: any[]) => unknown;
  registerSessionAction: (...args: any[]) => unknown;
  registerSessionExtension: (...args: any[]) => unknown;
  registerSessionSchedulerJob: (...args: any[]) => unknown;
  scheduleSessionTurn: (...args: any[]) => unknown;
  sendSessionAttachment: (...args: any[]) => unknown;
  setRunContext: (...args: any[]) => unknown;
  unscheduleSessionTurnsByTag: (...args: any[]) => unknown;
};

/** Attaches nested facade namespaces to the flat plugin API implementation. */
export function attachPluginApiFacades<T extends object>(
  api: T & PluginApiFacadeSource & Partial<PluginApiFacadeFields>,
): T & PluginApiFacadeFields {
  api.session = {
    state: {
      registerSessionExtension: (...args: any[]) => api.registerSessionExtension(...args as never[]),
    },
    workflow: {
      enqueueNextTurnInjection: (...args: any[]) => api.enqueueNextTurnInjection(...args as never[]),
      registerSessionSchedulerJob: (...args: any[]) => api.registerSessionSchedulerJob(...args as never[]),
      sendSessionAttachment: (...args: any[]) => api.sendSessionAttachment(...args as never[]),
      scheduleSessionTurn: (...args: any[]) => api.scheduleSessionTurn(...args as never[]),
      unscheduleSessionTurnsByTag: (...args: any[]) => api.unscheduleSessionTurnsByTag(...args as never[]),
    },
    controls: {
      registerSessionAction: (...args: any[]) => api.registerSessionAction(...args as never[]),
      registerControlUiDescriptor: (...args: any[]) => api.registerControlUiDescriptor(...args as never[]),
    },
  };
  api.agent = {
    events: {
      registerAgentEventSubscription: (...args: any[]) => api.registerAgentEventSubscription(...args as never[]),
      emitAgentEvent: (...args: any[]) => api.emitAgentEvent(...args as never[]),
    },
  };
  api.runContext = {
    setRunContext: (...args: any[]) => api.setRunContext(...args as never[]),
    getRunContext: (...args: any[]) => api.getRunContext(...args as never[]),
    clearRunContext: (...args: any[]) => api.clearRunContext(...args as never[]),
  };
  api.lifecycle = {
    registerRuntimeLifecycle: (...args: any[]) => api.registerRuntimeLifecycle(...args as never[]),
  };
  return api as T & PluginApiFacadeFields;
}
