// Stream payload utilities normalize provider stream payload fields for wrappers.
// Local type placeholder: openclaw StreamFn contract (cross-wms agents/runtime not ported).
/** Minimal stream function contract: (model, context, options) => stream result. */
type StreamFn = (
  model: any,
  context: any,
  options?: {
    onPayload?: (payload: any, model: any) => unknown;
    [key: string]: any;
  },
) => unknown;

/** Wraps a stream function and lets callers mutate outgoing provider payload objects. */
export function streamWithPayloadPatch(
  underlying: StreamFn,
  model: Parameters<StreamFn>[0],
  context: Parameters<StreamFn>[1],
  options: Parameters<StreamFn>[2],
  patchPayload: (payload: Record<string, any>) => void,
): ReturnType<StreamFn> {
  const originalOnPayload = options?.onPayload;
  return underlying(model, context, {
    ...options,
    onPayload: (payload) => {
      // Payload hooks receive mutable provider request objects before the underlying sender uses them.
      if (payload && typeof payload === "object") {
        patchPayload(payload as Record<string, any>);
      }
      return originalOnPayload?.(payload, model);
    },
  });
}
