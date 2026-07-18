import { createHttpError, type HttpMethod, type HttpRequestLike, type HttpResponseLike, sendJsonResponse, sendErrorResponse, isHttpError } from './http-common.js';

export type EndpointHandler = (
  req: HttpRequestLike,
  res: HttpResponseLike,
  params: Record<string, string>,
) => Promise<void> | void;

export type EndpointDefinition = {
  path: string;
  method: HttpMethod;
  handler: EndpointHandler;
  middleware?: EndpointHandler[];
  description?: string;
  tags?: string[];
};

type RegisteredEndpoint = EndpointDefinition & {
  pattern: RegExp;
  paramNames: string[];
};

const endpoints: RegisteredEndpoint[] = [];

function pathToRegexp(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  let pattern = path.replace(/:[^/]+/g, (match) => {
    paramNames.push(match.slice(1));
    return '([^/]+)';
  });
  pattern = pattern.replace(/\*/g, '.*');
  return { pattern: new RegExp(`^${pattern}$`), paramNames };
}

export function registerEndpoint(definition: EndpointDefinition): void {
  const { pattern, paramNames } = pathToRegexp(definition.path);
  endpoints.push({
    ...definition,
    pattern,
    paramNames,
  });
}

export function unregisterEndpoint(path: string, method: HttpMethod): boolean {
  const index = endpoints.findIndex(
    (ep) => ep.path === path && ep.method === method,
  );
  if (index >= 0) {
    endpoints.splice(index, 1);
    return true;
  }
  return false;
}

export function findMatchingEndpoint(
  path: string,
  method: HttpMethod,
): { endpoint: RegisteredEndpoint; params: Record<string, string> } | undefined {
  for (const endpoint of endpoints) {
    if (endpoint.method !== method) continue;
    const match = endpoint.pattern.exec(path);
    if (match) {
      const params: Record<string, string> = {};
      for (let i = 0; i < endpoint.paramNames.length; i++) {
        params[endpoint.paramNames[i]] = match[i + 1] ?? '';
      }
      return { endpoint, params };
    }
  }
  return undefined;
}

export function listEndpoints(): EndpointDefinition[] {
  return endpoints.map(({ pattern, paramNames, ...rest }) => rest);
}

export async function handleEndpointRequest(
  req: HttpRequestLike,
  res: HttpResponseLike,
): Promise<boolean> {
  const method = (req.method?.toUpperCase() ?? 'GET') as HttpMethod;
  let path = req.path ?? '/';
  const queryIndex = path.indexOf('?');
  if (queryIndex >= 0) {
    path = path.slice(0, queryIndex);
  }

  if (method === 'OPTIONS') {
    handleOptionsRequest(req, res);
    return true;
  }

  const match = findMatchingEndpoint(path, method);
  if (!match) {
    return false;
  }

  try {
    const { endpoint, params } = match;

    if (endpoint.middleware) {
      for (const middleware of endpoint.middleware) {
        await Promise.resolve(middleware(req, res, params));
      }
    }

    await Promise.resolve(endpoint.handler(req, res, params));
    return true;
  } catch (err) {
    const httpError = isHttpError(err)
      ? err
      : createHttpError(500, err instanceof Error ? err.message : 'Internal Server Error');
    sendErrorResponse(res, httpError);
    return true;
  }
}

function handleOptionsRequest(_req: HttpRequestLike, res: HttpResponseLike): void {
  if (res.setHeader) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (res.statusCode !== undefined) {
    res.statusCode = 204;
  }
  if (res.end) {
    res.end();
  }
}

export function createJsonEndpoint<TResult>(
  definition: Omit<EndpointDefinition, 'handler'> & {
    handler: (
      req: HttpRequestLike,
      params: Record<string, string>,
    ) => Promise<TResult> | TResult;
  },
): EndpointDefinition {
  return {
    ...definition,
    handler: async (req, res, params) => {
      const result = await Promise.resolve(definition.handler(req, params));
      sendJsonResponse(res, 200, result);
    },
  };
}

export function clearEndpointsForTests(): void {
  endpoints.length = 0;
}
