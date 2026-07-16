import { logger } from '../../logger.js';

const WRAPPED_SYMBOL = Symbol('openclaw.fetch.abort-signal-wrapped');

export function wrapFetchWithAbortSignal(fetchImpl: typeof fetch): typeof fetch {
  if ((fetchImpl as any)[WRAPPED_SYMBOL]) return fetchImpl;

  const wrapped: typeof fetch = (input, init) => {
    const normalizedInit = init ?? {};
    if (normalizedInit.body && typeof normalizedInit.body === 'object' && 'stream' in normalizedInit.body) {
      (normalizedInit as any).duplex = 'half';
    }
    if (normalizedInit.signal) {
      const controller = new AbortController();
      const externalSignal = normalizedInit.signal;
      if (externalSignal.aborted) controller.abort(externalSignal.reason);
      else externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
      normalizedInit.signal = controller.signal;
    }
    return fetchImpl(input, normalizedInit);
  };

  (wrapped as any)[WRAPPED_SYMBOL] = true;
  return wrapped;
}

export function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  const impl = fetchImpl ?? globalThis.fetch;
  if (!impl) throw new Error('No fetch implementation available');
  return wrapFetchWithAbortSignal(impl);
}
