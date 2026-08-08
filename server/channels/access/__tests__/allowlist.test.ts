// AllowlistManager unit tests cover DM/group allowlist membership checks,
// add/remove operations, config-based loading with multiple entry formats,
// and bulk operations (clear, getEntries).
import { describe, expect, it, beforeEach } from 'vitest';
import { AllowlistManager } from '../allowlist.js';
import type { ChannelIngressIdentifier } from '../types.js';

describe('channels/access/allowlist — isAllowed', () => {
  let mgr: AllowlistManager;

  beforeEach(() => {
    mgr = new AllowlistManager();
  });

  it('returns false for empty allowlist', () => {
    const id: ChannelIngressIdentifier = { kind: 'username', value: 'alice' };
    expect(mgr.isAllowed(id, 'dm')).toBe(false);
  });

  it('returns true for an identifier present in dm allowlist', () => {
    const id: ChannelIngressIdentifier = { kind: 'username', value: 'alice' };
    mgr.add(id, 'dm');
    expect(mgr.isAllowed(id, 'dm')).toBe(true);
  });

  it('returns true for an identifier present in group allowlist', () => {
    const id: ChannelIngressIdentifier = { kind: 'username', value: 'bob' };
    mgr.add(id, 'group');
    expect(mgr.isAllowed(id, 'group')).toBe(true);
  });

  it('returns false for identifier in dm but checked against group', () => {
    const id: ChannelIngressIdentifier = { kind: 'username', value: 'carol' };
    mgr.add(id, 'dm');
    expect(mgr.isAllowed(id, 'group')).toBe(false);
  });

  it('matches both kind and value (no partial match)', () => {
    mgr.add({ kind: 'username', value: 'alice' }, 'dm');
    expect(mgr.isAllowed({ kind: 'email', value: 'alice' }, 'dm')).toBe(false);
    expect(mgr.isAllowed({ kind: 'username', value: 'alice2' }, 'dm')).toBe(false);
  });
});

describe('channels/access/allowlist — isAnyAllowed', () => {
  let mgr: AllowlistManager;

  beforeEach(() => {
    mgr = new AllowlistManager();
  });

  it('returns false when no identifiers are in the allowlist', () => {
    const ids: ChannelIngressIdentifier[] = [
      { kind: 'username', value: 'alice' },
      { kind: 'username', value: 'bob' },
    ];
    expect(mgr.isAnyAllowed(ids, 'dm')).toBe(false);
  });

  it('returns true when at least one identifier is allowed', () => {
    mgr.add({ kind: 'username', value: 'alice' }, 'dm');
    const ids: ChannelIngressIdentifier[] = [
      { kind: 'username', value: 'alice' },
      { kind: 'username', value: 'bob' },
    ];
    expect(mgr.isAnyAllowed(ids, 'dm')).toBe(true);
  });

  it('returns false for empty identifiers array', () => {
    mgr.add({ kind: 'username', value: 'alice' }, 'dm');
    expect(mgr.isAnyAllowed([], 'dm')).toBe(false);
  });
});

describe('channels/access/allowlist — add & duplicates', () => {
  let mgr: AllowlistManager;

  beforeEach(() => {
    mgr = new AllowlistManager();
  });

  it('does not add duplicate identifiers', () => {
    const id: ChannelIngressIdentifier = { kind: 'username', value: 'alice' };
    mgr.add(id, 'dm');
    mgr.add(id, 'dm');
    mgr.add({ ...id }, 'dm'); // Different object, same content
    expect(mgr.getEntries('dm').length).toBe(1);
  });

  it('stores a defensive copy of the identifier', () => {
    const id: ChannelIngressIdentifier = { kind: 'username', value: 'alice' };
    mgr.add(id, 'dm');
    id.value = 'mutated';
    // Original mutation should not affect the stored entry
    expect(mgr.isAllowed({ kind: 'username', value: 'alice' }, 'dm')).toBe(true);
    expect(mgr.isAllowed({ kind: 'username', value: 'mutated' }, 'dm')).toBe(false);
  });

  it('allows same value under different kinds', () => {
    mgr.add({ kind: 'username', value: 'alice' }, 'dm');
    mgr.add({ kind: 'email', value: 'alice' }, 'dm');
    expect(mgr.getEntries('dm').length).toBe(2);
  });
});

describe('channels/access/allowlist — remove', () => {
  let mgr: AllowlistManager;

  beforeEach(() => {
    mgr = new AllowlistManager();
  });

  it('removes an existing identifier from the allowlist', () => {
    const id: ChannelIngressIdentifier = { kind: 'username', value: 'alice' };
    mgr.add(id, 'dm');
    expect(mgr.isAllowed(id, 'dm')).toBe(true);
    mgr.remove(id, 'dm');
    expect(mgr.isAllowed(id, 'dm')).toBe(false);
  });

  it('does nothing when removing a non-existent identifier', () => {
    expect(() =>
      mgr.remove({ kind: 'username', value: 'ghost' }, 'dm'),
    ).not.toThrow();
    expect(mgr.getEntries('dm').length).toBe(0);
  });

  it('only removes from the specified list (dm vs group)', () => {
    const id: ChannelIngressIdentifier = { kind: 'username', value: 'alice' };
    mgr.add(id, 'dm');
    mgr.add(id, 'group');
    mgr.remove(id, 'dm');
    expect(mgr.isAllowed(id, 'dm')).toBe(false);
    expect(mgr.isAllowed(id, 'group')).toBe(true);
  });
});

