// 每个运行时一次过滤已知嘈杂的进程警告。
import { resolveGlobalSingleton } from "./_openclaw-stubs.js";

const warningFilterKey = Symbol.for("openclaw.warning-filter");

/** 共享警告抑制器使用的规范化进程警告字段。 */
export type ProcessWarning = {
  code?: string;
  name?: string;
  message?: string;
};

type ProcessWarningInstallState = {
  installed: boolean;
};

/** 返回进程警告是否匹配已知的嘈杂运行时/依赖警告。 */
export function shouldIgnoreWarning(warning: ProcessWarning): boolean {
  if (warning.code === "DEP0040" && warning.message?.includes("punycode")) {
    return true;
  }
  if (warning.code === "DEP0060" && warning.message?.includes("util._extend")) {
    return true;
  }
  if (
    warning.name === "ExperimentalWarning" &&
    warning.message?.includes("SQLite is an experimental feature")
  ) {
    return true;
  }
  return false;
}

function normalizeWarningArgs(args: unknown[]): ProcessWarning {
  const warningArg = args[0];
  const secondArg = args[1];
  const thirdArg = args[2];
  let name: string | undefined;
  let code: string | undefined;
  let message: string | undefined;

  if (warningArg instanceof Error) {
    name = warningArg.name;
    message = warningArg.message;
    code = (warningArg as Error & { code?: string }).code;
  } else if (typeof warningArg === "string") {
    message = warningArg;
  }

  if (secondArg && typeof secondArg === "object" && !Array.isArray(secondArg)) {
    const options = secondArg as { type?: unknown; code?: unknown };
    if (typeof options.type === "string") {
      name = options.type;
    }
    if (typeof options.code === "string") {
      code = options.code;
    }
  } else {
    if (typeof secondArg === "string") {
      name = secondArg;
    }
    if (typeof thirdArg === "string") {
      code = thirdArg;
    }
  }

  return { name, code, message };
}

/** 为当前 JS 领域安装全局进程警告过滤器，仅一次。 */
export function installProcessWarningFilter(): void {
  const state = resolveGlobalSingleton<ProcessWarningInstallState>(warningFilterKey, () => ({
    installed: false,
  }));
  if (state.installed) {
    return;
  }

  const originalEmitWarning = process.emitWarning.bind(process);
  const wrappedEmitWarning: typeof process.emitWarning = ((...args: unknown[]) => {
    if (shouldIgnoreWarning(normalizeWarningArgs(args))) {
      return;
    }
    // 包装后 Node 不会通过相同路径发出 Error + 选项警告；
    // 通过为未抑制的情况重新发出规范化警告对象来保持可见性。
    if (
      args[0] instanceof Error &&
      args[1] &&
      typeof args[1] === "object" &&
      !Array.isArray(args[1])
    ) {
      const warning = args[0];
      const emitted = Object.assign(new Error(warning.message), {
        name: warning.name,
        code: (warning as Error & { code?: string }).code,
      });
      process.emit("warning", emitted);
      return;
    }
    Reflect.apply(originalEmitWarning, process, args);
  }) as typeof process.emitWarning;

  process.emitWarning = wrappedEmitWarning;
  state.installed = true;
}
