import { Router, type Request, type Response } from 'express';
import {
  handleAcpRequest,
  runDoctorChecks,
  type AcpRequestEnvelope,
  type AcpResponseEnvelope,
  type DoctorReport,
} from '../engine/acp/index.js';

const router = Router();

// ===================== ACP JSON-RPC Dispatch =====================
//
// ADDITIVE integration only. This route exposes ACP's capabilities
// (read-only diagnostics + session bookkeeping) without touching the live
// chat path (runChatSession / chatService / /api/agent-chat).
//
// The POST endpoint acts as a thin JSON-RPC 2.0 pass-through: the body is an
// AcpRequestEnvelope and the response is the raw AcpResponseEnvelope that
// clients expect. Unimplemented methods (e.g. turns/run) degrade gracefully
// with a JSON-RPC "Method not found" error from the ACP server.

/**
 * POST /api/acp
 * Dispatches an ACP JSON-RPC 2.0 request envelope.
 *
 * Supported methods: sessions/list, sessions/get, sessions/create,
 * sessions/close, health, tools/list, models/list.
 * (turns/run is NOT implemented server-side — returns a graceful error.)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const envelope = req.body as AcpRequestEnvelope;
    if (
      !envelope ||
      envelope.jsonrpc !== '2.0' ||
      typeof envelope.method !== 'string'
    ) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: (envelope && (envelope as { id?: string | number }).id) ?? null,
        error: {
          code: -32600,
          message: 'Invalid ACP request envelope (expected JSON-RPC 2.0)',
        },
      });
      return;
    }

    const result: AcpResponseEnvelope = await handleAcpRequest(envelope);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/acp/health
 * Returns ACP server health via JSON-RPC dispatch.
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const result: AcpResponseEnvelope = await handleAcpRequest({
      jsonrpc: '2.0',
      id: '1',
      method: 'health',
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/acp/doctor
 * Runs ACP diagnostic checks and returns the DoctorReport.
 * Additive + safe — never mutates live chat state.
 */
router.get('/doctor', async (_req: Request, res: Response) => {
  try {
    const report: DoctorReport = await runDoctorChecks();
    res.json({ success: true, data: report });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

export default router;
