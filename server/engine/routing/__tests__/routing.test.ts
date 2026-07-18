import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
  isValidAccountId,
  DEFAULT_AGENT_ID,
  normalizeAgentId,
  isValidAgentId,
  buildAgentMainSessionKey,
  buildAgentPeerSessionKey,
  parseAgentSessionKey,
  resolveAgentIdFromSessionKey,
  classifySessionKeyShape,
  buildGroupHistoryKey,
  resolveThreadSessionKeys,
  peerKindMatches,
  normalizeChatType,
  addBinding,
  removeBinding,
  getBinding,
  listBindings,
  listBoundAccountIds,
  buildChannelAccountBindings,
  resolvePreferredAccountId,
  clearBindings,
  getBindingCount,
  resolveAccountEntry,
  resolveNormalizedAccountEntry,
  listAccountIds,
  resolveFirstBoundAccountId,
  formatDefaultAccountWarning,
  formatSetExplicitDefaultInstruction,
  resolveAgentRoute,
  normalizeRouteBindingId,
  normalizeRouteBindingRoles,
  routeBindingScopeMatches,
} from '../index.js';

describe('account-id', () => {
  describe('normalizeAccountId', () => {
    it('defaults undefined to default account', () => {
      expect(normalizeAccountId(undefined)).toBe(DEFAULT_ACCOUNT_ID);
    });

    it('defaults null to default account', () => {
      expect(normalizeAccountId(null)).toBe(DEFAULT_ACCOUNT_ID);
    });

    it('defaults blank strings to default account', () => {
      expect(normalizeAccountId('   ')).toBe(DEFAULT_ACCOUNT_ID);
    });

    it('normalizes valid ids to lowercase', () => {
      expect(normalizeAccountId('  Business_1  ')).toBe('business_1');
    });

    it('sanitizes invalid characters into canonical ids', () => {
      expect(normalizeAccountId(' Prod/US East ')).toBe('prod-us-east');
    });

    it('rejects __proto__ pollution keys', () => {
      expect(normalizeAccountId('__proto__')).toBe(DEFAULT_ACCOUNT_ID);
    });

    it('rejects constructor pollution keys', () => {
      expect(normalizeAccountId('constructor')).toBe(DEFAULT_ACCOUNT_ID);
    });

    it('rejects prototype pollution keys', () => {
      expect(normalizeAccountId('prototype')).toBe(DEFAULT_ACCOUNT_ID);
    });
  });

  describe('normalizeOptionalAccountId', () => {
    it('keeps undefined optional values unset', () => {
      expect(normalizeOptionalAccountId(undefined)).toBeUndefined();
    });

    it('keeps blank optional values unset', () => {
      expect(normalizeOptionalAccountId('   ')).toBeUndefined();
    });

    it('keeps invalid optional values unset', () => {
      expect(normalizeOptionalAccountId(' !!! ')).toBeUndefined();
    });

    it('normalizes valid optional values', () => {
      expect(normalizeOptionalAccountId('  Business  ')).toBe('business');
    });
  });

  describe('isValidAccountId', () => {
    it('returns true for valid ids', () => {
      expect(isValidAccountId('valid-account_1')).toBe(true);
    });

    it('returns false for empty strings', () => {
      expect(isValidAccountId('')).toBe(false);
    });

    it('returns false for invalid characters', () => {
      expect(isValidAccountId('invalid account!')).toBe(false);
    });
  });
});

