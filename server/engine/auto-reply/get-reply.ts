import { logger } from '../../logger.js';
import { publishEvent } from '../events.js';
import type { GetReplyOptions, ReplyPayload } from './types.js';
import { extractThinkDirective } from './directives.js';
import { extractModelDirective } from './model.js';
import { extractExecDirective } from './exec.js';
import { extractQueueDirective } from './queue.js';
import { extractReplyToTag } from './reply-tags.js';

export async function getReplyFromConfig(
  ctx: { message: string; sessionId?: string; sessionKey?: string; workspaceDir?: string },
  opts?: GetReplyOptions,
  _configOverride?: unknown,
): Promise<ReplyPayload | ReplyPayload[] | undefined> {
  const sessionId = opts?.sessionId ?? ctx.sessionId ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const message = ctx.message;

  logger.info(`[AutoReply] Processing reply for session ${sessionId}, message length=${message.length}`);

  let cleaned = message;

  const thinkResult = extractThinkDirective(cleaned);
  cleaned = thinkResult.cleaned;

  const modelResult = extractModelDirective(cleaned);
  cleaned = modelResult.cleaned;

  const execResult = extractExecDirective(cleaned);
  cleaned = execResult.cleaned;

  const queueResult = extractQueueDirective(cleaned);
  cleaned = queueResult.cleaned;

  const replyTagResult = extractReplyToTag(cleaned);
  cleaned = replyTagResult.cleaned;

  await publishEvent('chat:message_created', {
    sessionId,
    content: cleaned,
    role: 'user' as const,
  });

  return {
    text: `[AutoReply] Processed message for session ${sessionId}`,
    sessionId,
    modelUsed: modelResult.rawModel ?? opts?.modelOverride,
    error: undefined,
    aborted: false,
  };
}
