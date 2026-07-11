/**
 * channelsCore route — ADDITIVE exposure of the richer channel layer.
 *
 * This router exposes the previously-unwired channel subsystem (access gates,
 * adapters, inbound pipeline, channel lookup) under /api/channels-core.
 *
 * SAFETY BOUNDARY: the live /api/channels route (server/channels/index.ts +
 * registerBuiltinChannels) is NOT touched by this file. Everything here is
 * additive and reads from the existing channel singletons (adapter registry,
 * global channel registry) without mutating them.
 *
 * Design notes:
 * - Reuses the SAME db connection as the rest of the server via getDb() when
 *   persistence is needed (inbound submissions audit log), created lazily with
 *   CREATE TABLE IF NOT EXISTS so it never breaks startup.
 * - The inbound pipeline is wired with an in-memory queue and a minimal
 *   registry/access-control/agent-dispatcher so the dead handler.ts pipeline
 *   can be exercised without coupling to a live agent runtime.
 */
import { Router, type Request, type Response } from 'express';
import { channelAdapterRegistry } from '../channels/adapters/adapter-registry.js';
import {
  InboundPipeline,
  InMemoryInboundQueue,
  InboundEventHandler,
  type InboundEvent,
  type ChannelRegistry as InboundChannelRegistry,
  type AccountInfo,
  type ChannelInfo,
  type AccessControl,
  type AccessDecision,
  type AgentDispatcher,
  type DispatchResult,
  type HandleResult,
} from '../channels/inbound/index.js';
import {
  AccessControlEngine,
  AccessGroupManager,
  AllowlistManager,
  createDefaultGates,
} from '../channels/access/index.js';
import {
  getRegisteredChannelPlugin,
  findChannelPluginByAlias,
} from '../channels/lookup.js';
import type {
  ChannelId,
  AccountId,
  AppConfig,
} from '../channels/types.js';
import type {
  InboundDecision,
  ChannelIngressIdentifier,
  ChannelIngressSender,
} from '../channels/access/types.js';
import { getDb } from '../db.js';
import { logger } from '../logger.js';

const router = Router();

// ===================== Inbound pipeline wiring =====================
// Minimal, self-contained implementations so the dead inbound handler/pipeline
// can be exercised without a live agent runtime. These do NOT mutate any
// shared channel state.

const inboundRegistry: InboundChannelRegistry = {
  getChannel(channelId: ChannelId): ChannelInfo | null {
    const meta = channelAdapterRegistry.getChannelMeta(channelId);
    const caps = channelAdapterRegistry.getChannelCapabilities(channelId);
    if (!meta || !caps) {
      return null;
    }
    return { id: meta.id, label: meta.label, capabilities: caps };
  },
  getAccount(_channelId: ChannelId, accountId: AccountId): AccountInfo | null {
    return { id: accountId, channelId: _channelId, isEnabled: true };
  },
  listChannels(): ChannelId[] {
    return channelAdapterRegistry.listFactories().map((f) => f.getChannelId());
  },
};

const inboundAccessControl: AccessControl = {
  // Default policy: allow. Real access evaluation lives in /access/check.
  async canSendMessage(): Promise<AccessDecision> {
    return { allowed: true };
  },
};

const inboundAgentDispatcher: AgentDispatcher = {
  // No live agent runtime is wired here; the inbound route only demonstrates
  // pipeline/handler flow. Dispatch is reported but not executed.
  async dispatch(): Promise<DispatchResult> {
    return { dispatched: false };
  },
};

const inboundQueue = new InMemoryInboundQueue();
const inboundHandler = new InboundEventHandler({
  registry: inboundRegistry,
  accessControl: inboundAccessControl,
  agentDispatcher: inboundAgentDispatcher,
});
const inboundPipeline = new InboundPipeline({ queue: inboundQueue, handler: inboundHandler });

// ===================== GET /api/channels-core/adapters =====================

/**
 * List the registered channel adapters (adapter-registry.ts).
 * Each entry exposes the channel id, public metadata, and capabilities.
 */
router.get('/adapters', (_req: Request, res: Response) => {
  try {
    const adapters = channelAdapterRegistry.listFactories().map((factory) => ({
      channelId: factory.getChannelId(),
      meta: factory.getChannelMeta(),
      capabilities: factory.getCapabilities(),
    }));

    res.json({ success: true, data: { adapters, total: adapters.length } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ success: false, error: message });
  }
});

// ===================== POST /api/channels-core/inbound =====================

