/**
 * Process send-keys helpers for bash process tool.
 * Ported from openclaw/src/agents/bash-tools.process-send-keys.ts
 */

/** Parse a send-keys string into individual key sequences. */
export function parseSendKeysSequence(input: string): string[] {
  if (!input) return [];
  const sequences: string[] = [];
  let current = "";
  let i = 0;
  while (i < input.length) {
    if (input[i] === "\\") {
      if (i + 1 < input.length) {
        const next = input[i + 1];
        switch (next) {
          case "n":
            current += "\n";
            i += 2;
            continue;
          case "t":
            current += "\t";
            i += 2;
            continue;
          case "r":
            current += "\r";
            i += 2;
            continue;
          case "\\":
            current += "\\";
            i += 2;
            continue;
          default:
            current += input[i];
            i += 1;
            continue;
        }
      } else {
        current += input[i];
        i += 1;
      }
    } else {
      current += input[i];
      i += 1;
    }
  }
  if (current) {
    sequences.push(current);
  }
  return sequences.length > 0 ? sequences : [input];
}

/** Encode key sequences for PTY stdin write. */
export function encodeSendKeysForPty(sequences: string[]): string {
  return sequences.join("");
}
