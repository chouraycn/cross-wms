// Root program context: version plus lazily computed channel option strings for help text.
// 移植自 openclaw/src/cli/program/context.ts
//
// 降级策略：
//  - 原模块依赖 ../../version.js 的 VERSION（cross-wms 已有 ../../version.ts）。
//  - 原模块依赖 ../channel-options.js 的 resolveCliChannelOptions（cross-wms 已移植）。

import { VERSION } from "../../version.js";
import { resolveCliChannelOptions } from "./channel-options.js";

/** Root CLI program context consumed by command registration and help rendering. */
export type ProgramContext = {
  programVersion: string;
  channelOptions: string[];
  messageChannelOptions: string;
  agentChannelOptions: string;
};

/** Create a program context that resolves channel options once on first use. */
export function createProgramContext(): ProgramContext {
  let cachedChannelOptions: string[] | undefined;
  const getChannelOptions = (): string[] => {
    if (cachedChannelOptions === undefined) {
      cachedChannelOptions = resolveCliChannelOptions();
    }
    return cachedChannelOptions;
  };

  return {
    programVersion: VERSION,
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
