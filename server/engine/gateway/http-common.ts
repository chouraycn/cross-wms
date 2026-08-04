export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type HttpHeaders = Record<string, string | string[] | undefined>;

export type HttpRequestLike = {
  method?: string;
  url?: string;
  path?: string;
  headers: HttpHeaders;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  ip?: string;
  hostname?: string;
};

export type HttpResponseLike = {
  statusCode?: number;
  setHeader?: (name: string, value: string) => void;
  end?: (body?: string) => void;
  json?: (body: unknown) => void;
};

export type HttpError = {
  status: number;
  message: string;
  code?: string;
  details?: unknown;
};

export function normalizeHttpMethod(method: string | undefined): HttpMethod {
  if (!method) return 'GET';
  const upper = method.toUpperCase();
  const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  return validMethods.includes(upper as HttpMethod) ? (upper as HttpMethod) : 'GET';
}

export function getHeaderValue(
  headers: HttpHeaders,
  name: string,
): string | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return typeof value === 'string' ? value : value?.[0];
    }
  }
  return undefined;
}

export function getHeaderValues(
  headers: HttpHeaders,
  name: string,
): string[] {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return typeof value === 'string' ? [value] : value ?? [];
    }
  }
  return [];
}

export function parseQueryString(queryString: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  if (!queryString || queryString === '?') return result;

  const stripped = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  const pairs = stripped.split('&');

  for (const pair of pairs) {
    if (!pair) continue;
    const [key, value] = pair.split('=');
    const decodedKey = decodeURIComponent(key ?? '');
    const decodedValue = value !== undefined ? decodeURIComponent(value) : '';

    if (decodedKey in result) {
      const existing = result[decodedKey];
      if (Array.isArray(existing)) {
        existing.push(decodedValue);
      } else {
        result[decodedKey] = [existing, decodedValue];
      }
    } else {
      result[decodedKey] = decodedValue;
    }
  }

  return result;
}

export function getRequestPath(req: HttpRequestLike): string {
  if (req.path) return req.path;
  const url = req.url ?? '/';
  const queryIndex = url.indexOf('?');
  return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
}

export function getRequestQuery(req: HttpRequestLike): Record<string, string | string[] | undefined> {
  if (req.query) return req.query;
  const url = req.url ?? '';
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) return {};
  return parseQueryString(url.slice(queryIndex));
}

export function createHttpError(status: number, message: string, code?: string): HttpError {
  return { status, message, code };
}

export function isHttpError(error: unknown): error is HttpError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'message' in error &&
    typeof (error as HttpError).status === 'number'
  );
}

export function setCorsHeaders(
  res: HttpResponseLike,
  options: {
    origin?: string;
    methods?: HttpMethod[];
    headers?: string[];
    credentials?: boolean;
    maxAge?: number;
  } = {},
): void {
  if (!res.setHeader) return;

  if (options.origin) {
    res.setHeader('Access-Control-Allow-Origin', options.origin);
  }

  if (options.methods) {
    res.setHeader('Access-Control-Allow-Methods', options.methods.join(', '));
  }

  if (options.headers) {
    res.setHeader('Access-Control-Allow-Headers', options.headers.join(', '));
  }

  if (options.credentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (options.maxAge !== undefined) {
    res.setHeader('Access-Control-Max-Age', String(options.maxAge));
  }
}

export function sendJsonResponse(res: HttpResponseLike, status: number, body: unknown): void {
  if (res.statusCode !== undefined) {
    res.statusCode = status;
  }
  if (res.setHeader) {
    res.setHeader('Content-Type', 'application/json');
  }
  if (res.json) {
    res.json(body);
  } else if (res.end) {
    res.end(JSON.stringify(body));
  }
}

export function sendErrorResponse(res: HttpResponseLike, error: HttpError): void {
  sendJsonResponse(res, error.status, {
    error: error.message,
    code: error.code,
    details: error.details,
  });
}

// ============================================================================
// Node.js ServerResponse-based helpers (ported from openclaw gateway/http-common)
// ============================================================================

import type { IncomingMessage, ServerResponse } from "node:http";

export function setDefaultSecurityHeaders(
  res: ServerResponse,
  opts?: { strictTransportSecurity?: string },
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  const strictTransportSecurity = opts?.strictTransportSecurity;
  if (typeof strictTransportSecurity === "string" && strictTransportSecurity.length > 0) {
    res.setHeader("Strict-Transport-Security", strictTransportSecurity);
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function sendText(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(body);
}

export function sendMethodNotAllowed(res: ServerResponse, allow = "POST"): void {
  res.setHeader("Allow", allow);
  sendText(res, 405, "Method Not Allowed");
}

export function sendUnauthorized(res: ServerResponse): void {
  sendJson(res, 401, {
    error: { message: "Unauthorized", type: "unauthorized" },
  });
}

export function sendRateLimited(res: ServerResponse, retryAfterMs?: number): void {
  if (retryAfterMs && retryAfterMs > 0) {
    res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
  }
  sendJson(res, 429, {
    error: {
      message: "Too many failed authentication attempts. Please try again later.",
      type: "rate_limited",
    },
  });
}

export function sendGatewayAuthFailure(res: ServerResponse, authResult: { rateLimited?: boolean; retryAfterMs?: number }): void {
  if (authResult.rateLimited) {
    sendRateLimited(res, authResult.retryAfterMs);
    return;
  }
  sendUnauthorized(res);
}

export function sendInvalidRequest(res: ServerResponse, message: string): void {
  sendJson(res, 400, {
    error: { message, type: "invalid_request_error" },
  });
}

export function buildMissingScopeForbiddenBody(missingScope: string | undefined) {
  return {
    ok: false,
    error: {
      type: "forbidden",
      message: `missing scope: ${missingScope}`,
    },
  };
}

export function sendMissingScopeForbidden(res: ServerResponse, missingScope: string | undefined): void {
  sendJson(res, 403, buildMissingScopeForbiddenBody(missingScope));
}

export function writeDone(res: ServerResponse): void {
  res.write("data: [DONE]\n\n");
}

export function setSseHeaders(res: ServerResponse): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

export function watchClientDisconnect(
  req: IncomingMessage,
  res: ServerResponse,
  abortController: AbortController,
  onDisconnect?: () => void,
): () => void {
  const sockets = Array.from(
    new Set(
      [req.socket, res.socket].filter(
        (socket): socket is NonNullable<typeof socket> => socket !== null,
      ),
    ),
  );
  if (sockets.length === 0) {
    return () => {};
  }
  const handleClose = () => {
    onDisconnect?.();
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
  };
  for (const socket of sockets) {
    socket.on("close", handleClose);
  }
  return () => {
    for (const socket of sockets) {
      socket.off("close", handleClose);
    }
  };
}
