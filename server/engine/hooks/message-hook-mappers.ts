import { logger } from '../../logger.js';
import type { HookEvent } from './types.js';

export interface MessageHookMapper {
  from: string;
  to: string;
  transform?: (event: HookEvent) => HookEvent;
}

export const DEFAULT_MESSAGE_MAPPERS: MessageHookMapper[] = [
  { from: 'message:receive', to: 'message:after-receive' },
  { from: 'message:send', to: 'message:before-send' },
];

export class MessageHookMapperManager {
  private mappers: MessageHookMapper[] = [...DEFAULT_MESSAGE_MAPPERS];

  register(mapper: MessageHookMapper): void {
    const idx = this.mappers.findIndex(m => m.from === mapper.from);
    if (idx !== -1) {
      this.mappers[idx] = mapper;
    } else {
      this.mappers.push(mapper);
    }
    logger.debug(`[hooks:Mapper] Registered mapper: ${mapper.from} -> ${mapper.to}`);
  }

  unregister(from: string): void {
    const idx = this.mappers.findIndex(m => m.from === from);
    if (idx !== -1) {
      this.mappers.splice(idx, 1);
      logger.debug(`[hooks:Mapper] Unregistered mapper: ${from}`);
    }
  }

  map(eventKey: string): string[] {
    const results: string[] = [];
    
    for (const mapper of this.mappers) {
      if (eventKey === mapper.from) {
        results.push(mapper.to);
      }
    }
    
    return results;
  }

  transform(eventKey: string, event: HookEvent): HookEvent {
    const mapper = this.mappers.find(m => m.from === eventKey);
    if (mapper?.transform) {
      return mapper.transform(event);
    }
    return event;
  }

  getAllMappers(): MessageHookMapper[] {
    return [...this.mappers];
  }
}

export const messageHookMapperManager = new MessageHookMapperManager();