// 根选项转发助手：供稍后重新解析 argv 的子命令调度器使用。
import { consumeRootOptionToken } from "./cli-root-options.js";

/** 将一个已消费的根选项及其值 token 复制到 `out` 中，返回 token 数量。 */
export function forwardConsumedCliRootOption(
  args: readonly string[],
  index: number,
  out: string[],
): number {
  const consumedRootOption = consumeRootOptionToken(args, index);
  if (consumedRootOption <= 0) {
    return 0;
  }

  for (let offset = 0; offset < consumedRootOption; offset += 1) {
    const token = args[index + offset];
    if (token !== undefined) {
      out.push(token);
    }
  }

  return consumedRootOption;
}
