// @ts-nocheck
/** Re-export seam for channel onboarding flow helpers. */
export {
  createChannelOnboardingPostWriteHook,
  createChannelOnboardingPostWriteHookCollector,
  runCollectedChannelOnboardingPostWriteHooks,
  setupChannels,
} from "@openclaw-src/flows/channel-setup.js";
export { noteChannelStatus } from "@openclaw-src/flows/channel-setup.status.js";
