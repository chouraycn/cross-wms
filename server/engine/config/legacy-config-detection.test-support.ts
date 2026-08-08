// Provides assertions for legacy config detection tests.
import { expect } from "vitest";

type SchemaParseResult<TData = unknown> =
  | { success: true; data: TData }
  | { success: false; error: { issues: Array<{ path: PropertyKey[]; message?: string }> } };

/** Asserts a schema accepts config and exposes the expected normalized value. */
export function expectSchemaConfigValue(params: {
  schema: { safeParse: (value: any) => SchemaParseResult };
  config: any;
  readValue: (config: any) => unknown;
  expectedValue: any;
}) {
  const res = params.schema.safeParse(params.config);
  expect(res.success).toBe(true);
  if (!res.success) {
    throw new Error("expected schema config to be valid");
  }
  expect(params.readValue(res.data)).toBe(params.expectedValue);
}

export function expectSchemaValid(
  schema: { safeParse: (value: any) => SchemaParseResult },
  config: any,
) {
  const res = schema.safeParse(config);
  expect(res.success).toBe(true);
}
