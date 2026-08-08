import type { AssistantMessageDiagnostic } from "../../../packages/llm-core/src/utils/diagnostics.js";

type AnthropicRefusalOutput = {
  stopReason: string;
  errorMessage?: string;
  diagnostics?: AssistantMessageDiagnostic[];
};

type AnthropicRefusalDetails = {
  category: string | null;
  explanation: string | null;
};

function readNullableString(value: any): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readAnthropicRefusalDetails(value: any): AnthropicRefusalDetails {
  if (!value || typeof value !== "object") {
    return { category: null, explanation: null };
  }
  const details = value as Record<string, any>;
  return {
    category: readNullableString(details.category),
    explanation: readNullableString(details.explanation),
  };
}

function formatAnthropicRefusalMessage(details: AnthropicRefusalDetails): string {
  const category = details.category ? ` (category: ${details.category})` : "";
  const explanation = details.explanation ? `: ${details.explanation}` : ".";
  return `Anthropic refusal${category}${explanation}`;
}

export function applyAnthropicRefusal(
  output: AnthropicRefusalOutput,
  stopDetails: any,
  provider: string,
): void {
  const details = readAnthropicRefusalDetails(stopDetails);
  output.stopReason = "error";
  output.errorMessage = formatAnthropicRefusalMessage(details);
  output.diagnostics = [
    ...(output.diagnostics ?? []),
    {
      type: "provider_refusal",
      timestamp: Date.now(),
      details: {
        provider,
        category: details.category,
        explanation: details.explanation,
      },
    },
  ];
}
