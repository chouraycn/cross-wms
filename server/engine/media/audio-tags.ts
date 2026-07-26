// Audio tag helpers parse inline audio directives from message text.
// Ported from openclaw media. ../utils/directive-tags.js is available at
// ../infra/directive-tags.js in cross-wms.
import { parseInlineDirectives } from "../infra/directive-tags.js";

/**
 * Extract audio mode tag from text.
 * Supports [[audio_as_voice]] to send audio as voice message instead of file.
 * Default is file (preserves backward compatibility).
 */
export function parseAudioTag(text?: string): {
  text: string;
  audioAsVoice: boolean;
  hadTag: boolean;
} {
  const result = parseInlineDirectives(text, { stripReplyTags: false });
  return {
    text: result.text,
    audioAsVoice: result.audioAsVoice,
    hadTag: result.hasAudioTag,
  };
}