describe('session-key', () => {
  describe('normalizeAgentId', () => {
    it('defaults to main agent', () => {
      expect(normalizeAgentId(undefined)).toBe(DEFAULT_AGENT_ID);
    });

    it('normalizes to lowercase', () => {
      expect(normalizeAgentId('MyAgent')).toBe('myagent');
    });

    it('sanitizes invalid characters', () => {
      expect(normalizeAgentId('My Agent/123')).toBe('my-agent-123');
    });
  });

  describe('isValidAgentId', () => {
    it('returns true for valid ids', () => {
      expect(isValidAgentId('valid-agent_1')).toBe(true);
    });

    it('returns false for empty strings', () => {
      expect(isValidAgentId('')).toBe(false);
    });
  });

  describe('buildAgentMainSessionKey', () => {
    it('builds main session key', () => {
      expect(buildAgentMainSessionKey({ agentId: 'main' })).toBe('agent:main:main');
    });

    it('builds with custom main key', () => {
      expect(buildAgentMainSessionKey({ agentId: 'helper', mainKey: 'thread1' })).toBe(
        'agent:helper:thread1',
      );
    });
  });

  describe('buildAgentPeerSessionKey', () => {
    it('builds direct peer session key with per-peer scope', () => {
      const key = buildAgentPeerSessionKey({
        agentId: 'main',
        channel: 'slack',
        peerKind: 'direct',
        peerId: 'user123',
        dmScope: 'per-peer',
      });
      expect(key).toBe('agent:main:direct:user123');
    });

    it('builds group peer session key', () => {
      const key = buildAgentPeerSessionKey({
        agentId: 'main',
        channel: 'discord',
        peerKind: 'group',
        peerId: 'guild123',
      });
      expect(key).toBe('agent:main:discord:group:guild123');
    });

    it('builds main session key for direct with main scope', () => {
      const key = buildAgentPeerSessionKey({
        agentId: 'main',
        channel: 'slack',
        peerKind: 'direct',
        peerId: 'user123',
        dmScope: 'main',
      });
      expect(key).toBe('agent:main:main');
    });
  });

  describe('parseAgentSessionKey', () => {
    it('parses valid agent session key', () => {
      const parsed = parseAgentSessionKey('agent:main:channel:group:123');
      expect(parsed).toEqual({ agentId: 'main', rest: 'channel:group:123' });
    });

    it('returns null for non-agent keys', () => {
      expect(parseAgentSessionKey('regular-key')).toBeNull();
    });

    it('returns null for malformed agent keys', () => {
      expect(parseAgentSessionKey('agent:main')).toBeNull();
    });
  });

  describe('resolveAgentIdFromSessionKey', () => {
    it('resolves agent id from session key', () => {
      expect(resolveAgentIdFromSessionKey('agent:helper:main')).toBe('helper');
    });

    it('defaults to main for invalid keys', () => {
      expect(resolveAgentIdFromSessionKey('invalid')).toBe('main');
    });
  });

  describe('classifySessionKeyShape', () => {
    it('classifies missing keys', () => {
      expect(classifySessionKeyShape(null)).toBe('missing');
    });

    it('classifies agent keys', () => {
      expect(classifySessionKeyShape('agent:main:main')).toBe('agent');
    });

    it('classifies legacy keys', () => {
      expect(classifySessionKeyShape('some-legacy-key')).toBe('legacy_or_alias');
    });

    it('classifies malformed agent keys', () => {
      expect(classifySessionKeyShape('agent:invalid')).toBe('malformed_agent');
    });
  });

  describe('buildGroupHistoryKey', () => {
    it('builds group history key', () => {
      const key = buildGroupHistoryKey({
        channel: 'slack',
        accountId: 'default',
        peerKind: 'channel',
        peerId: 'C123',
      });
      expect(key).toBe('slack:default:channel:c123');
    });
  });

  describe('resolveThreadSessionKeys', () => {
    it('returns base key when no thread id', () => {
      const result = resolveThreadSessionKeys({ baseSessionKey: 'agent:main:main' });
      expect(result.sessionKey).toBe('agent:main:main');
    });

    it('appends thread suffix', () => {
      const result = resolveThreadSessionKeys({
        baseSessionKey: 'agent:main:main',
        threadId: 'thread123',
      });
      expect(result.sessionKey).toBe('agent:main:main:thread:thread123');
    });

    it('does not append suffix when useSuffix is false', () => {
      const result = resolveThreadSessionKeys({
        baseSessionKey: 'agent:main:main',
        threadId: 'thread123',
        useSuffix: false,
      });
      expect(result.sessionKey).toBe('agent:main:main');
    });
  });
});

