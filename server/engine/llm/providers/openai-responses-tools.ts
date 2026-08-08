import type { Tool } from '../extended-types.js';

export interface ConvertResponsesToolsOptions {
  strict?: boolean | null;
  model?: any;
  supportsStrictMode?: boolean;
}

export type ConvertedResponsesTools = {
  tools: Array<{ type: "function"; name: string; description?: string; parameters: Record<string, any>; strict?: boolean | null }>;
};

export function convertResponsesTools(
  tools: Tool[],
  options?: ConvertResponsesToolsOptions,
): Array<{ type: "function"; name: string; description?: string; parameters: Record<string, any>; strict?: boolean | null }> {
  return convertResponsesToolPayload(tools, options).tools;
}

export function convertResponsesToolPayload(
  tools: Tool[],
  options?: ConvertResponsesToolsOptions,
): ConvertedResponsesTools {
  const strict = options?.strict ?? false;
  const convertedTools = sortResponsesToolsByName(tools).map((tool) => {
    const result: { type: "function"; name: string; description?: string; parameters: Record<string, any>; strict?: boolean | null } = {
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, any>,
    };
    if (strict !== undefined) {
      result.strict = strict;
    }
    return result;
  });
  return { tools: convertedTools };
}

function compareToolText(left: string | undefined, right: string | undefined): number {
  const leftText = left ?? "";
  const rightText = right ?? "";
  if (leftText < rightText) {
    return -1;
  }
  if (leftText > rightText) {
    return 1;
  }
  return 0;
}

function sortResponsesToolsByName<T extends { name?: string; description?: string }>(
  tools: readonly T[],
): T[] {
  return tools.toSorted(
    (left, right) =>
      compareToolText(left.name, right.name) ||
      compareToolText(left.description, right.description),
  );
}