/**
 * Submit an inbound event into the inbound pipeline (pipeline.ts / handler.ts).
 *
 * Body: an InboundEvent:
 *   {
 *     "kind": "message" | "reaction" | "typing" | "edited" | "deleted" | "presence" | "error",
 *     "channelId": string,
 *     "accountId": string,
 *     "messageId": string,
 *     "timestamp": number,
 *     "payload": <kind-specific payload>
 *   }
 *
 * The event is best-effort persisted to the shared db (inbound_submissions)
 * and then processed synchronously via the pipeline for an immediate result.
 */
router.post('/inbound', async (req: Request, res: Response) => {
  try {
    const event = req.body as InboundEvent | undefined;

    if (!event || typeof event !== 'object') {
      res.status(400).json({ success: false, error: 'Invalid inbound event body' });
      return;
    }

    if (
      !event.kind ||
      !event.channelId ||
      !event.accountId ||
      !event.messageId ||
      typeof event.timestamp !== 'number' ||
      event.payload === undefined
    ) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: kind, channelId, accountId, messageId, timestamp, payload',
      });
      return;
    }

    // Best-effort durable audit log using the SAME shared db connection.
    try {
      const db = getDb();
      db.prepare(
        `CREATE TABLE IF NOT EXISTS inbound_submissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          channel_id TEXT,
          account_id TEXT,
          message_id TEXT,
          kind TEXT,
          payload TEXT,
          created_at INTEGER
        )`,
      ).run();
      db.prepare(
        `INSERT INTO inbound_submissions (channel_id, account_id, message_id, kind, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        String(event.channelId),
        String(event.accountId),
        String(event.messageId),
        String(event.kind),
        JSON.stringify(event.payload ?? null),
        Date.now(),
      );
    } catch (dbErr: unknown) {
      logger.warn(
        '[channelsCore] inbound audit persistence skipped:',
        dbErr instanceof Error ? dbErr.message : String(dbErr),
      );
    }

    const result: HandleResult = await inboundPipeline.processEvent(event);

    const processed = {
      success: result.success,
      dispatched: result.dispatched ?? false,
      decision: result.decision ?? null,
      error: result.error ? result.error.message : null,
    };

    res.json({ success: true, data: { processed } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ success: false, error: message });
  }
});

// ===================== POST /api/channels-core/access/check =====================

/**
 * Evaluate an access gate against a sender/event/command (access/gates.ts).
 *
 * Body:
 *   {
 *     "sender": {
 *       "channel": string,
 *       "accountId": string,
 *       "identifiers": [{ "kind": "stable-id"|"username"|"email"|"phone"|"role", "value": string }]
 *     },
 *     "eventType": string,
 *     "command"?: string,
 *     "config"?: object   // optional AppConfig
 *   }
 *
 * Returns the resolved InboundDecision (admission / decision / reasonCode / reason / gateId).
 */
router.post('/access/check', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const sender = body.sender;
    const eventType = body.eventType;

    if (!sender || !eventType) {
      res.status(400).json({ success: false, error: 'sender and eventType are required' });
      return;
    }

    const channel = String(sender.channel ?? '');
    const accountId = String(sender.accountId ?? '');
    const identifiers = Array.isArray(sender.identifiers)
      ? (sender.identifiers as ChannelIngressIdentifier[])
      : [];

    if (!channel || !accountId) {
      res.status(400).json({
        success: false,
        error: 'sender.channel and sender.accountId are required',
      });
      return;
    }

    const engine = new AccessControlEngine({
      groups: new AccessGroupManager(),
      allowlist: new AllowlistManager(),
      gates: createDefaultGates(),
    });

    const decision: InboundDecision = await engine.evaluate({
      sender: { channel, accountId, identifiers } as ChannelIngressSender,
      eventType: String(eventType),
      command: typeof body.command === 'string' ? body.command : undefined,
      config: (body.config ?? {}) as AppConfig,
    });

    res.json({ success: true, data: { decision } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ success: false, error: message });
  }
});

// ===================== GET /api/channels-core/lookup/:id =====================

/**
 * Channel lookup (lookup.ts). Resolves a channel plugin by id, falling back to
 * alias lookup.
 */
router.get('/lookup/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const plugin = getRegisteredChannelPlugin(id) ?? findChannelPluginByAlias(id);

    if (!plugin) {
      res.status(404).json({ success: false, error: `Channel not found: ${id}` });
      return;
    }

    res.json({ success: true, data: { channel: plugin } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
