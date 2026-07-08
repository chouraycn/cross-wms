import { describe, it, expect } from 'vitest';
import { ReasoningEngine } from '../reasoning';
import type { AgentMessage } from '../types';

function userMsg(content: string): AgentMessage {
  return { id: '1', role: 'user', content, timestamp: Date.now() };
}

describe('ReasoningEngine', () => {
  it('should default to simple mode with sensible limits', () => {
    const engine = new ReasoningEngine();
    expect(engine.getMode()).toBe('simple');
    const steps = engine.plan([userMsg('hi')]);
    expect(steps).toBeInstanceOf(Promise);
  });

  it('should plan a step containing the user input', async () => {
    const engine = new ReasoningEngine({ mode: 'simple' });
    const step = await engine.plan([userMsg('查库存')]);
    expect(step.type).toBe('plan');
    expect(step.content).toContain('查库存');
    expect(engine.getSteps().length).toBe(1);
  });

  it('should not generate plan text when mode is none', async () => {
    const engine = new ReasoningEngine({ mode: 'none' });
    const step = await engine.plan([userMsg('anything')]);
    expect(step.content).toBe('');
  });

  it('should observe and think', async () => {
    const engine = new ReasoningEngine();
    const obs = await engine.observe('observation text', { foo: 1 });
    expect(obs.type).toBe('observation');
    expect(obs.metadata).toEqual({ foo: 1 });
    const thought = await engine.think('a thought');
    expect(thought.type).toBe('thought');
    expect(engine.getSteps().length).toBe(2);
  });

  it('should reflect and be disabled when enableReflection=false', async () => {
    const engine = new ReasoningEngine({ enableReflection: false });
    const reflection = await engine.reflect('current state', []);
    expect(reflection.content).toBe('');

    const engine2 = new ReasoningEngine({ enableReflection: true });
    const reflection2 = await engine2.reflect('current state', [engine2.think('t').then((t) => t)]);
    expect(reflection2.type).toBe('reflection');
    expect(reflection2.content).toContain('当前状态');
  });

  it('should support mode switching and reset', async () => {
    const engine = new ReasoningEngine({ mode: 'simple' });
    engine.setMode('deep');
    expect(engine.getMode()).toBe('deep');
    await engine.plan([userMsg('x')]);
    expect(engine.getSteps().length).toBeGreaterThan(0);
    engine.reset();
    expect(engine.getSteps().length).toBe(0);
  });

  it('should produce a non-empty summary', async () => {
    const engine = new ReasoningEngine();
    await engine.think('hello world');
    const summary = engine.getSummary();
    expect(summary).toContain('[thought]');
  });
});
