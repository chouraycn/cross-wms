// Terminal Core module implements prompt select styled behavior.
import { select } from "@clack/prompts";
import { styleSelectParams } from "./prompt-select-styled-params.js";

// Clack select wrapper that applies OpenClaw prompt styling.

/** Run a clack select prompt with styled message and hints. */
export function selectStyled(params: Parameters<typeof select>[0]) {
  return select(styleSelectParams(params));
}
