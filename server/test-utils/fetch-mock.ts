type FetchMockHandler = (url: string, options: RequestInit) => Response | Promise<Response>;

interface FetchMockEntry {
  method: string;
  path: string | RegExp;
  handler: FetchMockHandler;
}

class FetchMock {
  private mocks: FetchMockEntry[] = [];
  private originalFetch: typeof fetch | undefined;
  private enabled = false;

  mock(method: string, path: string | RegExp, handler: FetchMockHandler): void {
    this.mocks.push({ method: method.toUpperCase(), path, handler });
  }

  get(path: string | RegExp, handler: FetchMockHandler): void {
    this.mock('GET', path, handler);
  }

  post(path: string | RegExp, handler: FetchMockHandler): void {
    this.mock('POST', path, handler);
  }

  put(path: string | RegExp, handler: FetchMockHandler): void {
    this.mock('PUT', path, handler);
  }

  delete(path: string | RegExp, handler: FetchMockHandler): void {
    this.mock('DELETE', path, handler);
  }

  json(path: string | RegExp, data: unknown, status = 200): void {
    this.get(path, () => Response.json(data, { status }));
  }

  postJson(path: string | RegExp, data: unknown, status = 200): void {
    this.post(path, () => Response.json(data, { status }));
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, options: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (options.method || 'GET').toUpperCase();

      for (const mock of this.mocks) {
        const matchesPath = typeof mock.path === 'string'
          ? url === mock.path || url.endsWith(mock.path)
          : mock.path.test(url);
        if (mock.method === method && matchesPath) {
          return mock.handler(url, options);
        }
      }

      if (this.originalFetch) {
        return this.originalFetch(input, options);
      }
      throw new Error(`No mock found for ${method} ${url}`);
    };
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
      this.originalFetch = undefined;
    }
  }

  clear(): void {
    this.mocks = [];
  }
}

export function createFetchMock(): FetchMock {
  return new FetchMock();
}

export function setupFetchMock(): { mock: FetchMock; cleanup: () => void } {
  const mock = createFetchMock();
  mock.enable();
  const cleanup = () => {
    mock.disable();
    mock.clear();
  };
  return { mock, cleanup };
}

/** Fetch mock shape used by tests that replace global fetch. */
export type FetchMockSignature = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type FetchPreconnectOptions = {
  dns?: boolean;
  tcp?: boolean;
  http?: boolean;
  https?: boolean;
};

type FetchWithPreconnect = {
  preconnect: (url: string | URL, options?: FetchPreconnectOptions) => void;
  __openclawAcceptsDispatcher: true;
};

export function withFetchPreconnect<T extends typeof fetch>(fn: T): T & FetchWithPreconnect;
export function withFetchPreconnect<T extends object>(
  fn: T,
): T & FetchWithPreconnect & typeof fetch;
export function withFetchPreconnect(fn: object) {
  return Object.assign(fn, {
    preconnect: (_url: string | URL, _options?: FetchPreconnectOptions) => {},
    __openclawAcceptsDispatcher: true as const,
  });
}