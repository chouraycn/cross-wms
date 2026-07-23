import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  normalizeCommandBody,
  stripInboundMetadata,
  isAbortTrigger,
  listDetectionCommands,
  hasControlCommand,
  isControlCommandMessage,
  hasInlineCommandTokens,
  shouldComputeCommandAuthorized,
  type CommandNormalizeOptions,
} from '../command-detection.js';
import {
  registerCommand,
  clearCommands,
  type ChatCommandDefinition,
} from '../commands-registry.js';

describe('command-detection', () => {
  beforeEach(() => {
    clearCommands();
  });

  afterEach(() => {
    clearCommands();
  });

  describe('normalizeCommandBody', () => {
    it('returns trimmed non-slash text unchanged', () => {
      expect(normalizeCommandBody('  hello world  ')).toBe('hello world');
    });

    it('returns empty string for empty input', () => {
      expect(normalizeCommandBody('   ')).toBe('');
    });

    it('normalizes /cmd: value to /cmd value', () => {
      expect(normalizeCommandBody('/think:high')).toBe('/think high');
      expect(normalizeCommandBody('/verbose: on')).toBe('/verbose on');
    });

    it('keeps command without args intact', () => {
      expect(normalizeCommandBody('/status')).toBe('/status');
    });

    it('strips the bot mention suffix when it matches the configured bot username', () => {
      const options: CommandNormalizeOptions = { botUsername: 'clawbot' };
      expect(normalizeCommandBody('/status@clawbot extra', options)).toBe('/status extra');
    });

    it('does not strip mention when bot username does not match', () => {
      const options: CommandNormalizeOptions = { botUsername: 'clawbot' };
      expect(normalizeCommandBody('/status@otherbot extra', options)).toBe('/status@otherbot extra');
    });

    it('preserves the multiline tail', () => {
      const result = normalizeCommandBody('/cmd value\nsecond line');
      expect(result).toBe('/cmd value\nsecond line');
    });

    it('handles colon form combined with multiline tail', () => {
      const result = normalizeCommandBody('/think:high\nsecond line');
      expect(result).toBe('/think high\nsecond line');
    });
  });

  describe('stripInboundMetadata', () => {
    it('returns empty string for empty input', () => {
      expect(stripInboundMetadata('')).toBe('');
    });

    it('strips leading timestamp prefixes', () => {
      const text = '[Jan 2024-01-01 12:00:00 UTC] hello world';
      expect(stripInboundMetadata(text)).toBe('hello world');
    });

    it('returns text unchanged when no sentinel is present', () => {
      const text = 'just a normal message';
      expect(stripInboundMetadata(text)).toBe(text);
    });

    it('drops metadata blocks introduced by sentinels', () => {
      const text = [
        'before metadata',
        'Conversation info (untrusted metadata):',
        'some-meta: value',
        'more-meta: value2',
        '',
        'after metadata',
      ].join('\n');
      expect(stripInboundMetadata(text)).toBe('before metadata\nafter metadata');
    });

    it('handles multiple sentinels', () => {
      const text = [
        'Conversation info (untrusted metadata):',
        'a: 1',
        '',
        'Sender (untrusted metadata):',
        'b: 2',
        '',
        'final',
      ].join('\n');
      expect(stripInboundMetadata(text)).toBe('final');
    });
  });

  describe('isAbortTrigger', () => {
    it('returns false for empty input', () => {
      expect(isAbortTrigger('')).toBe(false);
      expect(isAbortTrigger(undefined)).toBe(false);
    });

    it('returns true for canonical stop triggers', () => {
      expect(isAbortTrigger('stop')).toBe(true);
      expect(isAbortTrigger('abort')).toBe(true);
      expect(isAbortTrigger('wait')).toBe(true);
      expect(isAbortTrigger('exit')).toBe(true);
      expect(isAbortTrigger('interrupt')).toBe(true);
      expect(isAbortTrigger('halt')).toBe(true);
    });

    it('returns true for localized triggers', () => {
      expect(isAbortTrigger('停止')).toBe(true);
      expect(isAbortTrigger('暂停')).toBe(true);
      expect(isAbortTrigger('やめて')).toBe(true);
      expect(isAbortTrigger('stopp')).toBe(true);
    });

    it('strips trailing punctuation before matching', () => {
      expect(isAbortTrigger('stop.')).toBe(true);
      expect(isAbortTrigger('stop!')).toBe(true);
      expect(isAbortTrigger('stop,')).toBe(true);
    });

    it('does not strip leading quotes (only trailing punctuation is removed)', () => {
      // Leading double quotes are not stripped; the normalized text is `"stop`,
      // which is not a recognized trigger.
      expect(isAbortTrigger('"stop"')).toBe(false);
    });

    it('normalizes whitespace', () => {
      expect(isAbortTrigger('  stop  ')).toBe(true);
    });

    it('returns false for non-trigger text', () => {
      expect(isAbortTrigger('stop running')).toBe(false);
      expect(isAbortTrigger('hello')).toBe(false);
      expect(isAbortTrigger('stoppable')).toBe(false);
    });
  });

  describe('listDetectionCommands', () => {
    it('returns the global registered command list', () => {
      const cmd: ChatCommandDefinition = {
        key: 'test',
        name: 'test',
        description: 'Test command',
      };
      registerCommand(cmd);
      expect(listDetectionCommands()).toContainEqual(cmd);
    });

    it('ignores the config argument (cross-wms has no config scoping yet)', () => {
      registerCommand({ key: 'k', name: 'k', description: 'd' });
      const withoutCfg = listDetectionCommands();
      const withCfg = listDetectionCommands({ commands: { allowFrom: {} } });
      expect(withCfg).toEqual(withoutCfg);
    });
  });

  describe('hasControlCommand', () => {
    it('returns false for empty input', () => {
      expect(hasControlCommand('')).toBe(false);
      expect(hasControlCommand(undefined)).toBe(false);
      expect(hasControlCommand('   ')).toBe(false);
    });

    it('returns false when no commands are registered', () => {
      expect(hasControlCommand('/status')).toBe(false);
    });

    it('returns true for an exact registered command', () => {
      registerCommand({ key: 'status', name: 'status', description: 'show status' });
      expect(hasControlCommand('/status')).toBe(true);
    });

    it('matches command aliases', () => {
      registerCommand({
        key: 'help',
        name: 'help',
        description: 'help',
        aliases: ['h'],
      });
      expect(hasControlCommand('/h')).toBe(true);
      expect(hasControlCommand('/help')).toBe(true);
    });

    it('returns true for commands with args when acceptsArgs is set', () => {
      registerCommand({
        key: 'config',
        name: 'config',
        description: 'config',
        acceptsArgs: true,
      });
      expect(hasControlCommand('/config show')).toBe(true);
    });

    it('returns false for non-registered slash commands', () => {
      registerCommand({ key: 'status', name: 'status', description: 'show status' });
      expect(hasControlCommand('/unknown')).toBe(false);
    });
  });

  describe('isControlCommandMessage', () => {
    it('returns true for control commands', () => {
      registerCommand({ key: 'status', name: 'status', description: 'show status' });
      expect(isControlCommandMessage('/status')).toBe(true);
    });

    it('returns true for abort triggers wrapped in metadata', () => {
      const text = '[Jan 2024-01-01 12:00:00 UTC] stop';
      expect(isControlCommandMessage(text)).toBe(true);
    });

    it('returns false for ordinary text', () => {
      expect(isControlCommandMessage('hello world')).toBe(false);
    });
  });

  describe('hasInlineCommandTokens', () => {
    it('returns false for empty input', () => {
      expect(hasInlineCommandTokens('')).toBe(false);
      expect(hasInlineCommandTokens(undefined)).toBe(false);
      expect(hasInlineCommandTokens('   ')).toBe(false);
    });

    it('returns true for messages containing a slash command token', () => {
      expect(hasInlineCommandTokens('hey /status')).toBe(true);
      expect(hasInlineCommandTokens('/cmd arg')).toBe(true);
    });

    it('returns true for bang-prefixed tokens', () => {
      expect(hasInlineCommandTokens('run !cmd now')).toBe(true);
    });

    it('returns false for plain text without slash or bang tokens', () => {
      expect(hasInlineCommandTokens('just chatting here')).toBe(false);
    });
  });

  describe('shouldComputeCommandAuthorized', () => {
    it('returns true when text is a control command message', () => {
      registerCommand({ key: 'status', name: 'status', description: 'show status' });
      expect(shouldComputeCommandAuthorized('/status')).toBe(true);
    });

    it('returns true when text contains inline command tokens', () => {
      expect(shouldComputeCommandAuthorized('hey /verbose:on')).toBe(true);
    });

    it('returns false for plain chat text', () => {
      expect(shouldComputeCommandAuthorized('hello there')).toBe(false);
    });
  });
});
