// 归一化的 argv 调用摘要，供 Commander 命令分派前使用。
// 移植自 openclaw/src/cli/argv-invocation.ts。
//
// 降级策略：
//  - 原模块仅依赖 ./argv.js（cross-wms 已移植）。
//  - 此处直接迁移实现，无其他外部依赖。

import {
  getCommandPathWithRootOptions,
  getPrimaryCommand,
  isHelpOrVersionInvocation,
  isRootHelpInvocation,
} from "./argv.js";

export type CliArgvInvocation = {
  argv: string[];
  commandPath: string[];
  primary: string | null;
  hasHelpOrVersion: boolean;
  isRootHelpInvocation: boolean;
};

/** 从原始 process argv 数组解析命令路径与 help/version 模式。 */
export function resolveCliArgvInvocation(argv: string[]): CliArgvInvocation {
  return {
    argv,
    commandPath: getCommandPathWithRootOptions(argv, 2),
    primary: getPrimaryCommand(argv),
    hasHelpOrVersion: isHelpOrVersionInvocation(argv),
    isRootHelpInvocation: isRootHelpInvocation(argv),
  };
}