describe('peer-kind-match', () => {
  it('matches same kinds', () => {
    expect(peerKindMatches('direct', 'direct')).toBe(true);
  });

  it('matches group and channel', () => {
    expect(peerKindMatches('group', 'channel')).toBe(true);
    expect(peerKindMatches('channel', 'group')).toBe(true);
  });

  it('does not match direct with group', () => {
    expect(peerKindMatches('direct', 'group')).toBe(false);
  });
});

describe('normalizeChatType', () => {
  it('normalizes direct variants', () => {
    expect(normalizeChatType('dm')).toBe('direct');
    expect(normalizeChatType('private')).toBe('direct');
  });

  it('normalizes group', () => {
    expect(normalizeChatType('group')).toBe('group');
  });

  it('normalizes channel variants', () => {
    expect(normalizeChatType('public')).toBe('channel');
  });

  it('returns null for invalid types', () => {
    expect(normalizeChatType('invalid')).toBeNull();
  });
});

describe('bindings', () => {
  beforeEach(() => {
    clearBindings();
  });

  it('adds and retrieves a binding', () => {
    const binding = addBinding({
      id: 'b1',
      agentId: 'main',
      match: { channel: 'slack', accountId: 'default' },
    });
    expect(getBinding('b1')).toEqual(binding);
    expect(getBindingCount()).toBe(1);
  });

  it('removes a binding', () => {
    addBinding({
      id: 'b1',
      agentId: 'main',
      match: { channel: 'slack', accountId: 'default' },
    });
    expect(removeBinding('b1')).toBe(true);
    expect(getBinding('b1')).toBeUndefined();
    expect(getBindingCount()).toBe(0);
  });

  it('returns false when removing non-existent binding', () => {
    expect(removeBinding('nonexistent')).toBe(false);
  });

  it('lists bindings filtered by channel', () => {
    addBinding({
      id: 'b1',
      agentId: 'main',
      match: { channel: 'slack', accountId: 'default' },
    });
    addBinding({
      id: 'b2',
      agentId: 'helper',
      match: { channel: 'discord', accountId: 'default' },
    });
    const slackBindings = listBindings('slack');
    expect(slackBindings).toHaveLength(1);
    expect(slackBindings[0].id).toBe('b1');
  });

  it('lists all bindings when no channel specified', () => {
    addBinding({
      id: 'b1',
      agentId: 'main',
      match: { channel: 'slack', accountId: 'default' },
    });
    addBinding({
      id: 'b2',
      agentId: 'helper',
      match: { channel: 'discord', accountId: 'default' },
    });
    expect(listBindings()).toHaveLength(2);
  });

  it('lists bound account ids for channel', () => {
    addBinding({
      id: 'b1',
      agentId: 'main',
      match: { channel: 'slack', accountId: 'work' },
    });
    addBinding({
      id: 'b2',
      agentId: 'main',
      match: { channel: 'slack', accountId: 'personal' },
    });
    const accounts = listBoundAccountIds('slack');
    expect(accounts).toEqual(['personal', 'work']);
  });

  it('builds channel account bindings map', () => {
    addBinding({
      id: 'b1',
      agentId: 'main',
      match: { channel: 'slack', accountId: 'work' },
    });
    const map = buildChannelAccountBindings();
    expect(map.get('slack')?.get('main')).toContain('work');
  });

  it('resolves preferred account id', () => {
    const result = resolvePreferredAccountId({
      accountIds: ['default'],
      defaultAccountId: 'default',
      boundAccounts: ['work'],
    });
    expect(result).toBe('work');
  });

  it('falls back to default when no bound accounts', () => {
    const result = resolvePreferredAccountId({
      accountIds: [],
      defaultAccountId: 'default',
      boundAccounts: [],
    });
    expect(result).toBe('default');
  });
});