describe('channels/access/allowlist — loadFromConfig', () => {
  let mgr: AllowlistManager;

  beforeEach(() => {
    mgr = new AllowlistManager();
  });

  it('loads DM and group allowlists from config string entries', () => {
    const config = {
      channels: {
        webhook: {
          allowlist: {
            dm: ['username:alice', 'email:bob@example.com'],
            group: ['username:team-a'],
          },
        },
      },
    } as unknown;

    mgr.loadFromConfig(config, 'webhook');

    expect(mgr.isAllowed({ kind: 'username', value: 'alice' }, 'dm')).toBe(true);
    expect(mgr.isAllowed({ kind: 'email', value: 'bob@example.com' }, 'dm')).toBe(true);
    expect(mgr.isAllowed({ kind: 'username', value: 'team-a' }, 'group')).toBe(true);
  });

  it('treats entries without a colon as stable-id kind', () => {
    const config = {
      channels: {
        webhook: {
          allowlist: {
            dm: ['plain-id-value'],
          },
        },
      },
    } as unknown;

    mgr.loadFromConfig(config, 'webhook');

    expect(mgr.isAllowed({ kind: 'stable-id', value: 'plain-id-value' }, 'dm')).toBe(true);
  });

  it('accepts object-style entries (with kind + value)', () => {
    const config = {
      channels: {
        webhook: {
          allowlist: {
            dm: [{ kind: 'username', value: 'alice' }],
          },
        },
      },
    } as unknown;

    mgr.loadFromConfig(config, 'webhook');

    expect(mgr.isAllowed({ kind: 'username', value: 'alice' }, 'dm')).toBe(true);
  });

  it('resets allowlist before loading (clears previous entries)', () => {
    mgr.add({ kind: 'username', value: 'old-user' }, 'dm');

    const config = {
      channels: {
        webhook: {
          allowlist: {
            dm: ['username:new-user'],
          },
        },
      },
    } as unknown;

    mgr.loadFromConfig(config, 'webhook');

    expect(mgr.isAllowed({ kind: 'username', value: 'old-user' }, 'dm')).toBe(false);
    expect(mgr.isAllowed({ kind: 'username', value: 'new-user' }, 'dm')).toBe(true);
  });

  it('handles missing channel config gracefully', () => {
    const config = { channels: {} } as unknown;
    expect(() => mgr.loadFromConfig(config, 'webhook')).not.toThrow();
    expect(mgr.getEntries('dm').length).toBe(0);
  });

  it('handles missing allowlist field in channel config', () => {
    const config = {
      channels: {
        webhook: { /* no allowlist */ },
      },
    } as unknown;
    expect(() => mgr.loadFromConfig(config, 'webhook')).not.toThrow();
    expect(mgr.getEntries('dm').length).toBe(0);
  });

  it('handles non-array dm/group fields', () => {
    const config = {
      channels: {
        webhook: {
          allowlist: {
            dm: 'not-an-array',
            group: null,
          },
        },
      },
    } as unknown;
    expect(() => mgr.loadFromConfig(config, 'webhook')).not.toThrow();
    expect(mgr.getEntries('dm').length).toBe(0);
  });
});

describe('channels/access/allowlist — getAllowlist & clear', () => {
  let mgr: AllowlistManager;

  beforeEach(() => {
    mgr = new AllowlistManager();
  });

  it('getAllowlist returns a readonly snapshot of dm + group entries', () => {
    mgr.add({ kind: 'username', value: 'alice' }, 'dm');
    mgr.add({ kind: 'username', value: 'team' }, 'group');

    const allowlist = mgr.getAllowlist();
    expect(allowlist.dm.length).toBe(1);
    expect(allowlist.group.length).toBe(1);
    expect(allowlist.dm[0].value).toBe('alice');
  });

  it('clear empties both dm and group allowlists', () => {
    mgr.add({ kind: 'username', value: 'alice' }, 'dm');
    mgr.add({ kind: 'username', value: 'team' }, 'group');

    mgr.clear();

    expect(mgr.getEntries('dm').length).toBe(0);
    expect(mgr.getEntries('group').length).toBe(0);
  });

  it('getEntries returns a defensive copy (mutations do not affect internal state)', () => {
    mgr.add({ kind: 'username', value: 'alice' }, 'dm');

    const entries = mgr.getEntries('dm');
    entries.push({ kind: 'email', value: 'injected@example.com' });

    expect(mgr.getEntries('dm').length).toBe(1);
  });
});
