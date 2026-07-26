// Resolves inbound attachment text-extraction limits for media-understanding.
// Ported from openclaw/src/media-understanding/file-extraction-limits.ts.
// Simplified for cross-wms: removed dependency on ../media/input-files.js,
// provides basic limit constants and resolution helpers.
import type { OpenClawConfig } from "../config/types.openclaw.js";

const INBOUND_FILE_EXTRACTION_DEFAULT_MAX_MB = 20;
const INBOUND_FILE_EXTRACTION_MAX_BYTES_CAP = 25 * 1024 * 1024;
const INBOUND_FILE_EXTRACTION_DEFAULT_MAX_PAGES = 20;
const INBOUND_FILE_EXTRACTION_MAX_PAGES_CAP = 150;

type InboundFileExtractionDefaults = {
  mediaMaxMb?: number;
  pdfMaxPages?: number;
};

/** Resolved inbound file extraction limits. */
export type FileExtractionLimits = {
  maxBytes: number;
  pdf: {
    maxPages: number;
  };
  allowedMimesConfigured: boolean;
  allowedMimes?: readonly string[];
};

function positiveExtractionLimit(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function resolveInboundFileExtractionMaxBytes(
  defaults: InboundFileExtractionDefaults | undefined,
): number {
  const maxMb =
    positiveExtractionLimit(defaults?.mediaMaxMb) ?? INBOUND_FILE_EXTRACTION_DEFAULT_MAX_MB;
  return Math.min(Math.floor(maxMb * 1024 * 1024), INBOUND_FILE_EXTRACTION_MAX_BYTES_CAP);
}

function resolveInboundFileExtractionMaxPages(
  defaults: InboundFileExtractionDefaults | undefined,
): number {
  const pages =
    positiveExtractionLimit(defaults?.pdfMaxPages) ?? INBOUND_FILE_EXTRACTION_DEFAULT_MAX_PAGES;
  return Math.min(Math.trunc(pages), INBOUND_FILE_EXTRACTION_MAX_PAGES_CAP);
}

/** Builds inbound attachment extraction limits, sized to the agent's media/PDF config. */
export function resolveFileExtractionLimits(cfg: OpenClawConfig): FileExtractionLimits {
  const files = cfg.gateway?.http?.endpoints?.responses?.files;
  const allowedMimesConfigured = Boolean(files?.allowedMimes?.length);
  const defaults = cfg.agents?.defaults;
  const maxBytes =
    typeof files?.maxBytes === "number" && files.maxBytes > 0
      ? files.maxBytes
      : resolveInboundFileExtractionMaxBytes(defaults);
  const pdfMaxPages =
    typeof files?.pdf?.maxPages === "number" && files.pdf.maxPages > 0
      ? files.pdf.maxPages
      : resolveInboundFileExtractionMaxPages(defaults);

  return {
    maxBytes,
    pdf: {
      maxPages: pdfMaxPages,
    },
    allowedMimesConfigured,
    allowedMimes: files?.allowedMimes,
  };
}
