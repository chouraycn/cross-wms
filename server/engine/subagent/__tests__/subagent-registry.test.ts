/**
 * Subagent Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSubagentRegistry,
  registerSubagentDefinition,
  resetSubagentRegistryForTests,
} from '../../subagentRegistry.js';
import type { SubagentDefinition } from '../../subagentRegistry.js';

describe('subagent-registry', () => {
  beforeEach(() => {
    resetSubagentRegistryForTests();
    getSubagentRegistry().initializeDefaultDefinitions();
  });

  afterEach(() => {
    resetSubagentRegistryForTests();
  });

  it('should register a subagent definition', () => {
    const definition: Omit<SubagentDefinition, 'enabled'> = {
      id: 'test-def',
      name: 'Test Subagent',
      description: 'A test subagent',
      agentType: 'test',
      tools: [],
      capabilities: ['test'],
      tags: [],
    };

    registerSubagentDefinition(definition);

    const registered = getSubagentRegistry().getDefinition('test-def');
    expect(registered).toBeDefined();
    expect(registered?.id).toBe('test-def');
  });

  it('should list registered subagents', () => {
    registerSubagentDefinition({ id: 'def1', name: 'Def 1', description: '', agentType: 'test', tools: [], capabilities: [], tags: [] });
    registerSubagentDefinition({ id: 'def2', name: 'Def 2', description: '', agentType: 'test', tools: [], capabilities: [], tags: [] });

    const list = getSubagentRegistry().listDefinitions();

    expect(list.some((d) => d.id === 'def1')).toBe(true);
    expect(list.some((d) => d.id === 'def2')).toBe(true);
  });

  it('should unregister a subagent', () => {
    registerSubagentDefinition({ id: 'to-remove', name: 'To Remove', description: '', agentType: 'test', tools: [], capabilities: [], tags: [] });

    const result = getSubagentRegistry().unregisterDefinition('to-remove');

    expect(result).toBe(true);
    expect(getSubagentRegistry().getDefinition('to-remove')).toBeUndefined();
  });

  it('should return false when unregistering non-existent', () => {
    const result = getSubagentRegistry().unregisterDefinition('non-existent');

    expect(result).toBe(false);
  });

  it('should clear all subagents', () => {
    registerSubagentDefinition({ id: 'def1', name: 'Def 1', description: '', agentType: 'test', tools: [], capabilities: [], tags: [] });
    registerSubagentDefinition({ id: 'def2', name: 'Def 2', description: '', agentType: 'test', tools: [], capabilities: [], tags: [] });

    resetSubagentRegistryForTests();

    expect(getSubagentRegistry().listDefinitions().length).toBe(0);
  });
});