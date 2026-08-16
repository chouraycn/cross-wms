// auditInvariant unit tests cover the "model-visible ⟺ logged" invariant:
// token building from DB rows, content matching, system whitelist, current-user
// message exemption, and the strict-mode throw.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  auditModelVisibleLogged,
  buildModelVisibleTokens,
  getAuditViolationCount,
  resetAuditViolationCount,
} from '../auditInvariant.js';
import type { ApiMessage } from '../contextTruncate.js';

function msg(partial: Partial<ApiMessage> & { role: string; content: ApiMessage['content'] }): ApiMessage {
  return { ...partial } as ApiMessage;
}

describe('engine/auditInvariant — buildModelVisibleTokens', () => {
  it('collects message contents', () => {
    const tokens = buildModelVisibleTokens([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      { role: 'user', content: '   ' },
    ]);
    expect(tokens.has('hello')).toBe(true);
    expect(tokens.has('hi there')).toBe(true);
    expect(tokens.has('   ')).toBe(false);
  });

  it('collects tool results from assistant toolCalls JSON', () => {
    const tokens = buildModelVisibleTokens([
      {
        role: 'assistant',
        content: 'checking inventory',
        toolCalls: JSON.stringify([
          { id: 'call_1', name: 'wms_inventory_check', arguments: '{}', result: '{"qty":10}' },
          { id: 'call_2', name: 'wms_inventory_check', arguments: '{}', result: '{"qty":20}' },
        ]),
      },
    ]);
    expect(tokens.has('{"qty":10}')).toBe(true);
    expect(tokens.has('{"qty":20}')).toBe(true);
    expect(tokens.has('checking inventory')).toBe(true);
  });

  it('tolerates malformed toolCalls JSON', () => {
    const tokens = buildModelVisibleTokens([{ role: 'assistant', content: 'x', toolCalls: '{broken' }]);
    expect(tokens.has('x')).toBe(true);
  });
});

describe('engine/auditInvariant — auditModelVisibleLogged (soft mode)', () => {
  beforeEach(() => resetAuditViolationCount());
  afterEach(() => resetAuditViolationCount());

  const dbTokens = new Set(['hello', 'assistant reply', '{"qty":10}']);

  it('accepts all DB-backed messages', () => {
    expect(() =>
      auditModelVisibleLogged({
        apiMessages: [
          msg({ role: 'system', content: 'You are a WMS assistant.' }),
          msg({ role: 'user', content: 'hello' }),
          msg({ role: 'assistant', content: 'assistant reply' }),
          msg({ role: 'tool', content: '{"qty":10}', tool_call_id: 'call_x' }),
        ],
        dbTokens,
        sessionId: 's1',
        context: 'test',
      }),
    ).not.toThrow();
    expect(getAuditViolationCount()).toBe(0);
  });

  it('counts but does not throw for a non-DB-backed message in soft mode', () => {
    expect(() =>
      auditModelVisibleLogged({
        apiMessages: [msg({ role: 'user', content: 'injected context not in DB' })],
        dbTokens,
        sessionId: 's1',
        context: 'test',
      }),
    ).not.toThrow();
    expect(getAuditViolationCount()).toBe(1);
  });

  it('exempts the current user message', () => {
    expect(() =>
      auditModelVisibleLogged({
        apiMessages: [msg({ role: 'user', content: 'just typed now' })],
        dbTokens,
        currentUserMessage: 'just typed now',
        sessionId: 's1',
        context: 'test',
      }),
    ).not.toThrow();
    expect(getAuditViolationCount()).toBe(0);
  });

  it('matches tool messages by result content even with regenerated ids', () => {
    expect(() =>
      auditModelVisibleLogged({
        apiMessages: [msg({ role: 'tool', content: '{"qty":10}', tool_call_id: 'regenerated_id' })],
        dbTokens,
        sessionId: 's1',
        context: 'test',
      }),
    ).not.toThrow();
    expect(getAuditViolationCount()).toBe(0);
  });
});

describe('engine/auditInvariant — strict mode', () => {
  const prev = process.env.AUDIT_INVARIANT_STRICT;
  afterEach(() => {
    if (prev === undefined) delete process.env.AUDIT_INVARIANT_STRICT;
    else process.env.AUDIT_INVARIANT_STRICT = prev;
    resetAuditViolationCount();
  });

  it('throws on a violation when AUDIT_INVARIANT_STRICT=1', () => {
    process.env.AUDIT_INVARIANT_STRICT = '1';
    expect(() =>
      auditModelVisibleLogged({
        apiMessages: [msg({ role: 'user', content: 'not logged anywhere' })],
        dbTokens: new Set<string>(),
        sessionId: 's1',
        context: 'test',
      }),
    ).toThrow(/audit-invariant/);
  });

  it('does not throw for system messages', () => {
    process.env.AUDIT_INVARIANT_STRICT = '1';
    expect(() =>
      auditModelVisibleLogged({
        apiMessages: [msg({ role: 'system', content: 'You are helpful.' })],
        dbTokens: new Set<string>(),
        sessionId: 's1',
        context: 'test',
      }),
    ).not.toThrow();
    expect(getAuditViolationCount()).toBe(0);
  });
});
