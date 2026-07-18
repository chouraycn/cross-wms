// 命令注册共享的小型 help 文本格式化器。
// 移植自 openclaw/src/cli/help-format.ts。
//
// 降级策略：
//  - 原模块依赖 `../../packages/terminal-core/src/theme.js`，cross-wms 中未移植
//    terminal-core 包；这里内联一个 theme stub，提供 `command`/`muted` 格式化方法。
//    stub 直接返回输入字符串，不应用 ANSI 颜色，保持 CLI 输出为纯文本。
//    未来 cross-wms 移植 terminal-core 后可替换为正式实现。
//  - 此处直接迁移实现，仅替换 theme 依赖。

// ===== 内联 theme stub（替代未移植的 terminal-core/theme.js）=====
const theme = {
  command(value: string): string {
    return value;
  },
  muted(value: string): string {
    return value;
  },
};
// ===== theme stub 结束 =====

/** 命令加上简短描述的元组，用于 help epilogue。 */
export type HelpExample = readonly [command: string, description: string];

function formatHelpExample(command: string, description: string): string {
  return `  ${theme.command(command)}\n    ${theme.muted(description)}`;
}

function formatHelpExampleLine(command: string, description: string): string {
  if (!description) {
    return `  ${theme.command(command)}`;
  }
  return `  ${theme.command(command)} ${theme.muted(`# ${description}`)}`;
}

/** 以堆叠或行内注释样式渲染 help 示例。 */
export function formatHelpExamples(examples: ReadonlyArray<HelpExample>, inline = false): string {
  const formatter = inline ? formatHelpExampleLine : formatHelpExample;
  return examples.map(([command, description]) => formatter(command, description)).join("\n");
}
