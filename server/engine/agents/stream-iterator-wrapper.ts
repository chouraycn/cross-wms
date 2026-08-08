/**
 * Async stream iterator 包装器 — 移植自 openclaw/src/agents/stream-iterator-wrapper.ts
 * 无外部依赖。
 *
 * Lets stream decorators override next/return/throw while preserving the underlying iterator contract.
 */
type StreamIterator<T> = AsyncIterator<T, any, any>;

// Optional return/throw handlers let stream wrappers observe cleanup and errors
// while preserving the underlying iterator contract when they do not intercept.
type IteratorHandler<T> = (
  iterator: StreamIterator<T>,
  value?: any,
) => IteratorResult<T, any> | Promise<IteratorResult<T, any>>;

/** Wraps an async iterator with custom next/return/throw behavior. */
export function createStreamIteratorWrapper<T>(params: {
  iterator: StreamIterator<T>;
  next: (iterator: StreamIterator<T>) => Promise<IteratorResult<T, any>>;
  onReturn?: IteratorHandler<T>;
  onThrow?: IteratorHandler<T>;
}): AsyncIterableIterator<T> {
  const wrapper: AsyncIterableIterator<T> = {
    async next() {
      return params.next(params.iterator);
    },
    async return(value?: any) {
      return (
        (await params.onReturn?.(params.iterator, value)) ??
        (await params.iterator.return?.(value)) ?? { done: true as const, value: undefined }
      );
    },
    async throw(error?: any) {
      return (
        (await params.onThrow?.(params.iterator, error)) ??
        (await params.iterator.throw?.(error)) ?? { done: true as const, value: undefined }
      );
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return wrapper;
}
