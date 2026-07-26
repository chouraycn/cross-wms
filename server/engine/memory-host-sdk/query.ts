/**
 * Memory query contract facade for core callers. Keep query types and helpers
 * routed through this local path instead of package implementation paths.
 *
 * Ported from openclaw/src/memory-host-sdk/query.ts. Re-exports from the
 * cross-wms packages/memory-host-sdk/src implementation.
 */
export * from "../../../packages/memory-host-sdk/src/query.js";
