// Public API barrel for the security utility module migrated from openclaw.

// safe-regex — ReDoS detection and safe regex compilation
export {
  compileSafeRegex,
  compileSafeRegexDetailed,
  hasNestedRepetition,
  testRegexWithBoundedInput,
  type SafeRegexCompileResult,
  type SafeRegexRejectReason,
} from "./safe-regex.js";

// secret-equal — timing-safe secret comparison
export { safeEqualSecret } from "./secret-equal.js";

// system-tags — inbound system tag sanitization
export { sanitizeInboundSystemTags } from "./system-tags.js";

// config-regex — config regex validation backed by safe-regex
export {
  compileConfigRegex,
  compileConfigRegexes,
  type CompiledConfigRegex,
  type ConfigRegexRejectReason,
} from "./config-regex.js";

// scan-paths — path containment and scanner skip helpers
export {
  extensionUsesSkippedScannerPath,
  isPathInside,
  isPathInsideWithRealpath,
} from "./scan-paths.js";

// installed-plugin-dirs — installed plugin directory filtering
export { shouldIgnoreInstalledPluginDirName } from "./installed-plugin-dirs.js";

// external-content-source — hook session external content source resolution
export {
  isExternalHookSession,
  mapHookExternalContentSource,
  resolveHookExternalContentSource,
  type HookExternalContentSource,
} from "./external-content-source.js";

// context-visibility — supplemental context visibility policy
export {
  evaluateSupplementalContextVisibility,
  filterSupplementalContextItems,
  shouldIncludeSupplementalContext,
  type ContextVisibilityDecision,
  type ContextVisibilityDecisionReason,
  type ContextVisibilityKind,
  type ContextVisibilityMode,
} from "./context-visibility.js";

// external-content — external content wrapping (minimal stub)
export {
  wrapExternalContent,
  type ExternalContentSource,
  type WrapExternalContentOptions,
} from "./external-content.js";

// channel-metadata — untrusted channel metadata builder
export { buildUntrustedChannelMetadata } from "./channel-metadata.js";
