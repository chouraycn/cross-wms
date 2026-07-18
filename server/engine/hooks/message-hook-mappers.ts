import { logger } from '../../logger.js';
import type { HookEvent, InternalHookEvent, MessageReceivedHookEvent } from './types.js';

export interface MessageHookMapper {
  from: string;
  to: string;
  transform?: (event: InternalHookEvent) => InternalHookEvent;
  description?: string;
}

export const DEFAULT_MESSAGE_MAPPERS: MessageHookMapper[] = [
  {
    from: 'message:receive',
    to: 'message:after-receive',
    description: 'Default mapper: receive -> after-receive',
  },
  {
    from: 'message:send',
    to: 'message:before-send',
    description: 'Default mapper: send -> before-send',
  },
  {
    from: 'message:received',
    to: 'message:preprocessed',
    description: 'Map received to preprocessed for backward compatibility',
  },
];

export class MessageHookMapperManager {
  private mappers: MessageHookMapper[] = [...DEFAULT_MESSAGE_MAPPERS];
  private chainMappers: Map<string, string[]> = new Map();

  register(mapper: MessageHookMapper): void {
    const idx = this.mappers.findIndex(m => m.from === mapper.from);
    if (idx !== -1) {
      this.mappers[idx] = mapper;
    } else {
      this.mappers.push(mapper);
    }
    this.rebuildChainCache();
    logger.debug(`[hooks:Mapper] Registered mapper: ${mapper.from} -> ${mapper.to}`);
  }

  unregister(from: string): void {
    const idx = this.mappers.findIndex(m => m.from === from);
    if (idx !== -1) {
      this.mappers.splice(idx, 1);
      this.rebuildChainCache();
      logger.debug(`[hooks:Mapper] Unregistered mapper: ${from}`);
    }
  }

  private rebuildChainCache(): void {
    this.chainMappers.clear();
    for (const mapper of this.mappers) {
      const chain = this.buildChain(mapper.from, new Set());
      if (chain.length > 0) {
        this.chainMappers.set(mapper.from, chain);
      }
    }
  }

  private buildChain(from: string, visited: Set<string>): string[] {
    if (visited.has(from)) return [];
    visited.add(from);

    const result: string[] = [];
    const direct = this.mappers.filter(m => m.from === from);

    for (const mapper of direct) {
      result.push(mapper.to);
      const downstream = this.buildChain(mapper.to, new Set(visited));
      result.push(...downstream);
    }

    return result;
  }

  map(eventKey: string): string[] {
    const cached = this.chainMappers.get(eventKey);
    if (cached) {
      return [...cached];
    }

    const results: string[] = [];
    for (const mapper of this.mappers) {
      if (eventKey === mapper.from) {
        results.push(mapper.to);
      }
    }
    return results;
  }

  mapAll(eventKey: string): string[] {
    const results = this.map(eventKey);
    const allResults = [...results];

    for (const result of results) {
      const downstream = this.map(result);
      for (const d of downstream) {
        if (!allResults.includes(d)) {
          allResults.push(d);
        }
      }
    }

    return allResults;
  }

  transform(eventKey: string, event: InternalHookEvent): InternalHookEvent {
    const mapper = this.mappers.find(m => m.from === eventKey);
    if (mapper?.transform) {
      return mapper.transform(event);
    }
    return event;
  }

  transformChain(eventKey: string, event: InternalHookEvent): InternalHookEvent {
    let currentEvent = event;
    let currentKey = eventKey;
    const visited = new Set<string>();

    while (currentKey && !visited.has(currentKey)) {
      visited.add(currentKey);
      const mapper = this.mappers.find(m => m.from === currentKey);
      if (!mapper) break;

      if (mapper.transform) {
        currentEvent = mapper.transform(currentEvent);
      }
      currentKey = mapper.to;
    }

    return currentEvent;
  }

  hasMapper(from: string): boolean {
    return this.mappers.some(m => m.from === from);
  }

  getMapper(from: string): MessageHookMapper | undefined {
    return this.mappers.find(m => m.from === from);
  }

  getAllMappers(): MessageHookMapper[] {
    return [...this.mappers];
  }

  getMapperCount(): number {
    return this.mappers.length;
  }

  reset(): void {
    this.mappers = [...DEFAULT_MESSAGE_MAPPERS];
    this.chainMappers.clear();
    logger.debug('[hooks:Mapper] Reset all mappers to defaults');
  }
}

export const messageHookMapperManager = new MessageHookMapperManager();

export function createMessageToEmailMapper(): MessageHookMapper {
  return {
    from: 'message:received',
    to: 'mail:incoming',
    description: 'Map chat messages to email-style incoming mail hooks',
    transform: (event: InternalHookEvent): InternalHookEvent => {
      const ctx = event.context as MessageReceivedHookEvent['context'];
      return {
        ...event,
        type: 'message',
        action: 'mail-incoming',
        context: {
          ...ctx,
          subject: ctx.content.slice(0, 80),
          body: ctx.content,
          from: ctx.from,
          to: 'agent@local',
        },
      };
    },
  };
}

export function createEmailToMessageMapper(): MessageHookMapper {
  return {
    from: 'mail:incoming',
    to: 'message:received',
    description: 'Map incoming mail events to chat message events',
    transform: (event: InternalHookEvent): InternalHookEvent => {
      const ctx = event.context as Record<string, unknown>;
      return {
        ...event,
        type: 'message',
        action: 'received',
        context: {
          from: ctx.from as string,
          content: (ctx.body as string) || '',
          channelId: 'email',
          messageId: ctx.messageId as string,
          subject: ctx.subject as string,
        },
      };
    },
  };
}
