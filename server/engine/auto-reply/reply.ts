import { logger } from '../../logger.js';
import { publishEvent } from '../events.js';
import type { GetReplyOptions, ReplyPayload } from './types.js';
import { parseDirectives } from './directive-handling.js';
import { extractReplyToTag } from './reply-tags.js';
import { stripHeartbeatToken } from './heartbeat.js';
import { formatInboundEnvelope } from './envelope.js';
import { isSlashCommand, dispatchCommand } from './commands.js';

export type ReplyContext = {
  message: string;
  sessionId?: string;
  sessionKey?: string;
  workspaceDir?: string;
  channel?: string;
  from?: string;
  timestamp?: number;
  chatType?: 'direct' | 'group' | 'channel';
  isHeartbeat?: boolean;
  modelAliases?: string[];
};

export type ReplyPipelineStage =
  | 'preprocess'
  | 'directive_parse'
  | 'command_dispatch'
  | 'heartbeat_check'
  | 'generate'
  | 'postprocess'
  | 'finalize';

export type ReplyHooks = {
  onStage?: (stage: ReplyPipelineStage, data: unknown) => void;
  onError?: (error: Error, stage: ReplyPipelineStage) => void;
  shouldGenerate?: (ctx: ReplyContext) => boolean | Promise<boolean>;
  generate?: (ctx: ReplyContext, opts?: GetReplyOptions) => Promise<ReplyPayload | ReplyPayload[]>;
  transform?: (payload: ReplyPayload) => ReplyPayload | Promise<ReplyPayload>;
};

export type GenerateReplyOptions = GetReplyOptions & {
  hooks?: ReplyHooks;
  skipCommands?: boolean;
  skipHeartbeat?: boolean;
  skipDirectives?: boolean;
  envelope?: Parameters<typeof formatInboundEnvelope>[0];
};

export async function generateReply(
  ctx: ReplyContext,
  opts: GenerateReplyOptions = {},
): Promise<ReplyPayload | ReplyPayload[]> {
  const sessionId =
    opts.sessionId ??
    ctx.sessionId ??
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  let message = ctx.message;
  const hooks = opts.hooks ?? {};

  try {
    hooks.onStage?.('preprocess', { message });

    const cleanedMessage = preprocessMessage(message);
    message = cleanedMessage;

    hooks.onStage?.('directive_parse', { message });

    let directiveResult;
    if (!opts.skipDirectives) {
      directiveResult = parseDirectives(message, { modelAliases: ctx.modelAliases });
      message = directiveResult.cleanedText;
    }

    const replyTagResult = extractReplyToTag(message);
    message = replyTagResult.cleaned;

    if (!opts.skipCommands && isSlashCommand(message)) {
      hooks.onStage?.('command_dispatch', { message });
      const commandResult = await dispatchCommand(message, {
        sessionId,
        workspaceDir: ctx.workspaceDir,
        userId: ctx.from,
      });
      if (commandResult.handled) {
        const payload: ReplyPayload = {
          text: commandResult.reply ?? '',
          sessionId,
          error: commandResult.error,
        };
        return finalizePayload(payload, hooks);
      }
    }

    if (!opts.skipHeartbeat && ctx.isHeartbeat) {
      hooks.onStage?.('heartbeat_check', { message });
      const heartbeatResult = stripHeartbeatToken(message, { mode: 'heartbeat' });
      if (heartbeatResult.shouldSkip) {
        return {
          text: '',
          sessionId,
          aborted: false,
        };
      }
      message = heartbeatResult.text;
    }

    if (ctx.channel && ctx.from) {
      message = formatInboundEnvelope({
        channel: ctx.channel,
        from: ctx.from,
        body: message,
        timestamp: ctx.timestamp,
        chatType: ctx.chatType,
      });
    }

    hooks.onStage?.('generate', { message, sessionId });

    let result: ReplyPayload | ReplyPayload[];

    if (hooks.shouldGenerate && !(await hooks.shouldGenerate({ ...ctx, message }))) {
      result = { text: '', sessionId };
    } else if (hooks.generate) {
      result = await hooks.generate({ ...ctx, message }, opts);
    } else {
      result = await defaultGenerate({ ...ctx, message, sessionId }, opts);
    }

    hooks.onStage?.('postprocess', { result });

    if (Array.isArray(result)) {
      return Promise.all(result.map((p) => finalizePayload(p, hooks)));
    }

    return finalizePayload(result, hooks);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    hooks.onError?.(error, 'generate');
    logger.error('[AutoReply] Reply generation failed:', error);
    return {
      text: '',
      sessionId,
      error: error.message,
    };
  }
}

function preprocessMessage(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

async function finalizePayload(
  payload: ReplyPayload,
  hooks: ReplyHooks,
): Promise<ReplyPayload> {
  hooks.onStage?.('finalize', { payload });

  let result = payload;
  if (hooks.transform) {
    result = await hooks.transform(result);
  }
  return result;
}

async function defaultGenerate(
  ctx: ReplyContext & { sessionId: string },
  _opts: GenerateReplyOptions,
): Promise<ReplyPayload> {
  logger.info(
    `[AutoReply] Processing reply for session ${ctx.sessionId}, message length=${ctx.message.length}`,
  );

  await publishEvent('chat:message_created', {
    sessionId: ctx.sessionId,
    content: ctx.message,
    role: 'user' as const,
  });

  return {
    text: `[AutoReply] Processed message for session ${ctx.sessionId}`,
    sessionId: ctx.sessionId,
    modelUsed: _opts.modelOverride,
    error: undefined,
    aborted: false,
  };
}

export function createReplyPipeline(hooks: ReplyHooks = {}) {
  return {
    generate: (ctx: ReplyContext, opts?: GenerateReplyOptions) =>
      generateReply(ctx, { ...opts, hooks }),
  };
}

export type { ReplyPayload, GetReplyOptions };
