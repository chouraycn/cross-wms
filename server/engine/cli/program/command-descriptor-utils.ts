// 命令描述符工具：用于定义安全的 Commander 占位符与 descriptor catalog。
// 移植自 openclaw/src/cli/program/command-descriptor-utils.ts。
//
// 降级策略：
//  - 原模块依赖 `commander` 与 `@openclaw/terminal-core/src/ansi.js` 中的 `sanitizeForLog`。
//  - cross-wms 未移植 terminal-core 包；`sanitizeForLog` 在 cross-wms `infra/` 中也未见。
//    此处提供一个最小化的 `sanitizeForLog` 替代实现（去除控制字符），保留 catalog 工具。
//  - commander 类型仅在 `addCommandDescriptorsToProgram` 中使用，此处保留以兼容调用方签名。

import type { Command } from "commander";
import type { NamedCommandDescriptor } from "./command-group-descriptors.js";

/** 最小化 descriptor 形状，用于完全注册前。 */
export type CommandDescriptorLike = Pick<NamedCommandDescriptor, "name" | "description">;

const SAFE_COMMAND_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** descriptor catalog 加上派生的 name 列表，用于 lazy command registration。 */
export type CommandDescriptorCatalog<TDescriptor extends NamedCommandDescriptor> = {
  descriptors: readonly TDescriptor[];
  getDescriptors: () => readonly TDescriptor[];
  getNames: () => string[];
  getCommandsWithSubcommands: () => string[];
  getParentDefaultHelpCommands: () => string[];
};

/** 规范化并校验命令 descriptor name，用于安全的 Commander 注册。 */
export function normalizeCommandDescriptorName(name: string): string | null {
  const normalized = name.trim();
  return SAFE_COMMAND_NAME_PATTERN.test(normalized) ? normalized : null;
}

function assertSafeCommandDescriptorName(name: string): string {
  const normalized = normalizeCommandDescriptorName(name);
  if (!normalized) {
    throw new Error(`Invalid CLI command name: ${JSON.stringify(name.trim())}`);
  }
  return normalized;
}

/**
 * 去除 descriptor description 中的不安全终端内容。
 *
 * 降级实现：原模块使用 `@openclaw/terminal-core/src/ansi.js` 的 `sanitizeForLog`，
 * cross-wms 未移植该包。这里提供一个最小化实现：去除 ANSI 转义序列与控制字符。
 */
export function sanitizeCommandDescriptorDescription(description: string): string {
  // 去除 ANSI 转义序列（CSI、OSC 等）
  // eslint-disable-next-line no-control-regex
  const ansiStripped = description.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  // eslint-disable-next-line no-control-regex
  const oscStripped = ansiStripped.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
  // 去除其他控制字符（保留换行与制表符）
  // eslint-disable-next-line no-control-regex
  return oscStripped.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim();
}

/** 返回 descriptor name 列表（按注册顺序）。 */
export function getCommandDescriptorNames(descriptors: readonly CommandDescriptorLike[]): string[] {
  return descriptors.map((descriptor) => descriptor.name);
}

/** 返回应保持为带子命令的父命令的 descriptor name。 */
export function getCommandsWithSubcommands(
  descriptors: readonly NamedCommandDescriptor[],
): string[] {
  return descriptors
    .filter((descriptor) => descriptor.hasSubcommands)
    .map((descriptor) => descriptor.name);
}

/** 返回其父命令应默认显示 help 的 descriptor。 */
export function getParentDefaultHelpCommands(
  descriptors: readonly NamedCommandDescriptor[],
): string[] {
  return descriptors
    .filter((descriptor) => descriptor.parentDefaultHelp)
    .map((descriptor) => descriptor.name);
}

/** 合并 descriptor 组，保留每个命令名的第一个 descriptor。 */
export function collectUniqueCommandDescriptors<TDescriptor extends CommandDescriptorLike>(
  descriptorGroups: readonly (readonly TDescriptor[])[],
): TDescriptor[] {
  const seen = new Set<string>();
  const descriptors: TDescriptor[] = [];
  for (const group of descriptorGroups) {
    for (const descriptor of group) {
      if (seen.has(descriptor.name)) {
        continue;
      }
      seen.add(descriptor.name);
      descriptors.push(descriptor);
    }
  }
  return descriptors;
}

/** 创建一个 descriptor catalog，附带稳定的派生列表。 */
export function defineCommandDescriptorCatalog<TDescriptor extends NamedCommandDescriptor>(
  descriptors: readonly TDescriptor[],
): CommandDescriptorCatalog<TDescriptor> {
  return {
    descriptors,
    getDescriptors: () => descriptors,
    getNames: () => getCommandDescriptorNames(descriptors),
    getCommandsWithSubcommands: () => getCommandsWithSubcommands(descriptors),
    getParentDefaultHelpCommands: () => getParentDefaultHelpCommands(descriptors),
  };
}

/** 向 Commander 添加安全的占位命令，跳过已存在的命令名。 */
export function addCommandDescriptorsToProgram(
  program: Command,
  descriptors: readonly CommandDescriptorLike[],
  existingCommands: Set<string> = new Set(),
): Set<string> {
  for (const descriptor of descriptors) {
    const name = assertSafeCommandDescriptorName(descriptor.name);
    if (existingCommands.has(name)) {
      continue;
    }
    program.command(name).description(sanitizeCommandDescriptorDescription(descriptor.description));
    existingCommands.add(name);
  }
  return existingCommands;
}
