import type { Tool, ToolCall } from "./types";
/** Finds the target tool and validates/coerces a model-emitted tool call. */
export declare function validateToolCall(tools: Tool[], toolCall: ToolCall): unknown;
/** Validates tool arguments against TypeBox or plain JSON-schema parameters. */
export declare function validateToolArguments(tool: Tool, toolCall: ToolCall): unknown;
//# sourceMappingURL=validation.d.ts.map