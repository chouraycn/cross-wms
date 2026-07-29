// 通道生命周期：兼容子路径。
// @deprecated openclaw 原始实现从 ./channel-lifecycle.core.js、../channels/draft-*.js、
// ../channels/run-state-machine.js、../channels/transport/stall-watchdog.js 重导出，依赖未移植。
// 建议使用 openclaw/plugin-sdk/channel-outbound。此处提供最小可用类型与桩函数。

/** 可武装的停滞看门狗。 */
export type ArmableStallWatchdog = {
  arm(): void;
  disarm(): void;
  isArmed(): boolean;
};

/** 停滞看门狗超时元数据。 */
export type StallWatchdogTimeoutMeta = {
  stalledAt: number;
  lastActivityAt?: number;
};

/** 运行状态机状态。 */
export type RunStateMachineState = "idle" | "starting" | "running" | "stopping" | "stopped" | "error";

/** 运行状态机事件。 */
export type RunStateMachineEvent = { type: string; [key: string]: unknown };

/** 运行状态机。 */
export type RunStateMachine = {
  current(): RunStateMachineState;
  send(event: RunStateMachineEvent): void;
  onTransition(handler: (from: RunStateMachineState, to: RunStateMachineState) => void): () => void;
};

/** 草稿预览最终化器。 */
export type DraftPreviewFinalizer = {
  finalize(): Promise<void>;
  cancel(): Promise<void>;
};

/** 可最终化草稿流控制。 */
export type FinalizableDraftStreamControls = {
  start(): void;
  stop(): void;
  isStreaming(): boolean;
};

/** 草稿流循环。 */
export type DraftStreamLoop = {
  start(): Promise<void>;
  stop(): Promise<void>;
};

// ---- 运行状态机 ----

/** 创建运行状态机。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createRunStateMachine(initial: RunStateMachineState = "idle"): RunStateMachine {
  let state: RunStateMachineState = initial;
  const handlers: Array<(from: RunStateMachineState, to: RunStateMachineState) => void> = [];
  return {
    current() {
      return state;
    },
    send(event) {
      const from = state;
      switch (event.type) {
        case "start":
          state = "running";
          break;
        case "stop":
          state = "stopped";
          break;
        case "error":
          state = "error";
          break;
      }
      if (from !== state) {
        handlers.forEach((h) => h(from, state));
      }
    },
    onTransition(handler) {
      handlers.push(handler);
      return () => {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      };
    },
  };
}

// ---- 停滞看门狗 ----

/** 创建可武装的停滞看门狗。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createArmableStallWatchdog(options?: {
  timeoutMs?: number;
  onTimeout?: (meta: StallWatchdogTimeoutMeta) => void;
}): ArmableStallWatchdog {
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutMs = options?.timeoutMs ?? 30_000;
  return {
    arm() {
      if (armed) return;
      armed = true;
      timer = setTimeout(() => {
        if (armed) {
          options?.onTimeout?.({ stalledAt: Date.now() });
        }
      }, timeoutMs);
    },
    disarm() {
      armed = false;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
    isArmed() {
      return armed;
    },
  };
}

// ---- 草稿预览最终化器 ----

/** 创建草稿预览最终化器。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createDraftPreviewFinalizer(): DraftPreviewFinalizer {
  return {
    async finalize() {},
    async cancel() {},
  };
}

// ---- 草稿流控制 ----

/** 创建可最终化草稿流控制。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createFinalizableDraftStreamControls(): FinalizableDraftStreamControls {
  let streaming = false;
  return {
    start() {
      streaming = true;
    },
    stop() {
      streaming = false;
    },
    isStreaming() {
      return streaming;
    },
  };
}

/** 创建草稿流循环。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createDraftStreamLoop(): DraftStreamLoop {
  return {
    async start() {},
    async stop() {},
  };
}
