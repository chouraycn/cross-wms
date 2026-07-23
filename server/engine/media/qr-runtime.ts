// QR runtime helpers lazily load QR code generation and normalize QR text.
// Ported from openclaw media. The `qrcode` package is an optional runtime
// dependency: a non-literal dynamic import keeps it out of type-checking and
// the media startup path. The lazy loader is inlined here to avoid pulling in
// openclaw's shared/lazy-promise module.

type QrCodeModules = { data: ArrayLike<boolean | number>; size: number };

type QrCodeRuntime = {
  toDataURL(text: string, opts?: Record<string, unknown>): Promise<string>;
  toString(text: string, opts?: Record<string, unknown>): Promise<string>;
  create(text: string): { modules: QrCodeModules };
};

type LazyPromiseLoader<T> = {
  load(): Promise<T>;
  clear(): void;
};

function createLazyImportLoader<T>(load: () => Promise<T>): LazyPromiseLoader<T> {
  let promise: Promise<T> | undefined;
  const createPromise = (): Promise<T> => {
    const loaded = Promise.resolve().then(load);
    // Failed lazy loads are usually transient import/runtime issues; evict the
    // rejected promise so the next caller can retry without racing a newer load.
    void loaded.catch(() => {
      if (promise === loaded) {
        promise = undefined;
      }
    });
    return loaded;
  };
  return {
    async load(): Promise<T> {
      promise ??= createPromise();
      return await promise;
    },
    clear(): void {
      promise = undefined;
    },
  };
}

// Non-literal specifier so TypeScript does not resolve the `qrcode` module at
// type-check time (the package is an optional peer dependency for cross-wms).
const QRCODE_MODULE = "qrcode";

const qrCodeRuntimeLoader = createLazyImportLoader<QrCodeRuntime>(async () => {
  const mod: unknown = await import(QRCODE_MODULE);
  const api = (mod as { default?: QrCodeRuntime } & QrCodeRuntime).default ?? (mod as QrCodeRuntime);
  return api;
});

/** Loads the qrcode package lazily so QR support does not affect media startup paths. */
export async function loadQrCodeRuntime(): Promise<QrCodeRuntime> {
  return await qrCodeRuntimeLoader.load();
}

/** Validates QR text before passing it to the renderer runtime. */
export function normalizeQrText(text: string): string {
  if (typeof text !== "string") {
    throw new TypeError("QR text must be a string.");
  }
  if (text.length === 0) {
    throw new Error("QR text must not be empty.");
  }
  return text;
}
