import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  dispatchCommand,
  isSlashCommand,
  extractCommandName,
  type CommandDispatchContext,
} from '../commands.js';
import {
  registerCommand,
  clearCommands,
  type ChatCommandDefinition,
} from '../commands-registry.js';

describe('commands', () => {
  beforeEach(() => {
    clearCommands();
  });

  afterEach(() => {
    clearCommands();
  });

  describe('isSlashCommand', () => {
    it('should return true for slash commands', () => {
      expect(isSlashCommand('/help')).toBe(true);
      expect(isSlashCommand('/config show')).toBe(true);
      expect(isSlashCommand('  /test')).toBe(true);
    });

    it('should return false for non-commands', () => {
      expect(isSlashCommand('hello')).toBe(false);
      expect(isSlashCommand('')).toBe(false);
      expect(isSlashCommand('not /a command')).toBe(false);
    });
  });

  describe('extractCommandName', () => {
    it('should extract command name', () => {
      expect(extractCommandName('/help')).toBe('help');
      expect(extractCommandName('/config show theme')).toBe('config');
    });

    it('should return null for non-commands', () => {
      expect(extractCommandName('hello')).toBeNull();
      expect(extractCommandName('')).toBeNull();
    });
  });

  describe('dispatchCommand', () => {
    it('should return handled=false for non-command text', async () => {
      const result = await dispatchCommand('hello world');
      expect(result.handled).toBe(false);
    });

    it('should return error for unknown command', async () => {
      const result = await dispatchCommand('/unknown');
      expect(result.handled).toBe(false);
      expect(result.error).toContain('Unknown command');
    });

    it('should dispatch to registered command handler', async () => {
      const handler = vi.fn(async () => 'Hello from test');
      const cmd: ChatCommandDefinition = {
        key: 'test',
        name: 'test',
        description: 'Test command',
        handler,
      };
      registerCommand(cmd);

      const result = await dispatchCommand('/test');
      expect(result.handled).toBe(true);
      expect(result.command).toBe('test');
      expect(result.reply).toBe('Hello from test');
      expect(handler).toHaveBeenCalled();
    });

    it('should pass context to handler', async () => {
      const handler = vi.fn(async () => '');
      registerCommand({
        key: 'ctx-test',
        name: 'ctx-test',
        description: 'Test',
        handler,
      });

      const ctx: CommandDispatchContext = {
        sessionId: 'session-123',
        workspaceDir: '/tmp',
        userId: 'user-456',
      };

      await dispatchCommand('/ctx-test', ctx);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toEqual(ctx);
    });

    it('should pass parsed args to handler', async () => {
      const handler = vi.fn(async () => '');
      registerCommand({
        key: 'args-test',
        name: 'args-test',
        description: 'Test',
        args: [
          { name: 'action' },
          { name: 'value', captureRemaining: true },
        ],
        handler,
      });

      await dispatchCommand('/args-test set hello world');
      expect(handler).toHaveBeenCalled();
      const callArgs = handler.mock.calls[0];
      expect(callArgs[1]?.values?.action).toBe('set');
      expect(callArgs[1]?.values?.value).toBe('hello world');
    });

    it('should handle synchronous handlers', async () => {
      registerCommand({
        key: 'sync-test',
        name: 'sync-test',
        description: 'Test',
        handler: () => 'sync result',
      });

      const result = await dispatchCommand('/sync-test');
      expect(result.handled).toBe(true);
      expect(result.reply).toBe('sync result');
    });

    it('should handle handler errors', async () => {
      registerCommand({
        key: 'error-test',
        name: 'error-test',
        description: 'Test',
        handler: () => {
          throw new Error('something went wrong');
        },
      });

      const result = await dispatchCommand('/error-test');
      expect(result.handled).toBe(true);
      expect(result.error).toBe('something went wrong');
    });

    it('should work with command aliases', async () => {
      const handler = vi.fn(async () => '');
      registerCommand({
        key: 'help',
        name: 'help',
        description: 'Help command',
        aliases: ['h', '?'],
        handler,
      });

      await dispatchCommand('/h');
      expect(handler).toHaveBeenCalled();
    });

    it('should return command without handler as handled but no reply', async () => {
      registerCommand({
        key: 'no-handler',
        name: 'no-handler',
        description: 'No handler',
      });

      const result = await dispatchCommand('/no-handler');
      expect(result.handled).toBe(true);
      expect(result.reply).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
  });
});
