export function isRunnerToolCallBlockType(type: any): boolean {
  return type === "toolCall" || type === "toolUse" || type === "functionCall";
}
