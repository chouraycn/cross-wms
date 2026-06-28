/**
 * CLI 程序上下文
 * 管理程序版本和通道选项
 */

import type { Command } from "commander";

const PROGRAM_CONTEXT_SYMBOL: unique symbol = Symbol.for("crosswms.cli.programContext");

/** 根 CLI 程序上下文 */
export type ProgramContext = {
  programVersion: string;
  channelOptions: string[];
  messageChannelOptions: string;
  agentChannelOptions: string;
};

/** 创建程序上下文 (懒加载通道选项) */
export function createProgramContext(): ProgramContext {
  let cachedChannelOptions: string[] | undefined;
  const getChannelOptions = (): string[] => {
    if (cachedChannelOptions === undefined) {
      cachedChannelOptions = resolveCliChannelOptions();
    }
    return cachedChannelOptions;
  };

  return {
    programVersion: "1.0.0",
    get channelOptions() {
      return getChannelOptions();
    },
    get messageChannelOptions() {
      return getChannelOptions().join("|");
    },
    get agentChannelOptions() {
      return ["last", ...getChannelOptions()].join("|");
    },
  };
}

/** 解析 CLI 通道选项 */
function resolveCliChannelOptions(): string[] {
  // 默认通道选项，实际实现可从配置读取
  return ["cli", "terminal", "console"];
}

/**
 * 将程序上下文附加到 Commander 程序
 */
export function setProgramContext(program: Command, ctx: ProgramContext): void {
  (program as Command & { [PROGRAM_CONTEXT_SYMBOL]?: ProgramContext })[PROGRAM_CONTEXT_SYMBOL] = ctx;
}

/**
 * 从 Commander 程序读取程序上下文
 */
export function getProgramContext(program: Command): ProgramContext | undefined {
  return (program as Command & { [PROGRAM_CONTEXT_SYMBOL]?: ProgramContext })[
    PROGRAM_CONTEXT_SYMBOL
  ];
}

/**
 * 解析 CLI 通道选项字符串
 */
export function resolveCliChannelOptionsString(): string[] {
  return resolveCliChannelOptions();
}