describe('account-lookup', () => {
  it('resolves exact account entry', () => {
    const accounts = { work: { name: 'Work' }, personal: { name: 'Personal' } };
    expect(resolveAccountEntry(accounts, 'work')).toEqual({ name: 'Work' });
  });

  it('resolves case-insensitive account entry', () => {
    const accounts = { Work: { name: 'Work' } };
    expect(resolveAccountEntry(accounts, 'work')).toEqual({ name: 'Work' });
  });

  it('returns undefined for non-existent account', () => {
    const accounts = { work: { name: 'Work' } };
    expect(resolveAccountEntry(accounts, 'missing')).toBeUndefined();
  });

  it('returns undefined for null/undefined accounts', () => {
    expect(resolveAccountEntry(null, 'test')).toBeUndefined();
    expect(resolveAccountEntry(undefined, 'test')).toBeUndefined();
  });

  it('resolves normalized account entry', () => {
    const accounts = { 'My-Account': { name: 'Test' } };
    const result = resolveNormalizedAccountEntry(accounts, 'my-account', normalizeAccountId);
    expect(result).toEqual({ name: 'Test' });
  });

  it('lists account ids', () => {
    const accounts = { b: 1, a: 2, c: 3 };
    expect(listAccountIds(accounts)).toEqual(['a', 'b', 'c']);
  });
});

describe('default-account-warnings', () => {
  it('formats default account warning', () => {
    const warning = formatDefaultAccountWarning('slack');
    expect(warning).toContain('slack');
    expect(warning).toContain('default account');
  });

  it('formats set explicit default instruction', () => {
    const instruction = formatSetExplicitDefaultInstruction('slack');
    expect(instruction).toContain('channels.slack.defaultAccount');
  });
});

describe('binding-scope', () => {
  it('normalizes route binding id from string', () => {
    expect(normalizeRouteBindingId('  test123  ')).toBe('test123');
  });

  it('normalizes route binding id from number', () => {
    expect(normalizeRouteBindingId(123)).toBe('123');
  });

  it('returns empty string for invalid types', () => {
    expect(normalizeRouteBindingId({})).toBe('');
  });

  it('normalizes route binding roles', () => {
    expect(normalizeRouteBindingRoles(['admin'])).toEqual(['admin']);
    expect(normalizeRouteBindingRoles(null)).toBeNull();
    expect(normalizeRouteBindingRoles([])).toBeNull();
  });

  it('matches scope with no constraints', () => {
    expect(
      routeBindingScopeMatches({}, { guildId: 'g1', teamId: 't1' }),
    ).toBe(true);
  });

  it('matches guild constraint', () => {
    expect(
      routeBindingScopeMatches({ guildId: 'g1' }, { guildId: 'g1' }),
    ).toBe(true);
  });

  it('does not match mismatched guild', () => {
    expect(
      routeBindingScopeMatches({ guildId: 'g1' }, { guildId: 'g2' }),
    ).toBe(false);
  });

  it('matches roles constraint', () => {
    expect(
      routeBindingScopeMatches(
        { roles: ['admin'] },
        { memberRoleIds: ['admin', 'member'] },
      ),
    ).toBe(true);
  });

  it('does not match missing roles', () => {
    expect(
      routeBindingScopeMatches(
        { roles: ['admin'] },
        { memberRoleIds: ['member'] },
      ),
    ).toBe(false);
  });
});

describe('bound-account-read', () => {
  beforeEach(() => {
    clearBindings();
  });

  it('resolves first bound account id', () => {
    addBinding({
      id: 'b1',
      agentId: 'main',
      match: { channel: 'slack', accountId: 'work' },
    });
    const result = resolveFirstBoundAccountId({
      channelId: 'slack',
      agentId: 'main',
    });
    expect(result).toBe('work');
  });

  it('returns undefined for no bindings', () => {
    const result = resolveFirstBoundAccountId({
      channelId: 'slack',
      agentId: 'main',
    });
    expect(result).toBeUndefined();
  });

  it('resolves by exact peer id', () => {
    addBinding({
      id: 'b1',
      agentId: 'main',
      match: {
        channel: 'slack',
        accountId: 'work',
        peer: { kind: 'direct', id: 'user123' },
      },
    });
    const result = resolveFirstBoundAccountId({
      channelId: 'slack',
      agentId: 'main',
      peerId: 'user123',
      peerKind: 'direct',
    });
    expect(result).toBe('work');
  });
});

