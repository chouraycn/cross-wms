// Root help renderer that combines core, sub-CLI, and optional plugin command descriptors.
// 移植自 openclaw/src/cli/program/root-help.ts
//
// 降级策略：
//  - 原模块依赖大量 OpenClaw 内部模块（config/types, plugins/cli, plugins/loader, version）。
//  - cross-wms 未移植这些模块；此处提供简化版 root-help 渲染。
//  - 保留函数签名，但省略插件描述符和配置相关功能。

import { Command } from "commander";
import { VERSION } from "../../version.js";
import {
  addCommandDescriptorsToProgram,
  collectUniqueCommandDescriptors,
} from "./program/command-descriptor-utils.js";
import { getCoreCliCommandDescriptors } from "./program/core-command-descriptors.js";
import { configureProgramHelp } from "./help.js";
import { getSubCliEntries } from "./program/subcli-descriptors.js";

/** Options for rendering root help without fully registering the live CLI. */
export type RootHelpRenderOptions = {
  includePluginDescriptors?: boolean;
};

async function buildRootHelpProgram(renderOptions?: RootHelpRenderOptions): Promise<Command> {
  const program = new Command();
  // 降级：cross-wms 无插件系统，忽略 includePluginDescriptors
  void renderOptions;
  configureProgramHelp(
    program,
    {
      programVersion: VERSION,
      channelOptions: [],
      messageChannelOptions: "",
      agentChannelOptions: "",
    },
  );

  addCommandDescriptorsToProgram(
    program,
    collectUniqueCommandDescriptors([
      getCoreCliCommandDescriptors(),
      getSubCliEntries(),
    ]),
  );

  return program;
}

/** Render root help text for tests, docs, and command output. */
export async function renderRootHelpText(_renderOptions?: RootHelpRenderOptions): Promise<string> {
  const program = await buildRootHelpProgram(_renderOptions);
  let output = "";
  const originalWrite = process.stdout.write.bind(process.stdout);
  const captureWrite: typeof process.stdout.write = ((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stdout.write = captureWrite;
  try {
    program.outputHelp();
  } finally {
    process.stdout.write = originalWrite;
  }
  return output;
}

/** Write rendered root help directly to stdout. */
export async function outputRootHelp(renderOptions?: RootHelpRenderOptions): Promise<void> {
  process.stdout.write(await renderRootHelpText(renderOptions));
}
