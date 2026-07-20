/**
 * 移植自 openclaw/src/agents/tool-terminal-presentation.ts
 *
 * Internal opt-in for deterministic terminal summaries from trusted built-in tools.
 * cross-wms 完整移植：使用 WeakMap 存储格式化器。
 */

type TerminalToolPresentation = { text: string };
type TerminalToolPresentationFormatter = (
  params: unknown,
  result: unknown,
) => TerminalToolPresentation | undefined;

const terminalPresentationByTool = new WeakMap<object, TerminalToolPresentationFormatter>();

/** Attach a terminal presentation formatter to a tool object. */
export function setToolTerminalPresentation<T extends object>(
  tool: T,
  formatter: TerminalToolPresentationFormatter,
): T {
  terminalPresentationByTool.set(tool, formatter);
  return tool;
}

/** Retrieve the terminal presentation formatter for a tool, if any. */
export function getToolTerminalPresentation(
  tool: object,
): TerminalToolPresentationFormatter | undefined {
  return terminalPresentationByTool.get(tool);
}

/** Copy terminal presentation formatter from one tool to another. */
export function copyToolTerminalPresentation(source: object, target: object): void {
  const formatter = terminalPresentationByTool.get(source);
  if (formatter) {
    terminalPresentationByTool.set(target, formatter);
  }
}
