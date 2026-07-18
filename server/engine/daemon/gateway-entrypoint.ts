/**
 * 网关入口点解析。
 */
import path from "node:path";

export function resolveGatewayEntrypoint(programArguments: readonly string[]): string | undefined {
  const gatewayIndex = programArguments.indexOf("gateway");
  if (gatewayIndex <= 0) {
    return undefined;
  }
  return programArguments[gatewayIndex - 1];
}

export function findGatewayEntrypointIndex(programArguments: readonly string[]): number {
  return programArguments.indexOf("gateway");
}

export function formatExecStart(programArguments: readonly string[]): string {
  const shellQuoteArg = (value: string): string => {
    if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(value)) {
      return value;
    }
    return `'${value.replaceAll("'", "'\\''")}'`;
  };
  return programArguments.map(shellQuoteArg).join(" ");
}

export function resolvePackageRoot(entrypoint: string): string | undefined {
  let current = path.dirname(path.resolve(entrypoint));
  for (let depth = 0; depth < 8; depth += 1) {
    const packageJson = path.join(current, "package.json");
    try {
      const stat = require("node:fs").statSync(packageJson);
      if (stat.isFile()) {
        return current;
      }
    } catch {
      // 继续向上查找
    }
    const next = path.dirname(current);
    if (next === current) {
      return undefined;
    }
    current = next;
  }
  return undefined;
}
