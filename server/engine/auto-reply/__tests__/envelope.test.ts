import { describe, it, expect } from 'vitest';
import {
  formatAgentEnvelope,
  formatInboundEnvelope,
  formatInboundFromLabel,
  formatEnvelopeTimestamp,
  resolveEnvelopeFormatOptions,
} from '../envelope.js';

describe('envelope', () => {
  describe('formatAgentEnvelope', () => {
    it('should format basic envelope', () => {
      const result = formatAgentEnvelope({
        channel: 'slack',
        body: 'Hello world',
      });
      expect(result).toContain('[slack');
      expect(result).toContain('Hello world');
      expect(result.startsWith('[')).toBe(true);
    });

    it('should include from field', () => {
      const result = formatAgentEnvelope({
        channel: 'slack',
        from: 'user123',
        body: 'Hi',
      });
      expect(result).toContain('user123');
    });

    it('should sanitize header parts', () => {
      const result = formatAgentEnvelope({
        channel: 'slack [test]',
        from: 'user [bad]',
        body: 'Hello',
      });
      expect(result).toContain('(test)');
      expect(result).toContain('(bad)');
    });

    it('should include timestamp when provided', () => {
      const result = formatAgentEnvelope({
        channel: 'slack',
        body: 'Hi',
        timestamp: new Date('2024-01-01T00:00:00Z'),
      });
      expect(result).toContain('2024');
    });

    it('should include elapsed time when previousTimestamp provided', () => {
      const now = Date.now();
      const result = formatAgentEnvelope({
        channel: 'slack',
        from: 'user',
        body: 'Hi',
        timestamp: now,
        previousTimestamp: now - 5 * 60 * 1000,
      });
      expect(result).toContain('+5m');
    });

    it('should respect includeTimestamp option', () => {
      const withTs = formatAgentEnvelope({
        channel: 'slack',
        body: 'Hi',
        timestamp: new Date(),
        envelope: { includeTimestamp: true },
      });
      const withoutTs = formatAgentEnvelope({
        channel: 'slack',
        body: 'Hi',
        timestamp: new Date(),
        envelope: { includeTimestamp: false },
      });
      expect(withTs.length).toBeGreaterThan(withoutTs.length);
    });
  });

  describe('formatInboundEnvelope', () => {
    it('should format direct message from other', () => {
      const result = formatInboundEnvelope({
        channel: 'slack',
        from: 'alice',
        body: 'Hello',
        chatType: 'direct',
      });
      expect(result).toContain('alice: Hello');
    });

    it('should format direct message from self', () => {
      const result = formatInboundEnvelope({
        channel: 'slack',
        from: 'me',
        body: 'Hello',
        chatType: 'direct',
        fromMe: true,
      });
      expect(result).toContain('(self): Hello');
    });

    it('should format group message with sender label', () => {
      const result = formatInboundEnvelope({
        channel: 'slack',
        from: 'user123',
        body: 'Hello',
        chatType: 'group',
        senderLabel: 'Alice',
      });
      expect(result).toContain('Alice: Hello');
    });
  });

  describe('formatInboundFromLabel', () => {
    it('should format direct label without id when same', () => {
      const result = formatInboundFromLabel({
        isGroup: false,
        directLabel: 'alice',
        directId: 'alice',
      });
      expect(result).toBe('alice');
    });

    it('should format direct label with id when different', () => {
      const result = formatInboundFromLabel({
        isGroup: false,
        directLabel: 'Alice',
        directId: 'U123',
      });
      expect(result).toBe('Alice id:U123');
    });

    it('should format group label with id', () => {
      const result = formatInboundFromLabel({
        isGroup: true,
        groupLabel: 'general',
        groupId: 'C123',
      });
      expect(result).toBe('general id:C123');
    });

    it('should use fallback for group when no label', () => {
      const result = formatInboundFromLabel({
        isGroup: true,
        groupFallback: 'Group',
        directLabel: 'alice',
      });
      expect(result).toBe('Group');
    });
  });

  describe('formatEnvelopeTimestamp', () => {
    it('should return undefined for no timestamp', () => {
      expect(formatEnvelopeTimestamp(undefined)).toBeUndefined();
    });

    it('should return undefined when includeTimestamp is false', () => {
      expect(
        formatEnvelopeTimestamp(new Date(), { includeTimestamp: false }),
      ).toBeUndefined();
    });

    it('should format timestamp', () => {
      const result = formatEnvelopeTimestamp(new Date('2024-01-01T00:00:00Z'));
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('resolveEnvelopeFormatOptions', () => {
    it('should resolve defaults from config', () => {
      const result = resolveEnvelopeFormatOptions({
        envelopeTimezone: 'utc',
        envelopeTimestamp: 'off',
        envelopeElapsed: 'off',
        userTimezone: 'America/New_York',
      });
      expect(result.timezone).toBe('utc');
      expect(result.includeTimestamp).toBe(false);
      expect(result.includeElapsed).toBe(false);
      expect(result.userTimezone).toBe('America/New_York');
    });

    it('should use defaults when config is empty', () => {
      const result = resolveEnvelopeFormatOptions({});
      expect(result.includeTimestamp).toBe(true);
      expect(result.includeElapsed).toBe(true);
    });
  });
});
