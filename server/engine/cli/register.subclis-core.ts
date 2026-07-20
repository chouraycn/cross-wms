// Sub-CLI registry that lazily wires gateway, models, devices, plugins, and plugin commands.
// 移植自 openclaw/src/cli/program/register.subclis-core.ts
//
// 降级策略：
//  - 原模块使用 lazy import 加载各子 CLI 模块。cross-wms 保留相同结构，
//    但对于未移植的模块，动态 import 会加载降级后的 CLI 命令注册函数。
//  - 原模块依赖 private-qa-cli、lazy-promise、command-path-policy；
//    cross-wms 未移植这些模块；此处省略 QA CLI 和 gateway 快速路径。

import type { Command } from "commander";
import { resolveCliArgvInvocation } from "./argv-invocation.js";
import {
  shouldEagerRegisterSubcommands,
  shouldRegisterPrimarySubcommandOnly,
} from "./command-registration-policy.js";
import {
  buildCommandGroupEntries,
  defineImportedProgramCommandGroupSpecs,
  type CommandGroupDescriptorSpec,
} from "./program/command-group-descriptors.js";
import {
  registerCommandGroupByName,
  registerCommandGroups,
  type CommandGroupEntry,
} from "./register-command-groups.js";
import {
  getSubCliCommandsWithSubcommands,
  getSubCliEntries as getSubCliEntryDescriptors,
  type SubCliDescriptor,
} from "./program/subcli-descriptors.js";

export { getSubCliCommandsWithSubcommands };

export type SubCliRegistrationContext = {
  purpose?: "runtime" | "completion";
};

type SubCliRegistrar = (
  program: Command,
  argv: string[],
  context: SubCliRegistrationContext,
) => Promise<void> | void;

const entrySpecs: readonly CommandGroupDescriptorSpec<SubCliRegistrar>[] = [
  ...defineImportedProgramCommandGroupSpecs([
    {
      commandNames: ["gateway"],
      loadModule: () => import("./gateway-cli.js"),
      exportName: "registerGatewayCli",
    },
    {
      commandNames: ["models"],
      loadModule: () => import("./models-cli.js"),
      exportName: "registerModelsCli",
    },
    {
      commandNames: ["plugins"],
      loadModule: () => import("./plugins-cli.js"),
      exportName: "registerPluginsCli",
    },
    {
      commandNames: ["channels"],
      loadModule: () => import("./channels-cli.js"),
      exportName: "registerChannelsCli",
    },
    {
      commandNames: ["skills"],
      loadModule: () => import("./skills-cli.js"),
      exportName: "registerSkillsCli",
    },
  ]),
];

function resolveSubCliCommandGroups(
  argv: string[],
  context: SubCliRegistrationContext = {},
): CommandGroupEntry[] {
  const descriptors = getSubCliEntryDescriptors();
  const descriptorNames = new Set(descriptors.map((descriptor) => descriptor.name));
  return buildCommandGroupEntries(
    descriptors,
    entrySpecs.filter((spec) => spec.commandNames.every((name) => descriptorNames.has(name))),
    (register) => async (program) => {
      await register(program, argv, context);
    },
  );
}

export function getSubCliEntries(): ReadonlyArray<SubCliDescriptor> {
  return getSubCliEntryDescriptors();
}

export async function registerSubCliByName(
  program: Command,
  name: string,
  argv: string[] = process.argv,
  _context: SubCliRegistrationContext = {},
): Promise<boolean> {
  return registerCommandGroupByName(program, resolveSubCliCommandGroups(argv, _context), name);
}

export function registerSubCliCommands(program: Command, argv: string[] = process.argv) {
  const { primary } = resolveCliArgvInvocation(argv);
  registerCommandGroups(program, resolveSubCliCommandGroups(argv), {
    eager: shouldEagerRegisterSubcommands(),
    primary,
    registerPrimaryOnly: Boolean(primary && shouldRegisterPrimarySubcommandOnly(argv)),
  });
}
