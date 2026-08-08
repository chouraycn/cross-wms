// Default CLI runtime for stdout/stderr/json output and process exit.
// 移植自 openclaw/src/runtime.js

type RuntimeLike = {
  log: (message: string) => void;
  error: (message: string) => void;
  exit: (code: number) => void;
  writeJson: (value: any, indent?: number) => void;
};

let defaultRuntimeInstance: RuntimeLike | null = null;

function getDefaultRuntime(): RuntimeLike {
  if (!defaultRuntimeInstance) {
    defaultRuntimeInstance = {
      log: (message: string) => console.log(message),
      error: (message: string) => console.error(message),
      exit: (code: number) => process.exit(code),
      writeJson: (value: any, indent?: number) =>
        console.log(JSON.stringify(value, null, indent ?? 2)),
    };
  }
  return defaultRuntimeInstance;
}

export function setDefaultRuntime(runtime: RuntimeLike): void {
  defaultRuntimeInstance = runtime;
}

export const defaultRuntime: RuntimeLike = {
  get log() {
    return getDefaultRuntime().log;
  },
  get error() {
    return getDefaultRuntime().error;
  },
  get exit() {
    return getDefaultRuntime().exit;
  },
  get writeJson() {
    return getDefaultRuntime().writeJson;
  },
};
