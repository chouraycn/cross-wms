export const loggingState = {
  cachedLogger: null as any,
  cachedSettings: null as any,
  cachedConsoleSettings: null as any,
  overrideSettings: null as any,
  invalidEnvLogLevelValue: null as string | null,
  consolePatched: false,
  forceConsoleToStderr: false,
  consoleTimestampPrefix: false,
  consoleSubsystemFilter: null as string[] | null,
  resolvingConsoleSettings: false,
  streamErrorHandlersInstalled: false,
  rawConsole: null as {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
  } | null,
  diagnosticSessions: new Map<string, any>(),
  diagnosticEventListeners: [] as Array<(event: any) => void>,
};
