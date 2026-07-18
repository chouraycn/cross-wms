// 使用 OpenClaw 警告处理加载 node:sqlite。
import { createRequire } from "node:module";
import { formatErrorMessage } from "./errors.js";
import { installProcessWarningFilter } from "./warning-filter.js";

// 降级：tsconfig module 非 esnext，import.meta.url 不可用，改用 __filename（CJS 全局变量）
const nodeRequire = createRequire(__filename);

// node:sqlite 在不同 Node 版本中是可选的，所以调用者会得到
// 明确的运行时错误，而不是低级模块解析失败。
/** 安装进程警告过滤器后加载 node:sqlite。 */
export function requireNodeSqlite(): typeof import("node:sqlite") {
  installProcessWarningFilter();
  try {
    return nodeRequire("node:sqlite") as typeof import("node:sqlite");
  } catch (err) {
    const message = formatErrorMessage(err);
    throw new Error(
      `SQLite 支持在此 Node 运行时中不可用（缺少 node:sqlite）。${message}`,
      { cause: err },
    );
  }
}
