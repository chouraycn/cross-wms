import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registerCommand,
  unregisterCommand,
  getCommand,
  getCommandByName,
  listCommands,
  clearCommands,
  isCommandMessage,
  detectCommand,
  parseCommandArgs,
  serializeCommandArgs,
  buildCommandText,
  buildCommandTextFromArgs,
  type ChatCommandDefinition,
} from '../commands-registry.js';

describe('commands-registry', () => {
  beforeEach(() => {
    clearCommands();
  });

  afterEach(() => {
    clearCommands();
  });

  describe('registerCommand and getCommand', () => {
    it('should register a command and retrieve it by key', () => {
      const cmd: ChatCommandDefinition = {
        key: 'test',
        name: 'test',
        description: 'A test command',
      };
      registerCommand(cmd);
      expect(getCommand('test')).toEqual(cmd);
    });

    it('should return undefined for unregistered command', () => {
      expect(getCommand('nonexistent')).toBeUndefined();
    });

    it('should register command with aliases', () => {
      const cmd: ChatCommandDefinition = {
        key: 'help',
        name: 'help',
        description: 'Help command',
        aliases: ['h', '?'],
      };
      registerCommand(cmd);
      expect(getCommandByName('h')).toEqual(cmd);
      expect(getCommandByName('?')).toEqual(cmd);
    });
  });

  describe('getCommandByName', () => {
    it('should find command by name', () => {
      const cmd: ChatCommandDefinition = {
        key: 'config',
        name: 'config',
        description: 'Config command',
      };
      registerCommand(cmd);
      expect(getCommandByName('config')).toEqual(cmd);
    });

    it('should be case insensitive', () => {
      const cmd: ChatCommandDefinition = {
        key: 'config',
        name: 'Config',
        description: 'Config command',
      };
      registerCommand(cmd);
      expect(getCommandByName('CONFIG')).toEqual(cmd);
      expect(getCommandByName('config')).toEqual(cmd);
    });
  });

  describe('unregisterCommand', () => {
    it('should unregister a command', () => {
      const cmd: ChatCommandDefinition = {
        key: 'temp',
        name: 'temp',
        description: 'Temporary command',
      };
      registerCommand(cmd);
      expect(getCommand('temp')).toBeDefined();
      unregisterCommand('temp');
      expect(getCommand('temp')).toBeUndefined();
      expect(getCommandByName('temp')).toBeUndefined();
    });
  });

  describe('listCommands', () => {
    it('should list all registered commands', () => {
      registerCommand({ key: 'a', name: 'a', description: 'A' });
      registerCommand({ key: 'b', name: 'b', description: 'B' });
      expect(listCommands()).toHaveLength(2);
    });

    it('should return empty array when no commands registered', () => {
      expect(listCommands()).toEqual([]);
    });
  });

  describe('isCommandMessage', () => {
    it('should return true for slash commands', () => {
      expect(isCommandMessage('/help')).toBe(true);
      expect(isCommandMessage('/config show')).toBe(true);
    });

    it('should return false for non-commands', () => {
      expect(isCommandMessage('hello world')).toBe(false);
      expect(isCommandMessage('')).toBe(false);
      expect(isCommandMessage('  /help')).toBe(true);
    });
  });

  describe('detectCommand', () => {
    it('should detect command name and args', () => {
      const result = detectCommand('/config show theme');
      expect(result).not.toBeNull();
      expect(result?.commandName).toBe('config');
      expect(result?.argsText).toBe('show theme');
      expect(result?.hasSlashPrefix).toBe(true);
    });

    it('should handle command without args', () => {
      const result = detectCommand('/help');
      expect(result).not.toBeNull();
      expect(result?.commandName).toBe('help');
      expect(result?.argsText).toBe('');
    });

    it('should return null for non-command text', () => {
      expect(detectCommand('hello')).toBeNull();
      expect(detectCommand('')).toBeNull();
    });
  });

  describe('parseCommandArgs', () => {
    it('should parse positional args', () => {
      const cmd: ChatCommandDefinition = {
        key: 'test',
        name: 'test',
        description: 'Test',
        args: [
          { name: 'action' },
          { name: 'path' },
        ],
      };
      const result = parseCommandArgs(cmd, 'set key value');
      expect(result?.values?.action).toBe('set');
      expect(result?.values?.path).toBe('key');
    });

    it('should handle captureRemaining', () => {
      const cmd: ChatCommandDefinition = {
        key: 'test',
        name: 'test',
        description: 'Test',
        args: [
          { name: 'action' },
          { name: 'prompt', captureRemaining: true },
        ],
      };
      const result = parseCommandArgs(cmd, 'ask what is the meaning of life');
      expect(result?.values?.action).toBe('ask');
      expect(result?.values?.prompt).toBe('what is the meaning of life');
    });

    it('should return undefined for empty args', () => {
      const cmd: ChatCommandDefinition = {
        key: 'test',
        name: 'test',
        description: 'Test',
      };
      expect(parseCommandArgs(cmd, '')).toBeUndefined();
    });
  });

  describe('serializeCommandArgs', () => {
    it('should serialize from raw', () => {
      const cmd: ChatCommandDefinition = {
        key: 'test',
        name: 'test',
        description: 'Test',
      };
      const result = serializeCommandArgs(cmd, { raw: 'hello world' });
      expect(result).toBe('hello world');
    });

    it('should serialize from values', () => {
      const cmd: ChatCommandDefinition = {
        key: 'test',
        name: 'test',
        description: 'Test',
        args: [
          { name: 'action' },
          { name: 'path' },
        ],
      };
      const result = serializeCommandArgs(cmd, {
        raw: '',
        values: { action: 'set', path: 'theme' },
      });
      expect(result).toBe('set theme');
    });
  });

  describe('buildCommandText', () => {
    it('should build command text with args', () => {
      expect(buildCommandText('config', 'show theme')).toBe('/config show theme');
    });

    it('should build command text without args', () => {
      expect(buildCommandText('help')).toBe('/help');
    });
  });

  describe('buildCommandTextFromArgs', () => {
    it('should build command text from command definition and args', () => {
      const cmd: ChatCommandDefinition = {
        key: 'config',
        name: 'config',
        description: 'Config command',
        args: [{ name: 'action' }],
      };
      const result = buildCommandTextFromArgs(cmd, {
        raw: 'show',
        values: { action: 'show' },
      });
      expect(result).toBe('/config show');
    });
  });
});
