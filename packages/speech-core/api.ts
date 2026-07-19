// Public speech-core plugin SDK facade. Re-export stable provider/config helpers
// from the plugin-sdk alias so speech plugins do not import core internals.
//
// NOTE: The following re-exports originally targeted `openclaw/plugin-sdk/speech-core`.
// They have been commented out during the cross-wms port because the `openclaw`
// package is not a dependency of `@cdf-know/speech-core`. Restore these re-exports
// (or replace with local `@cdf-know/*` sources) once the plugin-sdk speech-core
// surface is available locally.
// export {
//   asBoolean,
//   asFiniteNumber,
//   asObject,
//   assertOkOrThrowProviderError,
//   canonicalizeSpeechProviderId,
//   createProviderHttpError,
//   extractProviderErrorDetail,
//   extractProviderRequestId,
//   formatProviderErrorPayload,
//   formatProviderHttpErrorMessage,
//   getSpeechProvider,
//   listSpeechProviders,
//   normalizeApplyTextNormalization,
//   normalizeLanguageCode,
//   normalizeSeed,
//   normalizeSpeechProviderId,
//   normalizeTtsAutoMode,
//   parseTtsDirectives,
//   readResponseTextLimited,
//   requireInRange,
//   resolveEffectiveTtsConfig,
//   scheduleCleanup,
//   summarizeText,
//   trimToUndefined,
//   truncateErrorDetail,
//   TTS_AUTO_MODES,
// } from "openclaw/plugin-sdk/speech-core";
// export type {
//   ResolvedTtsConfig,
//   ResolvedTtsModelOverrides,
//   SpeechDirectiveTokenParseContext,
//   SpeechDirectiveTokenParseResult,
//   SpeechListVoicesRequest,
//   SpeechModelOverridePolicy,
//   SpeechProviderConfig,
//   SpeechProviderConfiguredContext,
//   SpeechProviderOverrides,
//   SpeechProviderPlugin,
//   SpeechProviderPreparedSynthesis,
//   SpeechProviderPrepareSynthesisContext,
//   SpeechProviderResolveConfigContext,
//   SpeechProviderResolveTalkConfigContext,
//   SpeechProviderResolveTalkOverridesContext,
//   SpeechSynthesisRequest,
//   SpeechSynthesisStreamRequest,
//   SpeechSynthesisStreamResult,
//   SpeechSynthesisTarget,
//   SpeechTelephonySynthesisRequest,
//   SpeechVoiceOption,
//   TtsConfigResolutionContext,
//   TtsDirectiveOverrides,
//   TtsDirectiveParseResult,
// } from "openclaw/plugin-sdk/speech-core";
