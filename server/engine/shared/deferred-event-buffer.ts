// 延迟事件缓冲：先缓冲事件，待显式 flush 时一次性推送到下游 sink
type EventSink<T> = {
  push(event: T): void;
};

export function createDeferredEventBuffer<T>(sink: EventSink<T>, onBufferedEvent?: () => void) {
  let events: T[] = [];
  return {
    push(event: T): void {
      events.push(event);
      onBufferedEvent?.();
    },
    flush(): void {
      for (const event of events) {
        sink.push(event);
      }
      events = [];
    },
    discard(): void {
      events = [];
    },
  };
}
