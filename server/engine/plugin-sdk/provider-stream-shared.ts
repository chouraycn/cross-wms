
type StreamFn = (
  request: unknown,
  context: unknown,
) => AsyncIterable<unknown>;

/** Optional provider stream decorator factory used by shared provider wrappers. */
export type ProviderStreamWrapperFactory =
  /** Wrapper factory that can decorate, replace, or omit a provider stream function. */
  ((streamFn: StreamFn | undefined) => StreamFn | undefined) | null | undefined | false;

/** Compose stream wrapper factories from left to right around a base stream function. */
export function composeProviderStreamWrappers(
  /** Base provider stream function to pass through the wrapper chain. */
  baseStreamFn: StreamFn | undefined,
  /** Ordered wrapper factories; falsey entries are skipped. */
  ...wrappers: ProviderStreamWrapperFactory[]
): StreamFn | undefined {
  return wrappers.reduce(
    (streamFn, wrapper) => (wrapper ? wrapper(streamFn) : streamFn),
    baseStreamFn,
  );
}

export type ProviderStreamCompatFamily = "openai" | "anthropic" | "google" | "deepseek";

export function buildProviderStreamCompatHooks(
  family: ProviderStreamCompatFamily,
): {
  wrapStream?: (streamFn: StreamFn | undefined) => StreamFn | undefined;
  patchPayload?: (payload: Record<string, unknown>) => Record<string, unknown>;
} {
  switch (family) {
    case "openai":
      return {};
    case "anthropic":
      return {};
    case "google":
      return {};
    case "deepseek":
      return {};
  }
}

export type { StreamFn };
