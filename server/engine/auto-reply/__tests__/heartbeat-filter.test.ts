import { describe, it, expect } from 'vitest';
import {
  isHeartbeatUserMessage,
  isHeartbeatOkResponse,
  filterHeartbeatTranscriptArtifacts,
} from '../heartbeat-filter.js';
import {
  HEARTBEAT_TRANSCRIPT_PROMPT,
  HEARTBEAT_RESPONSE_TOOL_PROMPT,
  HEARTBEAT_TOKEN,
  HEARTBEAT_PROMPT,
} from '../heartbeat.js';

describe('heartbeat-filter', () => {
  describe('isHeartbeatUserMessage', () => {
    it('returns false for non-user messages', () => {
      expect(isHeartbeatUserMessage({ role: 'assistant', content: HEARTBEAT_TRANSCRIPT_PROMPT })).toBe(false);
      expect(isHeartbeatUserMessage({ role: 'system', content: HEARTBEAT_TRANSCRIPT_PROMPT })).toBe(false);
    });

    it('returns false for empty user content', () => {
      expect(isHeartbeatUserMessage({ role: 'user', content: '' })).toBe(false);
      expect(isHeartbeatUserMessage({ role: 'user', content: '   ' })).toBe(false);
    });

    it('returns true for the canonical heartbeat transcript prompt', () => {
      expect(isHeartbeatUserMessage({ role: 'user', content: HEARTBEAT_TRANSCRIPT_PROMPT })).toBe(true);
    });

    it('returns true when content starts with delivery hints and ends with the transcript prompt', () => {
      const content = `Delivery: Final assistant text is not automatically delivered in this run. Use the \`message\` tool to send user-visible output.\n${HEARTBEAT_TRANSCRIPT_PROMPT}`;
      expect(isHeartbeatUserMessage({ role: 'user', content })).toBe(true);
    });

    it('returns true when content matches a custom heartbeat prompt exactly', () => {
      const customPrompt = 'Custom heartbeat prompt';
      expect(isHeartbeatUserMessage({ role: 'user', content: customPrompt }, customPrompt)).toBe(true);
    });

    it('returns true when content matches the response tool prompt', () => {
      expect(isHeartbeatUserMessage({ role: 'user', content: HEARTBEAT_RESPONSE_TOOL_PROMPT })).toBe(true);
    });

    it('returns true when content matches a custom heartbeat prompt (default HEARTBEAT_PROMPT passed as arg)', () => {
      expect(isHeartbeatUserMessage({ role: 'user', content: HEARTBEAT_PROMPT }, HEARTBEAT_PROMPT)).toBe(true);
    });

    it('returns false for HEARTBEAT_PROMPT when no custom heartbeatPrompt is supplied', () => {
      // The default matcher only recognizes the canonical transcript / response-tool
      // prompts plus the periodic-task prompt shape. HEARTBEAT_PROMPT itself is only
      // matched when explicitly provided as the heartbeatPrompt argument.
      expect(isHeartbeatUserMessage({ role: 'user', content: HEARTBEAT_PROMPT })).toBe(false);
    });

    it('returns true for periodic task prompts with the ack suffix', () => {
      const content =
        'Run the following periodic tasks (only those due based on their intervals):\n- task1\nAfter completing all due tasks, reply HEARTBEAT_OK.';
      expect(isHeartbeatUserMessage({ role: 'user', content })).toBe(true);
    });

    it('returns false for ordinary user content', () => {
      expect(isHeartbeatUserMessage({ role: 'user', content: 'hello there' })).toBe(false);
    });

    it('handles array content blocks', () => {
      expect(
        isHeartbeatUserMessage({
          role: 'user',
          content: [{ type: 'text', text: HEARTBEAT_TRANSCRIPT_PROMPT }],
        }),
      ).toBe(true);
    });
  });

  describe('isHeartbeatOkResponse', () => {
    it('returns false for non-assistant messages', () => {
      expect(isHeartbeatOkResponse({ role: 'user', content: HEARTBEAT_TOKEN })).toBe(false);
    });

    it('returns false when the assistant message has tool calls', () => {
      expect(
        isHeartbeatOkResponse({
          role: 'assistant',
          content: HEARTBEAT_TOKEN,
          tool_calls: [{ id: '1', type: 'function', function: { name: 'foo', arguments: '{}' } }],
        } as any),
      ).toBe(false);
    });

    it('returns false for non-text content blocks', () => {
      expect(
        isHeartbeatOkResponse({
          role: 'assistant',
          content: [{ type: 'image_url', image_url: { url: 'x' } }],
        }),
      ).toBe(false);
    });

    it('returns true when content is only the heartbeat token', () => {
      expect(isHeartbeatOkResponse({ role: 'assistant', content: HEARTBEAT_TOKEN })).toBe(true);
    });

    it('returns false when content has substantial text beyond the token (over default ack threshold)', () => {
      // The default ackMaxChars fallback is 300; content longer than that is kept.
      const longText = `${HEARTBEAT_TOKEN} ${'a'.repeat(301)}`;
      expect(
        isHeartbeatOkResponse({ role: 'assistant', content: longText }),
      ).toBe(false);
    });

    it('returns true for short ack text within the default threshold', () => {
      expect(
        isHeartbeatOkResponse({ role: 'assistant', content: `${HEARTBEAT_TOKEN} short ack` }),
      ).toBe(true);
    });

    it('respects ackMaxChars to allow short acks', () => {
      expect(
        isHeartbeatOkResponse({ role: 'assistant', content: `${HEARTBEAT_TOKEN} ok` }, 10),
      ).toBe(true);
    });
  });

  describe('filterHeartbeatTranscriptArtifacts', () => {
    it('returns the input reference for empty arrays', () => {
      const arr: Array<{ role: string; content?: unknown }> = [];
      expect(filterHeartbeatTranscriptArtifacts(arr)).toBe(arr);
    });

    it('preserves non-heartbeat messages untouched', () => {
      const messages = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ];
      const result = filterHeartbeatTranscriptArtifacts(messages);
      expect(result).toEqual(messages);
    });

    it('removes a heartbeat prompt followed by an ack response', () => {
      const messages = [
        { role: 'user', content: 'real user message' },
        { role: 'user', content: HEARTBEAT_TRANSCRIPT_PROMPT },
        { role: 'assistant', content: HEARTBEAT_TOKEN },
        { role: 'user', content: 'next real message' },
      ];
      const result = filterHeartbeatTranscriptArtifacts(messages);
      expect(result).toEqual([
        { role: 'user', content: 'real user message' },
        { role: 'user', content: 'next real message' },
      ]);
    });

    it('keeps heartbeat span when followed by real user content (terminal ack boundary)', () => {
      const heartbeatPrompt = HEARTBEAT_TRANSCRIPT_PROMPT;
      const messages = [
        { role: 'user', content: heartbeatPrompt },
        { role: 'assistant', content: HEARTBEAT_TOKEN },
        { role: 'user', content: 'real user message' },
      ];
      const result = filterHeartbeatTranscriptArtifacts(messages);
      expect(result).toEqual([
        { role: 'user', content: 'real user message' },
      ]);
    });

    it('preserves a heartbeat prompt when no terminal ack artifact follows', () => {
      // Heartbeat prompt followed by a real assistant answer with substantial content
      // is preserved because the span cannot be resolved safely.
      const messages = [
        { role: 'user', content: HEARTBEAT_TRANSCRIPT_PROMPT },
        { role: 'assistant', content: 'Here is the answer you asked for in detail.' },
        { role: 'user', content: 'next user message' },
      ];
      const result = filterHeartbeatTranscriptArtifacts(messages);
      // The first heartbeat prompt is preserved because the assistant answer is
      // non-terminal real output.
      expect(result).toContainEqual({ role: 'user', content: HEARTBEAT_TRANSCRIPT_PROMPT });
    });
  });
});
