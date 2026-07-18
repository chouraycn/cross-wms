import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '../../logger.js';
import { executeToolCall } from '../tools/index.js';
import { sendJsonResponse, createHttpError } from './http-common.js';

const DEFAULT_BODY_BYTES = 2 * 1024 * 1024;

export type ToolsInvokeInput = {
  tool: string;
  parameters?: Record<string, unknown>;
  sessionKey?: string;
  sessionId?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
};

export type ToolsInvokeResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
  errorCode?: string;
  toolCallId?: string;
  durationMs?: number;
};

async function readJsonBodyFromRequest(
  req: IncomingMessage,
  maxBytes: number,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  return new Promise((resolve) => {
    let data = '';
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        resolve({ success: false, error: 'Request body too large' });
        req.destroy();
        return;
      }
      data += chunk.toString();
    });

    req.on('end', () => {
      try {
        const parsed = data.length > 0 ? JSON.parse(data) : {};
        resolve({ success: true, data: parsed });
      } catch {
        resolve({ success: false, error: 'Invalid JSON body' });
      }
    });

    req.on('error', () => {
      resolve({ success: false, error: 'Failed to read request body' });
    });
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  sendJsonResponse(res, status, body);
}

function sendMethodNotAllowed(res: ServerResponse, allowedMethod: string): void {
  const err = createHttpError(405, `Method not allowed. Use ${allowedMethod}`, 'METHOD_NOT_ALLOWED');
  sendJsonResponse(res, 405, { error: err.message, code: err.code });
}

export async function handleToolsInvokeHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    maxBodyBytes?: number;
  },
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad_request', message: 'Invalid request URL' }));
    return true;
  }

  if (url.pathname !== '/tools/invoke' && !url.pathname.startsWith('/tools/invoke/')) {
    return false;
  }

  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, 'POST');
    return true;
  }

  try {
    const bodyUnknown = await readJsonBodyFromRequest(req, opts.maxBodyBytes ?? DEFAULT_BODY_BYTES);
    if (!bodyUnknown.success) {
      sendJson(res, 400, {
        ok: false,
        error: bodyUnknown.error ?? 'Failed to read request body',
        errorCode: 'BAD_REQUEST',
      });
      return true;
    }

    const body = bodyUnknown.data as ToolsInvokeInput;

    if (!body.tool || typeof body.tool !== 'string') {
      sendJson(res, 400, {
        ok: false,
        error: 'Tool name is required',
        errorCode: 'TOOL_REQUIRED',
      });
      return true;
    }

    const startTime = Date.now();
    const toolCallId = `http-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    logger.info(`[Gateway] Tool invoke: ${body.tool} (${toolCallId})`);

    try {
      const result = await executeToolCall({
        tool: body.tool,
        parameters: body.parameters ?? {},
        sessionKey: body.sessionKey,
        sessionId: body.sessionId,
        timeoutMs: body.timeoutMs,
      } as unknown as Parameters<typeof executeToolCall>[0]);

      const durationMs = Date.now() - startTime;

      if (result && typeof result === 'object' && 'error' in result) {
        logger.warn(`[Gateway] Tool invoke failed: ${body.tool} - ${String((result as Record<string, unknown>).error)}`);
        sendJson(res, 500, {
          ok: false,
          error: String((result as Record<string, unknown>).error),
          errorCode: 'TOOL_EXECUTION_ERROR',
          toolCallId,
          durationMs,
        });
      } else {
        logger.debug(`[Gateway] Tool invoke success: ${body.tool} (${durationMs}ms)`);
        sendJson(res, 200, {
          ok: true,
          result,
          toolCallId,
          durationMs,
        });
      }
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(`[Gateway] Tool invoke error: ${body.tool}`, err);
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        errorCode: 'INTERNAL_ERROR',
        toolCallId,
        durationMs,
      });
    }
  } catch (err) {
    logger.error('[Gateway] Tools invoke handler error:', err);
    sendJson(res, 500, {
      ok: false,
      error: 'Internal server error',
      errorCode: 'INTERNAL_ERROR',
    });
  }

  return true;
}

export async function handleToolsListHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    return false;
  }

  if (url.pathname !== '/tools' && url.pathname !== '/tools/list') {
    return false;
  }

  if (req.method !== 'GET') {
    sendMethodNotAllowed(res, 'GET');
    return true;
  }

  try {
    const { resolveGatewayScopedTools } = await import('./tool-resolution.js');
    const result = resolveGatewayScopedTools({
      surface: 'http',
    });

    sendJson(res, 200, {
      ok: true,
      tools: result.tools,
      total: result.total,
      filtered: result.filtered,
    });
  } catch (err) {
    logger.error('[Gateway] Tools list handler error:', err);
    sendJson(res, 500, {
      ok: false,
      error: 'Internal server error',
      errorCode: 'INTERNAL_ERROR',
    });
  }

  return true;
}
