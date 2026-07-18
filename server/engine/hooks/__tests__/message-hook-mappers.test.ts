import { describe, it, expect, beforeEach } from 'vitest';
import {
  MessageHookMapperManager,
  DEFAULT_MESSAGE_MAPPERS,
  createMessageToEmailMapper,
  createEmailToMessageMapper,
} from '../message-hook-mappers.js';
import { createInternalHookEvent } from '../internal-hooks.js';

describe('message-hook-mappers', () => {
  let manager: MessageHookMapperManager;

  beforeEach(() => {
    manager = new MessageHookMapperManager();
  });

  describe('MessageHookMapperManager', () => {
    it('should initialize with default mappers', () => {
      expect(manager.getMapperCount()).toBe(DEFAULT_MESSAGE_MAPPERS.length);
    });

    it('should register a new mapper', () => {
      const initialCount = manager.getMapperCount();
      manager.register({ from: 'custom:event', to: 'custom:processed' });
      expect(manager.getMapperCount()).toBe(initialCount + 1);
      expect(manager.hasMapper('custom:event')).toBe(true);
    });

    it('should replace existing mapper with same from key', () => {
      manager.register({ from: 'message:send', to: 'custom:target' });
      const mapper = manager.getMapper('message:send');
      expect(mapper?.to).toBe('custom:target');
    });

    it('should unregister a mapper', () => {
      manager.register({ from: 'temp:event', to: 'temp:processed' });
      expect(manager.hasMapper('temp:event')).toBe(true);

      manager.unregister('temp:event');
      expect(manager.hasMapper('temp:event')).toBe(false);
    });

    it('should map event keys to targets', () => {
      const results = manager.map('message:receive');
      expect(results).toContain('message:after-receive');
    });

    it('should return empty array for unmapped events', () => {
      const results = manager.map('nonexistent:event');
      expect(results).toEqual([]);
    });

    it('should map all including chain', () => {
      manager.register({ from: 'level1', to: 'level2' });
      manager.register({ from: 'level2', to: 'level3' });

      const allMapped = manager.mapAll('level1');
      expect(allMapped).toContain('level2');
      expect(allMapped).toContain('level3');
    });

    it('should transform events', () => {
      const mapper = createMessageToEmailMapper();
      manager.register(mapper);

      const event = createInternalHookEvent('message', 'received', 's1', {
        from: 'user@example.com',
        content: 'Hello world',
        channelId: 'chat',
      });

      const transformed = manager.transform('message:received', event);
      expect(transformed.action).toBe('mail-incoming');
    });

    it('should return original event when no transform', () => {
      const event = createInternalHookEvent('message', 'send', 's1', {});
      const transformed = manager.transform('message:send', event);
      expect(transformed).toBe(event);
    });

    it('should reset to default mappers', () => {
      manager.register({ from: 'custom:event', to: 'custom:processed' });
      manager.reset();
      expect(manager.getMapperCount()).toBe(DEFAULT_MESSAGE_MAPPERS.length);
      expect(manager.hasMapper('custom:event')).toBe(false);
    });

    it('should return all mappers as a copy', () => {
      const mappers = manager.getAllMappers();
      expect(mappers.length).toBe(DEFAULT_MESSAGE_MAPPERS.length);
      mappers.push({ from: 'test', to: 'test' });
      expect(manager.getMapperCount()).toBe(DEFAULT_MESSAGE_MAPPERS.length);
    });
  });

  describe('createMessageToEmailMapper', () => {
    it('should create a mapper from message to email', () => {
      const mapper = createMessageToEmailMapper();
      expect(mapper.from).toBe('message:received');
      expect(mapper.to).toBe('mail:incoming');
      expect(mapper.description).toBeDefined();
    });
  });

  describe('createEmailToMessageMapper', () => {
    it('should create a mapper from email to message', () => {
      const mapper = createEmailToMessageMapper();
      expect(mapper.from).toBe('mail:incoming');
      expect(mapper.to).toBe('message:received');
      expect(mapper.description).toBeDefined();
    });
  });
});
