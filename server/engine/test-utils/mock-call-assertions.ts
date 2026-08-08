// Assertion helpers for inspecting Vitest mock call payloads.
import { expect } from "vitest";

/** Returns a mock call with a useful failure when the call is missing. */
export function mockCall(mock: any, index = 0): Array<any> {
  const calls = (mock as { mock?: { calls?: Array<Array<any>> } }).mock?.calls ?? [];
  const call = calls.at(index);
  if (!call) {
    throw new Error(`Expected mock call ${index + 1}`);
  }
  return call;
}

export function mockFirstObjectArg(mock: any): Record<string, any> {
  const [arg] = mockCall(mock);
  if (!arg || typeof arg !== "object") {
    throw new Error("expected first mock argument object");
  }
  return arg as Record<string, any>;
}

export function expectObjectFields(value: any, expected: Record<string, any>): void {
  if (!value || typeof value !== "object") {
    throw new Error("expected object fields");
  }
  const record = value as Record<string, any>;
  for (const [key, expectedValue] of Object.entries(expected)) {
    expect(record[key], key).toEqual(expectedValue);
  }
}
