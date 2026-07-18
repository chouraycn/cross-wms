// 根命令描述符与命令组类型。
// 移植自 openclaw/src/cli/program/command-group-descriptors.ts。
//
// 降级策略：原模块依赖 `commander`（仅类型）与 openclaw 内部 registrar 类型；
// 此处仅保留 `NamedCommandDescriptor` 与基本类型，供 `core-command-descriptors.ts`
// 与 `subcli-descriptors.ts` 的降级 stub 使用。组注册相关的 API 在 cross-wms 未移植，
// 这里抛出错误以避免静默失败。

/** 根命令占位符描述符。 */
export type NamedCommandDescriptor = {
  name: string;
  description: string;
  hasSubcommands: boolean;
  parentDefaultHelp?: boolean;
};

/** 命名命令组 spec，用于描述一个 registrar 拥有的占位符。 */
export type CommandGroupDescriptorSpec<TRegister> = {
  commandNames: readonly string[];
  register: TRegister;
};

/** 解析后的组项，包含 descriptor-backed 占位符与 registrar。 */
export type ResolvedCommandGroupEntry<TDescriptor extends NamedCommandDescriptor, TRegister> = {
  placeholders: TDescriptor[];
  register: TRegister;
};

/**
 * 将命名命令组 spec 解析为 descriptor-backed 条目。
 *
 * 降级实现：抛出错误。cross-wms 未移植 openclaw 的命令组注册流程，
 * 调用方应使用 cross-wms 自有的命令注册路径。
 */
export function resolveCommandGroupEntries<TDescriptor extends NamedCommandDescriptor, TRegister>(
  _descriptors: readonly TDescriptor[],
  _specs: readonly CommandGroupDescriptorSpec<TRegister>[],
): ResolvedCommandGroupEntry<TDescriptor, TRegister>[] {
  throw new Error("resolveCommandGroupEntries stub: openclaw command-group registration not ported");
}
