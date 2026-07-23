import { describe, it, expect } from 'vitest';
import { resolveHeartbeatReplyPayload } from '../heartbeat-reply-payload.js';
import type { ReplyPayload } from '../reply-payload.js';

describe('heartbeat-reply-payload', () => {
  describe('resolveHeartbeatReplyPayload', () => {
    it('returns undefined for undefined input', () => {
      expect(resolveHeartbeatReplyPayload(undefined)).toBeUndefined();
    });

    it('returns a scalar non-reasoning payload unchanged', () => {
      const payload: ReplyPayload = { text: 'hello' };
      expect(resolveHeartbeatReplyPayload(payload)).toBe(payload);
    });

    it('returns undefined for a scalar reasoning payload flagged via isReasoning', () => {
      const payload: ReplyPayload = { text: 'thinking', isReasoning: true };
      expect(resolveHeartbeatReplyPayload(payload)).toBeUndefined();
    });

    it('returns undefined for a scalar payload that starts with reasoning prefix', () => {
      const payload: ReplyPayload = { text: 'reasoning: because I said so' };
      expect(resolveHeartbeatReplyPayload(payload)).toBeUndefined();
    });

    it('returns undefined for a scalar payload that starts with thinking prefix', () => {
      const payload: ReplyPayload = { text: 'thinking... _underscore_' };
      expect(resolveHeartbeatReplyPayload(payload)).toBeUndefined();
    });

    it('picks the last outbound-capable payload from an array', () => {
      const first: ReplyPayload = { text: 'first' };
      const second: ReplyPayload = { text: 'second' };
      expect(resolveHeartbeatReplyPayload([first, second])).toBe(second);
    });

    it('skips reasoning payloads and picks the last non-reasoning one', () => {
      const visible: ReplyPayload = { text: 'visible' };
      const reasoning: ReplyPayload = { text: 'reasoning: hidden', isReasoning: true };
      expect(resolveHeartbeatReplyPayload([visible, reasoning])).toBe(visible);
    });

    it('skips payloads without outbound content', () => {
      const empty: ReplyPayload = {};
      const visible: ReplyPayload = { text: 'visible' };
      expect(resolveHeartbeatReplyPayload([empty, visible])).toBe(visible);
    });

    it('returns undefined when every payload in the array is reasoning-only', () => {
      const arr: ReplyPayload[] = [
        { text: 'reasoning: a', isReasoning: true },
        { text: 'thinking... _x_', isReasoning: true },
      ];
      expect(resolveHeartbeatReplyPayload(arr)).toBeUndefined();
    });

    it('returns undefined for an empty array', () => {
      expect(resolveHeartbeatReplyPayload([])).toBeUndefined();
    });

    it('skips falsy entries when scanning the array', () => {
      const visible: ReplyPayload = { text: 'visible' };
      expect(resolveHeartbeatReplyPayload([undefined as unknown as ReplyPayload, visible])).toBe(visible);
    });

    it('treats payloads with mediaUrl as outbound-capable', () => {
      const withMedia: ReplyPayload = { mediaUrl: 'clip.mp3' };
      expect(resolveHeartbeatReplyPayload([withMedia])).toBe(withMedia);
    });
  });
});
