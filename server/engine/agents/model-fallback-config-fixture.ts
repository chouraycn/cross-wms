/**
 * Ported from openclaw/src/agents/test-helpers/model-fallback-config-fixture.ts
 *
 * Model fallback config fixture for tests.
 * Cross-wms degradation: returns minimal config without model registry.
 */

/** Creates a model fallback config fixture for testing. */
export function makeModelFallbackCfg(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    provider: "test",
    model: "test-model",
    ...overrides,
  };
}
