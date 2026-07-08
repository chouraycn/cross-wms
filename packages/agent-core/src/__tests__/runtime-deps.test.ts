import { describe, it, expect } from 'vitest';
import { validateRuntimeDeps, createStubRuntime } from '../runtime-deps';
import type { RuntimeDeps } from '../runtime-deps';

describe('runtime-deps', () => {
  it('validateRuntimeDeps should accept a full runtime', () => {
    const deps: RuntimeDeps = {
      completeSimple: async () => ({ content: '' }),
      streamSimple: async function* () {},
    };
    expect(validateRuntimeDeps(deps)).toBe(true);
  });

  it('validateRuntimeDeps should reject partial runtime', () => {
    expect(validateRuntimeDeps({ completeSimple: async () => ({ content: '' }) })).toBe(false);
    expect(validateRuntimeDeps({})).toBe(false);
  });

  it('createStubRuntime should provide no-op functions', async () => {
    const stub = createStubRuntime();
    const res = await stub.completeSimple('m', [{ role: 'user', content: 'x' }]);
    expect(res.content).toBe('');
    expect(res.usage?.totalTokens).toBe(0);

    const events: string[] = [];
    for await (const ev of stub.streamSimple('m', [{ role: 'user', content: 'x' }])) {
      events.push(ev.type);
    }
    expect(events).toEqual(['start', 'finish']);
  });
});
