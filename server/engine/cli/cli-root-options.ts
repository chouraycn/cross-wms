// 本地 stub：替代未移植的 `../infra/cli-root-options.js`。
// 原模块为纯常量与函数，无外部依赖，这里完整复制实现以支持 cli 模块移植。

/** 停止根选项扫描、将其后参数视为位置参数的 CLI 标记。 */
export const FLAG_TERMINATOR = "--";

const ROOT_BOOLEAN_FLAGS = new Set(["--dev", "--no-color"]);
const ROOT_VALUE_FLAGS = new Set(["--profile", "--log-level", "--container"]);

/** 返回一个 token 是否可作为根选项的值。 */
export function isValueToken(arg: string | undefined): boolean {
  if (!arg || arg === FLAG_TERMINATOR) {
    return false;
  }
  if (!arg.startsWith("-")) {
    return true;
  }
  return /^-?\d+(?:\.\d+)?$/.test(arg);
}

/** 返回指定索引处的根选项在 argv 中占用多少个 token。 */
export function consumeRootOptionToken(args: ReadonlyArray<string>, index: number): number {
  const arg = args[index];
  if (!arg) {
    return 0;
  }
  if (ROOT_BOOLEAN_FLAGS.has(arg)) {
    return 1;
  }
  if (
    arg.startsWith("--profile=") ||
    arg.startsWith("--log-level=") ||
    arg.startsWith("--container=")
  ) {
    return 1;
  }
  if (ROOT_VALUE_FLAGS.has(arg)) {
    return isValueToken(args[index + 1]) ? 2 : 1;
  }
  return 0;
}
