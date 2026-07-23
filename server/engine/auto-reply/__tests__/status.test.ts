import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildStatusMessage,
  buildCommandsMessage,
  buildHelpMessage,
  buildToolsMessage,
  type StatusMessageParams,
  type ToolInventoryResult,
} from '../status.js';
import {
  registerCommand,
  clearCommands,
  type ChatCommandDefinition,
} from '../commands-registry.js';

describe('status', () => {
  beforeEach(() => {
    clearCommands();
  });

  afterEach(() => {
    clearCommands();
  });

  describe('buildCommandsMessage', () => {
    it('returns the empty placeholder when no commands are registered', () => {
      const msg = buildCommandsMessage();
      expect(msg).toContain('Available commands');
      expect(msg).toContain('(no commands registered)');
    });

    it('lists commands sorted by name with their aliases and descriptions', () => {
      const zCmd: ChatCommandDefinition = {
        key: 'z',
        name: 'zebra',
        description: 'Z command',
        aliases: ['z1', 'z2'],
      };
      const aCmd: ChatCommandDefinition = {
        key: 'a',
        name: 'alpha',
        description: 'A command',
      };
      registerCommand(zCmd);
      registerCommand(aCmd);
      const msg = buildCommandsMessage();
      const alphaIdx = msg.indexOf('/alpha');
      const zebraIdx = msg.indexOf('/zebra');
      expect(alphaIdx).toBeGreaterThan(-1);
      expect(zebraIdx).toBeGreaterThan(-1);
      expect(alphaIdx).toBeLessThan(zebraIdx);
      expect(msg).toContain('[z1, z2]');
      expect(msg).toContain('Use /help for general guidance.');
    });

    it('uses the explicitly passed commands list when provided', () => {
      const cmd: ChatCommandDefinition = {
        key: 'custom',
        name: 'custom',
        description: 'Custom command',
      };
      const msg = buildCommandsMessage([cmd]);
      expect(msg).toContain('/custom — Custom command');
    });
  });

  describe('buildHelpMessage', () => {
    it('returns the default help text when no help lines are provided', () => {
      const msg = buildHelpMessage();
      expect(msg).toContain('Help');
      expect(msg).toContain('/status');
      expect(msg).toContain('/commands');
      expect(msg).toContain('/tools');
    });

    it('renders custom help lines when provided', () => {
      const msg = buildHelpMessage(['first line', 'second line']);
      expect(msg).toContain('  first line');
      expect(msg).toContain('  second line');
      // Default lines should not be present when custom lines are supplied.
      expect(msg).not.toContain('/status');
    });

    it('falls back to default text for an empty array', () => {
      const msg = buildHelpMessage([]);
      expect(msg).toContain('/status');
    });
  });

  describe('buildToolsMessage', () => {
    const inventory: ToolInventoryResult = {
      profile: 'default',
      groups: [
        {
          label: 'Builtin',
          tools: [
            { id: 'read', source: 'builtin', description: 'Read a file' },
            { id: 'bash', source: 'builtin', description: 'Run a shell command' },
          ],
        },
        {
          label: 'Plugins',
          tools: [
            {
              id: 'pluginTool',
              source: 'plugin',
              pluginId: 'my-plugin',
              description: 'Plugin-provided tool',
            },
          ],
        },
        {
          label: 'Channels',
          tools: [
            {
              id: 'channelTool',
              source: 'channel',
              channelId: 'slack',
              description: 'Channel tool',
            },
          ],
        },
        {
          label: 'MCP',
          tools: [
            {
              id: 'mcpTool',
              source: 'mcp',
              pluginId: 'mcp-server',
              description: 'MCP tool',
            },
          ],
        },
      ],
    };

    it('returns the empty profile notice when no groups are present', () => {
      const msg = buildToolsMessage({ profile: 'custom', groups: [] });
      expect(msg).toContain('No tools are available for this agent right now.');
      expect(msg).toContain('Profile: custom');
    });

    it('renders compact tool list per group, sorted by name', () => {
      const msg = buildToolsMessage(inventory);
      expect(msg).toContain('Available tools');
      expect(msg).toContain('Profile: default');
      expect(msg).toContain('Builtin');
      // bash and read sorted alphabetically
      expect(msg).toContain('bash, read');
      expect(msg).toContain('pluginTool (my-plugin)');
      expect(msg).toContain('channelTool (slack)');
      expect(msg).toContain('mcpTool (mcp:mcp-server)');
      expect(msg).toContain('Use /tools verbose for descriptions.');
    });

    it('renders verbose descriptions when verbose flag is set', () => {
      const msg = buildToolsMessage(inventory, { verbose: true });
      expect(msg).toContain('What this agent can use right now:');
      expect(msg).toContain('bash - Run a shell command');
      expect(msg).toContain('read - Read a file');
      expect(msg).toContain("Tool availability depends on this agent's configuration.");
    });

    it('appends notices when provided alongside non-empty groups', () => {
      const msg = buildToolsMessage({
        profile: 'default',
        groups: [
          {
            label: 'Builtin',
            tools: [{ id: 'read', source: 'builtin', description: 'Read a file' }],
          },
        ],
        notices: [{ message: 'Some tools are disabled.' }],
      });
      expect(msg).toContain('Notes');
      expect(msg).toContain('Some tools are disabled.');
    });
  });

  describe('buildStatusMessage', () => {
    it('joins sections with double newlines', () => {
      const params: StatusMessageParams = {
        agentId: 'agent-1',
        modelUsed: 'gpt-4',
        tools: { profile: 'default', groups: [] },
      };
      const msg = buildStatusMessage(params);
      expect(msg).toContain('Status');
      expect(msg).toContain('Agent: agent-1');
      expect(msg).toContain('Model: gpt-4');
      expect(msg).toContain('Available commands');
      expect(msg).toContain('No tools are available for this agent right now.');
      expect(msg).toContain('Help');
    });

    it('omits the header when neither agentId nor modelUsed is provided', () => {
      const msg = buildStatusMessage({});
      expect(msg.startsWith('Available commands')).toBe(true);
    });

    it('omits the tools section when tools is not provided', () => {
      const msg = buildStatusMessage({ agentId: 'a' });
      expect(msg).not.toContain('Available tools');
      expect(msg).toContain('Help');
    });

    it('uses custom help lines when provided', () => {
      const msg = buildStatusMessage({ helpLines: ['custom help'] });
      expect(msg).toContain('custom help');
    });
  });
});
