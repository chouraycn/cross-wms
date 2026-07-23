import type { CommandStep } from "./types.js";

export type ShellCommandExplanation = {
  topLevelCommands: CommandStep[];
  nestedCommands: CommandStep[];
};

export function explainShellCommand(_command: string): ShellCommandExplanation {
  return { topLevelCommands: [], nestedCommands: [] };
}
