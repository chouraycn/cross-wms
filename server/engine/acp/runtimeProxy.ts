import type { AcpRuntime, AcpRuntimeEvent, AcpRuntimeHandle, AcpRuntimeStatus, AcpRuntimeTurn, AcpRuntimeTurnResult } from "./runtimeApi.js";

export function createLazyAcpRuntimeProxy(resolveRuntime: () => Promise<AcpRuntime>): AcpRuntime {
  async function ensureSession(input: Parameters<AcpRuntime["ensureSession"]>[0]): Promise<AcpRuntimeHandle> {
    return (await resolveRuntime()).ensureSession(input);
  }

  async function* runTurn(input: Parameters<AcpRuntime["runTurn"]>[0]): AsyncIterable<AcpRuntimeEvent> {
    yield* (await resolveRuntime()).runTurn(input);
  }

  function startTurn(input: Parameters<AcpRuntime["startTurn"]>[0]): AcpRuntimeTurn {
    const turnPromise = resolveRuntime().then((runtime) => runtime.startTurn(input));

    return {
      requestId: input.requestId,
      events: {
        async* [Symbol.asyncIterator](): AsyncIterator<AcpRuntimeEvent> {
          yield* (await turnPromise).events;
        },
      },
      result: turnPromise.then((turn) => turn.result) as Promise<AcpRuntimeTurnResult>,
      cancel: (inputArgs?: { reason?: string }) =>
        turnPromise.then((turn) => turn.cancel(inputArgs)),
      closeStream: (inputArgs?: { reason?: string }) =>
        turnPromise.then((turn) => turn.closeStream(inputArgs)),
    };
  }

  async function getCapabilities(): Promise<unknown> {
    return (await resolveRuntime()).getCapabilities();
  }

  async function getStatus(input: Parameters<AcpRuntime["getStatus"]>[0]): Promise<AcpRuntimeStatus> {
    return (await resolveRuntime()).getStatus(input);
  }

  async function setMode(input: Parameters<AcpRuntime["setMode"]>[0]): Promise<void> {
    await (await resolveRuntime()).setMode(input);
  }

  async function setConfigOption(input: Parameters<AcpRuntime["setConfigOption"]>[0]): Promise<void> {
    await (await resolveRuntime()).setConfigOption(input);
  }

  async function cancel(input: Parameters<AcpRuntime["cancel"]>[0]): Promise<void> {
    await (await resolveRuntime()).cancel(input);
  }

  async function close(input: Parameters<AcpRuntime["close"]>[0]): Promise<void> {
    await (await resolveRuntime()).close(input);
  }

  return {
    isHealthy: () => false,
    probeAvailability: async () => {
      await (await resolveRuntime()).probeAvailability();
    },
    ensureSession,
    runTurn,
    startTurn,
    getCapabilities,
    getStatus,
    setMode,
    setConfigOption,
    cancel,
    close,
  };
}