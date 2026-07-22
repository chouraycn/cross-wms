import JSON5 from "json5";

export function parseJsonWithJson5Fallback(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON5.parse(text);
    } catch (e) {
      throw new Error(`Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}