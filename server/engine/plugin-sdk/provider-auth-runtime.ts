import crypto from "node:crypto";
import { createServer } from "node:http";

export type OAuthCallbackResult = {
  code: string;
  state: string;
};

export type ProviderAuthProfileMetadata = {
  profileId?: string;
  accountId?: string;
};

export function buildOAuthCallbackOriginResolver(
  allowedHosts: readonly string[] | undefined,
): (originHeader: string | string[] | undefined) => string | undefined {
  if (!allowedHosts || allowedHosts.length === 0) {
    return () => undefined;
  }
  const normalized = new Set(
    allowedHosts.map((host) => host.trim().toLowerCase()).filter((host) => host.length > 0),
  );
  if (normalized.size === 0) {
    return () => undefined;
  }
  return (originHeader) => {
    const value = Array.isArray(originHeader) ? originHeader[0] : originHeader;
    if (!value) {
      return undefined;
    }
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:") {
        return undefined;
      }
      return normalized.has(parsed.host.toLowerCase()) ? parsed.origin : undefined;
    } catch {
      return undefined;
    }
  };
}

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function parseOAuthCallbackInput(
  input: string,
  messages: {
    missingState?: string;
    invalidInput?: string;
  } = {},
): OAuthCallbackResult | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "No input provided" };
  }

  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) {
      return { error: "Missing 'code' parameter in URL" };
    }
    if (!state) {
      return { error: messages.missingState ?? "Missing 'state' parameter in URL" };
    }
    return { code, state };
  } catch {
    return { error: messages.invalidInput ?? "Paste the full redirect URL, not just the code." };
  }
}

export async function waitForLocalOAuthCallback(params: {
  expectedState: string;
  timeoutMs: number;
  port: number;
  callbackPath: string;
  redirectUri: string;
  successTitle: string;
  progressMessage?: string;
  hostname?: string;
  onProgress?: (message: string) => void;
  corsOriginAllowlist?: readonly string[];
}): Promise<OAuthCallbackResult> {
  const hostname = params.hostname ?? "localhost";
  const timeoutMs = Math.max(1, params.timeoutMs);
  const escapedSuccessTitle = escapeHtmlText(params.successTitle);
  const resolveOAuthCallbackOrigin = buildOAuthCallbackOriginResolver(params.corsOriginAllowlist);
  const hasCorsOriginAllowlist =
    params.corsOriginAllowlist?.some((host) => host.trim().length > 0) ?? false;

  return new Promise<OAuthCallbackResult>((resolve, reject) => {
    let settled = false;
    let timeout: NodeJS.Timeout | null = null;
    const server = createServer((req, res) => {
      try {
        applyOAuthCallbackCorsHeaders(
          req,
          res,
          hasCorsOriginAllowlist ? resolveOAuthCallbackOrigin : undefined,
        );
        const requestUrl = new URL(req.url ?? "/", `http://${hostname}:${params.port}`);
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (requestUrl.pathname !== params.callbackPath) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain");
          res.end("Not found");
          return;
        }
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Allow", "GET, OPTIONS");
          res.setHeader("Content-Type", "text/plain");
          res.end("Method not allowed");
          return;
        }

        const error = requestUrl.searchParams.get("error");
        const code = requestUrl.searchParams.get("code")?.trim();
        const state = requestUrl.searchParams.get("state")?.trim();

        if (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain");
          res.end(`Authentication failed: ${error}`);
          finish(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code || !state) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain");
          res.end("Missing code or state");
          finish(new Error("Missing OAuth code or state"));
          return;
        }

        if (state !== params.expectedState) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain");
          res.end("Invalid state");
          finish(new Error("OAuth state mismatch"));
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<!doctype html><html><head><meta charset='utf-8'/></head>" +
            `<body><h2>${escapedSuccessTitle}</h2>` +
            "<p>You can close this window and return to the application.</p></body></html>",
        );

        finish(undefined, { code, state });
      } catch (err) {
        finish(err instanceof Error ? err : new Error("OAuth callback failed"));
      }
    });

    const finish = (err?: Error, result?: OAuthCallbackResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      try {
        server.close();
      } catch {
        // ignore close errors
      }
      if (err) {
        reject(err);
      } else if (result) {
        resolve(result);
      }
    };

    server.once("error", (err) => {
      finish(err instanceof Error ? err : new Error("OAuth callback server error"));
    });

    server.listen(params.port, hostname, () => {
      params.onProgress?.(
        params.progressMessage ?? `Waiting for OAuth callback on ${params.redirectUri}...`,
      );
    });

    timeout = setTimeout(() => {
      finish(new Error("OAuth callback timeout"));
    }, timeoutMs);
  });
}

function applyOAuthCallbackCorsHeaders(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  resolveOrigin?: (originHeader: string | string[] | undefined) => string | undefined,
): void {
  const origin =
    resolveOrigin === undefined
      ? typeof req.headers.origin === "string" && isHttpOrigin(req.headers.origin)
        ? req.headers.origin
        : undefined
      : resolveOrigin(req.headers.origin);
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
  }
  if (resolveOrigin !== undefined && !origin) {
    return;
  }

  const requestedHeaders = req.headers["access-control-request-headers"];
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    typeof requestedHeaders === "string" && requestedHeaders.trim().length > 0
      ? requestedHeaders
      : "content-type",
  );
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Max-Age", "600");
}

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
  } catch {
    return false;
  }
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
