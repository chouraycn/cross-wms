import { describe, it, expect } from 'vitest';
import {
  FAST_MODE_AUTO_PROGRESS_KIND,
  isFastModeAutoProgressPayload,
  appendReplyMediaFailureWarning,
  getReplyPayloadTtsSupplement,
  isReplyPayloadTtsSupplement,
  markReplyPayloadAsTtsSupplement,
  buildTtsSupplementMediaPayload,
  setReplyPayloadMetadata,
  getReplyPayloadMetadata,
  isReplyPayloadNonTerminalToolErrorWarning,
  copyReplyPayloadMetadata,
  markReplyPayloadForSourceSuppressionDelivery,
  markCommandReplyForDelivery,
  isReplyPayloadStatusNotice,
} from '../reply-payload.js';

describe('reply-payload', () => {
  describe('FAST_MODE_AUTO_PROGRESS_KIND / isFastModeAutoProgressPayload', () => {
    it('exposes the canonical kind constant', () => {
      expect(FAST_MODE_AUTO_PROGRESS_KIND).toBe('fast-mode-auto');
    });

    it('returns true when channelData carries the matching kind', () => {
      expect(isFastModeAutoProgressPayload({ channelData: { openclawProgressKind: 'fast-mode-auto' } })).toBe(true);
    });

    it('returns false when channelData is missing or mismatched', () => {
      expect(isFastModeAutoProgressPayload({})).toBe(false);
      expect(isFastModeAutoProgressPayload({ channelData: { openclawProgressKind: 'other' } })).toBe(false);
      expect(isFastModeAutoProgressPayload({ channelData: {} })).toBe(false);
    });
  });

  describe('appendReplyMediaFailureWarning', () => {
    it('returns the warning alone when text is empty', () => {
      expect(appendReplyMediaFailureWarning(undefined)).toBe('⚠️ Media failed.');
      expect(appendReplyMediaFailureWarning('   ')).toBe('⚠️ Media failed.');
      expect(appendReplyMediaFailureWarning('')).toBe('⚠️ Media failed.');
    });

    it('does not duplicate the warning when already present', () => {
      const text = `Some text\n⚠️ Media failed.`;
      expect(appendReplyMediaFailureWarning(text)).toBe(text);
    });

    it('appends the warning when not already present', () => {
      expect(appendReplyMediaFailureWarning('hello')).toBe('hello\n⚠️ Media failed.');
    });
  });

  describe('getReplyPayloadTtsSupplement / isReplyPayloadTtsSupplement', () => {
    it('returns undefined when payload has no media', () => {
      expect(getReplyPayloadTtsSupplement({ ttsSupplement: { spokenText: 'hi' } })).toBeUndefined();
      expect(isReplyPayloadTtsSupplement({ ttsSupplement: { spokenText: 'hi' } })).toBe(false);
    });

    it('returns undefined when spokenText is missing or empty', () => {
      expect(getReplyPayloadTtsSupplement({ mediaUrl: 'x', ttsSupplement: { spokenText: '   ' } })).toBeUndefined();
      expect(getReplyPayloadTtsSupplement({ mediaUrl: 'x' })).toBeUndefined();
    });

    it('returns the supplement when media and spokenText are present', () => {
      const result = getReplyPayloadTtsSupplement({
        mediaUrl: 'clip.mp3',
        ttsSupplement: { spokenText: 'hello' },
      });
      expect(result).toEqual({ spokenText: 'hello' });
      expect(isReplyPayloadTtsSupplement({ mediaUrl: 'clip.mp3', ttsSupplement: { spokenText: 'hello' } })).toBe(true);
    });

    it('preserves visibleTextAlreadyDelivered when set to true', () => {
      const result = getReplyPayloadTtsSupplement({
        mediaUrls: ['clip.mp3'],
        ttsSupplement: { spokenText: 'hello', visibleTextAlreadyDelivered: true },
      });
      expect(result).toEqual({ spokenText: 'hello', visibleTextAlreadyDelivered: true });
    });

    it('drops visibleTextAlreadyDelivered when false', () => {
      const result = getReplyPayloadTtsSupplement({
        mediaUrls: ['clip.mp3'],
        ttsSupplement: { spokenText: 'hello', visibleTextAlreadyDelivered: false },
      });
      expect(result).toEqual({ spokenText: 'hello' });
    });
  });

  describe('markReplyPayloadAsTtsSupplement', () => {
    it('returns the payload unchanged when spokenText resolves to empty', () => {
      const payload = { text: '   ', mediaUrl: 'x' };
      expect(markReplyPayloadAsTtsSupplement(payload)).toBe(payload);
    });

    it('attaches spokenText and ttsSupplement using payload.text by default', () => {
      const payload = { text: 'visible', mediaUrl: 'x' };
      const result = markReplyPayloadAsTtsSupplement(payload);
      expect(result.spokenText).toBe('visible');
      expect(result.ttsSupplement).toEqual({ spokenText: 'visible' });
    });

    it('uses explicit spokenText argument when provided', () => {
      const payload = { text: 'visible', mediaUrl: 'x' };
      const result = markReplyPayloadAsTtsSupplement(payload, 'custom spoken');
      expect(result.ttsSupplement?.spokenText).toBe('custom spoken');
    });

    it('includes visibleTextAlreadyDelivered when requested', () => {
      const payload = { text: 'visible', mediaUrl: 'x' };
      const result = markReplyPayloadAsTtsSupplement(payload, 'spoken', { visibleTextAlreadyDelivered: true });
      expect(result.ttsSupplement?.visibleTextAlreadyDelivered).toBe(true);
    });
  });

  describe('buildTtsSupplementMediaPayload', () => {
    it('returns the payload unchanged when there is no supplement', () => {
      const payload = { text: 'hello' };
      expect(buildTtsSupplementMediaPayload(payload)).toBe(payload);
    });

    it('strips visible-only fields when supplement is present', () => {
      const payload = {
        text: 'visible text',
        mediaUrl: 'clip.mp3',
        presentation: { type: 'rich' },
        interactive: { blocks: [] },
        btw: { question: 'q' },
        ttsSupplement: { spokenText: 'spoken only' },
      };
      const result = buildTtsSupplementMediaPayload(payload);
      expect(result.text).toBeUndefined();
      expect(result.presentation).toBeUndefined();
      expect(result.interactive).toBeUndefined();
      expect(result.btw).toBeUndefined();
      expect(result.mediaUrl).toBe('clip.mp3');
      expect(result.spokenText).toBe('spoken only');
      expect(result.ttsSupplement?.spokenText).toBe('spoken only');
    });
  });

  describe('metadata helpers', () => {
    it('setReplyPayloadMetadata / getReplyPayloadMetadata round-trip', () => {
      const payload = { text: 'hi' };
      const result = setReplyPayloadMetadata(payload, { assistantMessageIndex: 7 });
      expect(result).toBe(payload);
      expect(getReplyPayloadMetadata(payload)?.assistantMessageIndex).toBe(7);
    });

    it('setReplyPayloadMetadata merges with previous metadata', () => {
      const payload = { text: 'hi' };
      setReplyPayloadMetadata(payload, { assistantMessageIndex: 1 });
      setReplyPayloadMetadata(payload, { assistantTranscriptOwned: true });
      const meta = getReplyPayloadMetadata(payload);
      expect(meta?.assistantMessageIndex).toBe(1);
      expect(meta?.assistantTranscriptOwned).toBe(true);
    });

    it('getReplyPayloadMetadata returns undefined for unknown payload', () => {
      expect(getReplyPayloadMetadata({ text: 'nope' })).toBeUndefined();
    });

    it('isReplyPayloadNonTerminalToolErrorWarning reads the flag', () => {
      const payload = { text: 'hi' };
      expect(isReplyPayloadNonTerminalToolErrorWarning(payload)).toBe(false);
      setReplyPayloadMetadata(payload, { nonTerminalToolErrorWarning: true });
      expect(isReplyPayloadNonTerminalToolErrorWarning(payload)).toBe(true);
    });

    it('copyReplyPayloadMetadata copies metadata to a new payload', () => {
      const source = { text: 'src' };
      const target = { text: 'dst' };
      setReplyPayloadMetadata(source, { assistantMessageIndex: 42 });
      copyReplyPayloadMetadata(source, target);
      expect(getReplyPayloadMetadata(target)?.assistantMessageIndex).toBe(42);
    });

    it('copyReplyPayloadMetadata returns target unchanged when source has no metadata', () => {
      const target = { text: 'dst' };
      const result = copyReplyPayloadMetadata({ text: 'src' }, target);
      expect(result).toBe(target);
      expect(getReplyPayloadMetadata(target)).toBeUndefined();
    });
  });

  describe('markReplyPayloadForSourceSuppressionDelivery', () => {
    it('marks the payload for delivery despite suppression', () => {
      const payload = { text: 'hi' };
      markReplyPayloadForSourceSuppressionDelivery(payload);
      expect(getReplyPayloadMetadata(payload)?.deliverDespiteSourceReplySuppression).toBe(true);
    });
  });

  describe('markCommandReplyForDelivery', () => {
    it('returns undefined for undefined reply', () => {
      expect(markCommandReplyForDelivery(undefined)).toBeUndefined();
    });

    it('marks a single payload', () => {
      const payload = { text: 'cmd' };
      const result = markCommandReplyForDelivery(payload);
      expect(result).toBe(payload);
      expect(getReplyPayloadMetadata(payload)?.deliverDespiteSourceReplySuppression).toBe(true);
    });

    it('marks every payload in an array', () => {
      const a = { text: 'a' };
      const b = { text: 'b' };
      const result = markCommandReplyForDelivery([a, b]);
      expect(Array.isArray(result)).toBe(true);
      expect(getReplyPayloadMetadata(a)?.deliverDespiteSourceReplySuppression).toBe(true);
      expect(getReplyPayloadMetadata(b)?.deliverDespiteSourceReplySuppression).toBe(true);
    });
  });

  describe('isReplyPayloadStatusNotice', () => {
    it('returns false when no notice flag is set', () => {
      expect(isReplyPayloadStatusNotice({})).toBe(false);
    });

    it('returns true for any notice flag', () => {
      expect(isReplyPayloadStatusNotice({ isCompactionNotice: true })).toBe(true);
      expect(isReplyPayloadStatusNotice({ isFallbackNotice: true })).toBe(true);
      expect(isReplyPayloadStatusNotice({ isStatusNotice: true })).toBe(true);
    });

    it('returns false when notice flags are false', () => {
      expect(isReplyPayloadStatusNotice({ isCompactionNotice: false })).toBe(false);
    });
  });
});
