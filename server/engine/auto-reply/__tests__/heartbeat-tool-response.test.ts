import { describe, it, expect } from 'vitest';
import {
  HEARTBEAT_RESPONSE_TOOL_NAME,
  HEARTBEAT_TOOL_OUTCOMES,
  HEARTBEAT_TOOL_PRIORITIES,
  normalizeHeartbeatToolResponse,
  getHeartbeatToolNotificationText,
  createHeartbeatToolResponsePayload,
  resolveHeartbeatToolResponseFromReplyResult,
  type HeartbeatToolResponse,
} from '../heartbeat-tool-response.js';
import { HEARTBEAT_TOKEN } from '../heartbeat.js';

describe('heartbeat-tool-response', () => {
  describe('constants', () => {
    it('exposes the heartbeat response tool name', () => {
      expect(HEARTBEAT_RESPONSE_TOOL_NAME).toBe('heartbeat_respond');
    });

    it('exposes the canonical outcome list', () => {
      expect(HEARTBEAT_TOOL_OUTCOMES).toEqual([
        'no_change',
        'progress',
        'done',
        'blocked',
        'needs_attention',
      ]);
    });

    it('exposes the canonical priority list', () => {
      expect(HEARTBEAT_TOOL_PRIORITIES).toEqual(['low', 'normal', 'high']);
    });
  });

  describe('normalizeHeartbeatToolResponse', () => {
    it('returns undefined for non-record inputs', () => {
      expect(normalizeHeartbeatToolResponse(null)).toBeUndefined();
      expect(normalizeHeartbeatToolResponse(undefined)).toBeUndefined();
      expect(normalizeHeartbeatToolResponse('string')).toBeUndefined();
      expect(normalizeHeartbeatToolResponse(42)).toBeUndefined();
      expect(normalizeHeartbeatToolResponse([1, 2])).toBeUndefined();
    });

    it('returns undefined when required fields are missing', () => {
      expect(normalizeHeartbeatToolResponse({})).toBeUndefined();
      expect(normalizeHeartbeatToolResponse({ outcome: 'done' })).toBeUndefined();
      expect(normalizeHeartbeatToolResponse({ outcome: 'done', notify: true })).toBeUndefined();
      expect(normalizeHeartbeatToolResponse({ notify: true, summary: 's' })).toBeUndefined();
    });

    it('returns undefined when outcome is not in the allowed set', () => {
      expect(
        normalizeHeartbeatToolResponse({ outcome: 'unknown', notify: true, summary: 's' }),
      ).toBeUndefined();
    });

    it('returns undefined when notify is missing or not a boolean', () => {
      expect(
        normalizeHeartbeatToolResponse({ outcome: 'done', summary: 's' }),
      ).toBeUndefined();
      expect(
        normalizeHeartbeatToolResponse({ outcome: 'done', notify: 'true', summary: 's' }),
      ).toBeUndefined();
    });

    it('returns undefined when summary is empty', () => {
      expect(
        normalizeHeartbeatToolResponse({ outcome: 'done', notify: true, summary: '   ' }),
      ).toBeUndefined();
    });

    it('normalizes a minimal valid response', () => {
      const result = normalizeHeartbeatToolResponse({
        outcome: 'progress',
        notify: true,
        summary: 'made progress',
      });
      expect(result).toEqual({
        outcome: 'progress',
        notify: true,
        summary: 'made progress',
      });
    });

    it('preserves optional fields when provided', () => {
      const result = normalizeHeartbeatToolResponse({
        outcome: 'done',
        notify: false,
        summary: 'all done',
        notificationText: 'all done msg',
        reason: 'completed',
        priority: 'high',
        nextCheck: '2024-01-01T00:00:00Z',
      });
      expect(result).toEqual({
        outcome: 'done',
        notify: false,
        summary: 'all done',
        notificationText: 'all done msg',
        reason: 'completed',
        priority: 'high',
        nextCheck: '2024-01-01T00:00:00Z',
      });
    });

    it('accepts snake_case aliases for notificationText and nextCheck', () => {
      const result = normalizeHeartbeatToolResponse({
        outcome: 'done',
        notify: true,
        summary: 's',
        notification_text: 'nt',
        next_check: 'nc',
      });
      expect(result?.notificationText).toBe('nt');
      expect(result?.nextCheck).toBe('nc');
    });

    it('drops priority when value is not in the allowed set', () => {
      const result = normalizeHeartbeatToolResponse({
        outcome: 'done',
        notify: true,
        summary: 's',
        priority: 'urgent',
      });
      expect(result?.priority).toBeUndefined();
    });

    it('drops empty optional string fields', () => {
      const result = normalizeHeartbeatToolResponse({
        outcome: 'done',
        notify: true,
        summary: 's',
        reason: '   ',
        notificationText: '   ',
      });
      expect(result?.reason).toBeUndefined();
      expect(result?.notificationText).toBeUndefined();
    });
  });

  describe('getHeartbeatToolNotificationText', () => {
    it('returns empty string when notify is false', () => {
      const response: HeartbeatToolResponse = {
        outcome: 'no_change',
        notify: false,
        summary: 'summary',
      };
      expect(getHeartbeatToolNotificationText(response)).toBe('');
    });

    it('returns summary when notificationText is missing', () => {
      const response: HeartbeatToolResponse = {
        outcome: 'progress',
        notify: true,
        summary: 'summary',
      };
      expect(getHeartbeatToolNotificationText(response)).toBe('summary');
    });

    it('returns notificationText when present, trimming surrounding whitespace', () => {
      const response: HeartbeatToolResponse = {
        outcome: 'progress',
        notify: true,
        summary: 'summary',
        notificationText: '  custom notification  ',
      };
      expect(getHeartbeatToolNotificationText(response)).toBe('custom notification');
    });
  });

  describe('createHeartbeatToolResponsePayload', () => {
    it('produces a notify payload with the notification text', () => {
      const response: HeartbeatToolResponse = {
        outcome: 'progress',
        notify: true,
        summary: 'summary',
        notificationText: 'notification body',
      };
      const payload = createHeartbeatToolResponsePayload(response);
      expect(payload.text).toBe('notification body');
      expect(payload.channelData).toHaveProperty('openclawHeartbeatResponse', response);
    });

    it('falls back to summary when notify is true but notificationText is missing', () => {
      const response: HeartbeatToolResponse = {
        outcome: 'progress',
        notify: true,
        summary: 'fallback summary',
      };
      const payload = createHeartbeatToolResponsePayload(response);
      expect(payload.text).toBe('fallback summary');
    });

    it('emits the heartbeat token when notify is false', () => {
      const response: HeartbeatToolResponse = {
        outcome: 'no_change',
        notify: false,
        summary: 'silent summary',
      };
      const payload = createHeartbeatToolResponsePayload(response);
      expect(payload.text).toBe(HEARTBEAT_TOKEN);
      expect(payload.channelData).toHaveProperty('openclawHeartbeatResponse', response);
    });
  });

  describe('resolveHeartbeatToolResponseFromReplyResult', () => {
    it('returns undefined for undefined reply result', () => {
      expect(resolveHeartbeatToolResponseFromReplyResult(undefined)).toBeUndefined();
    });

    it('returns undefined when no payload carries a heartbeat response', () => {
      expect(
        resolveHeartbeatToolResponseFromReplyResult({ text: 'no response' }),
      ).toBeUndefined();
    });

    it('extracts the response from a single payload', () => {
      const response: HeartbeatToolResponse = {
        outcome: 'progress',
        notify: true,
        summary: 's',
      };
      const payload = createHeartbeatToolResponsePayload(response);
      expect(resolveHeartbeatToolResponseFromReplyResult(payload)).toEqual(response);
    });

    it('returns the last response when multiple payloads carry one', () => {
      const first: HeartbeatToolResponse = {
        outcome: 'no_change',
        notify: false,
        summary: 'first',
      };
      const last: HeartbeatToolResponse = {
        outcome: 'done',
        notify: true,
        summary: 'last',
      };
      const arr = [
        createHeartbeatToolResponsePayload(first),
        { text: 'middle' },
        createHeartbeatToolResponsePayload(last),
      ];
      expect(resolveHeartbeatToolResponseFromReplyResult(arr)).toEqual(last);
    });
  });
});
