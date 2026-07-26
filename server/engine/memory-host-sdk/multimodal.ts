/**
 * Core-facing multimodal memory helpers. The shared SDK package owns modality
 * detection and payload contracts; this facade keeps internal imports stable.
 *
 * Ported from openclaw/src/memory-host-sdk/multimodal.ts. Re-exports from the
 * cross-wms packages/memory-host-sdk/src implementation.
 */
export * from "../../../packages/memory-host-sdk/src/multimodal.js";
