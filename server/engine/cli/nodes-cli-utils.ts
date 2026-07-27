// Node CLI runtime helpers: terminal theme adaptation and standard error handling.
// 移植自 openclaw/src/cli/nodes-cli/cli-utils.ts

import { runCommandWithRuntime } from "./cli-utils.js";
import { unauthorizedHintForMessage } from "./rpc.js";

type RuntimeLike = {
  log: (message: string) => void;
  error: (message: string) => void;
  exit: (code: number) => void;
  writeJson: (value: unknown, indent?: number) => void;
};

let defaultRuntimeInstance: RuntimeLike | null = null;

function getDefaultRuntime(): RuntimeLike {
  if (!defaultRuntimeInstance) {
    defaultRuntimeInstance = {
      log: (message: string) => console.log(message),
      error: (message: string) => console.error(message),
      exit: (code: number) => process.exit(code),
      writeJson: (value: unknown, indent?: number) =>
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

function isRichTerminal(): boolean {
  return (
    process.stdout.isTTY === true &&
    process.env.TERM !== "dumb" &&
    !process.env.NO_COLOR
  );
}

/** Return color helpers that degrade to plain text in non-rich terminals. */
export function getNodesTheme() {
  const rich = isRichTerminal();
  const color =
    (fn: (value: string) => string) =>
    (value: string): string =>
      rich ? fn(value) : value;
  return {
    rich,
    heading: color((v) => `\x1b[1m${v}\x1b[0m`),
    ok: color((v) => `\x1b[32m${v}\x1b[0m`),
    warn: color((v) => `\x1b[33m${v}\x1b[0m`),
    muted: color((v) => `\x1b[90m${v}\x1b[0m`),
    error: color((v) => `\x1b[31m${v}\x1b[0m`),
    success: color((v) => `\x1b[32m${v}\x1b[0m`),
  };
}

/** Run a node CLI action with standard failure text and authorization hints. */
export function runNodesCommand(
  label: string,
  action: () => Promise<void>,
): Promise<void> {
  return runCommandWithRuntime(
    {
      error: defaultRuntime.error,
      exit: defaultRuntime.exit,
    },
    action,
    (err) => {
      const message = String(err);
      const { error, warn } = getNodesTheme();
      defaultRuntime.error(error(`nodes ${label} failed: ${message}`));
      const hint = unauthorizedHintForMessage(message);
      if (hint) {
        defaultRuntime.error(warn(hint));
      }
      defaultRuntime.exit(1);
    },
  );
}