describe('resolve-route', () => {
  beforeEach(() => {
    clearBindings();
  });

  it('resolves to default agent when no bindings', () => {
    const result = resolveAgentRoute({
      channel: 'slack',
      accountId: 'default',
    });
    expect(result.ok !== false).toBeTruthy();
    expect(result.agentId).toBe('main');
    expect(result.matchedBy).toBe('default');
  });

  it('resolves account binding', () => {
    addBinding({
      id: 'b1',
      agentId: 'helper',
      match: { channel: 'slack', accountId: 'work' },
    });
    const result = resolveAgentRoute({
      channel: 'slack',
      accountId: 'work',
    });
    expect(result.agentId).toBe('helper');
    expect(result.matchedBy).toBe('binding.account');
  });

  it('resolves channel binding with wildcard account', () => {
    addBinding({
      id: 'b1',
      agentId: 'helper',
      match: { channel: 'slack', accountId: '*' },
    });
    const result = resolveAgentRoute({
      channel: 'slack',
      accountId: 'any-account',
    });
    expect(result.agentId).toBe('helper');
    expect(result.matchedBy).toBe('binding.channel');
  });

  it('resolves peer binding', () => {
    addBinding({
      id: 'b1',
      agentId: 'helper',
      match: {
        channel: 'slack',
        accountId: '*',
        peer: { kind: 'direct', id: 'user123' },
      },
    });
    const result = resolveAgentRoute({
      channel: 'slack',
      accountId: 'default',
      peer: { kind: 'direct', id: 'user123' },
    });
    expect(result.agentId).toBe('helper');
    expect(result.matchedBy).toBe('binding.peer');
  });

  it('resolves guild binding', () => {
    addBinding({
      id: 'b1',
      agentId: 'helper',
      match: { channel: 'discord', accountId: '*', guildId: 'guild1' },
    });
    const result = resolveAgentRoute({
      channel: 'discord',
      accountId: 'default',
      guildId: 'guild1',
    });
    expect(result.agentId).toBe('helper');
    expect(result.matchedBy).toBe('binding.guild');
  });

  it('resolves team binding', () => {
    addBinding({
      id: 'b1',
      agentId: 'helper',
      match: { channel: 'slack', accountId: '*', teamId: 'team1' },
    });
    const result = resolveAgentRoute({
      channel: 'slack',
      accountId: 'default',
      teamId: 'team1',
    });
    expect(result.agentId).toBe('helper');
    expect(result.matchedBy).toBe('binding.team');
  });

  it('resolves guild + roles binding', () => {
    addBinding({
      id: 'b1',
      agentId: 'helper',
      match: {
        channel: 'discord',
        accountId: '*',
        guildId: 'guild1',
        roles: ['admin'],
      },
    });
    const result = resolveAgentRoute({
      channel: 'discord',
      accountId: 'default',
      guildId: 'guild1',
      memberRoleIds: ['admin'],
    });
    expect(result.agentId).toBe('helper');
    expect(result.matchedBy).toBe('binding.guild+roles');
  });

  it('builds session key in result', () => {
    const result = resolveAgentRoute({
      channel: 'slack',
      accountId: 'default',
    });
    expect(result.sessionKey).toBeDefined();
    expect(result.mainSessionKey).toBeDefined();
  });

  it('uses custom default agent from config', () => {
    const result = resolveAgentRoute({
      cfg: { agents: { defaultAgentId: 'custom' } },
      channel: 'slack',
      accountId: 'default',
    });
    expect(result.agentId).toBe('custom');
  });
});
