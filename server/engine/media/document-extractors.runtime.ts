// Document extractor runtime — cross-wms stub for openclaw's plugin-based
// document extraction. Replaces the openclaw plugin registry with a direct
// pdf-parse adapter for application/pdf. The `pdf-parse` package is loaded via
// a non-literal dynamic import so it stays out of type-checking (the package
// ships no type declarations). Image extraction is not supported by pdf-parse,
// so results always carry an empty images array.
import { normalizeLowercaseStringOrEmpty } from "./string-helpers.js";

/** Image extracted from a document page. */
export type DocumentExtractedImage = {
  type: "image";
  data: string;
  mimeType: string;
};

/** Request passed to document extractors. */
export type DocumentExtractionRequest = {
  buffer: Buffer;
  mimeType: string;
  maxPages: number;
  maxPixels: number;
  minTextChars: number;
  password?: string;
  pageNumbers?: number[];
  onImageExtractionError?: (error: unknown) => void;
};

/** Text and image result returned by a document extractor. */
export type DocumentExtractionResult = {
  text: string;
  images: DocumentExtractedImage[];
};

type PdfParseResult = {
  text: string;
  numpages?: number;
  numrender?: number;
  info?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type PdfParseFn = (
  dataBuffer: Buffer,
  options?: Record<string, unknown>,
) => Promise<PdfParseResult>;

// Non-literal specifier so TypeScript does not resolve the `pdf-parse` module
// at type-check time (the package ships no type declarations).
const PDF_PARSE_MODULE = "pdf-parse";

let pdfParseLoader: Promise<PdfParseFn> | undefined;

async function loadPdfParse(): Promise<PdfParseFn> {
  pdfParseLoader ??= (async () => {
    const mod: unknown = await import(PDF_PARSE_MODULE);
    const fn = (mod as { default?: PdfParseFn } & PdfParseFn).default ?? (mod as PdfParseFn);
    if (typeof fn !== "function") {
      throw new Error("pdf-parse did not expose a callable default export.");
    }
    return fn;
  })();
  return pdfParseLoader;
}

/**
 * Extracts document content for supported MIME types. Currently only
 * application/pdf is supported (via pdf-parse); other types return null so
 * callers can surface an "extraction unavailable" error.
 */
export async function extractDocumentContent(
  params: DocumentExtractionRequest & {
    config?: unknown;
  },
): Promise<(DocumentExtractionResult & { extractor: string }) | null> {
  const mimeType = normalizeLowercaseStringOrEmpty(params.mimeType);
  if (mimeType !== "application/pdf") {
    return null;
  }

  const pdfParse = await loadPdfParse();
  const result = await pdfParse(params.buffer);
  return {
    text: result.text ?? "",
    images: [],
    extractor: "pdf-parse",
  };
}
