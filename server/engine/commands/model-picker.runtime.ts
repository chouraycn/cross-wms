// @ts-nocheck
/** Runtime dependency bundle for provider/model picker flows. */
import {
  resolveProviderModelPickerFlowContributions,
  resolveProviderModelPickerFlowEntries,
} from "@openclaw-src/flows/provider-flow.runtime.js";
import { runProviderPluginAuthMethod } from "@openclaw-src/plugins/provider-auth-choice.js";
import {
  resolveProviderPluginChoice,
  runProviderModelSelectedHook,
} from "@openclaw-src/plugins/provider-wizard.js";
import { resolvePluginProviders } from "@openclaw-src/plugins/providers.runtime.js";

/** Lazy runtime methods consumed by model picker command flows. */
export const modelPickerRuntime = {
  resolveProviderModelPickerContributions: resolveProviderModelPickerFlowContributions,
  resolveProviderModelPickerEntries: resolveProviderModelPickerFlowEntries,
  resolveProviderPluginChoice,
  runProviderModelSelectedHook,
  resolvePluginProviders,
  runProviderPluginAuthMethod,
};
