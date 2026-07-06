import { describe, it, expect } from 'vitest';
import type { PluginManifest, PluginType, PluginHookType } from '../types';

describe('Plugin Types', () => {
  it('should define all plugin types', () => {
    const types: PluginType[] = [
      'tool', 'agent', 'hook', 'ui', 'api', 'integration',
      'memory', 'channel', 'provider', 'skill', 'embedding', 'compaction',
    ];
    expect(types.length).toBe(12);
  });

  it('should define all hook types', () => {
    const hooks: PluginHookType[] = [
      'before_chat', 'after_chat',
      'before_tool_call', 'after_tool_call',
      'message_received', 'message_sent',
      'session_created', 'session_closed',
      'memory_inserted', 'memory_searched',
      'skill_triggered',
      'plugin_loaded', 'plugin_unloaded',
    ];
    expect(hooks.length).toBe(13);
  });

  it('should create valid plugin manifest', () => {
    const manifest: PluginManifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin',
      type: 'tool',
      entry: './dist/index.js',
      dependencies: ['@cross-wms/plugin-sdk'],
      permissions: ['read:memory', 'write:memory'],
      hooks: ['before_chat'],
      tools: ['test-tool'],
    };
    expect(manifest.id).toBe('test-plugin');
    expect(manifest.type).toBe('tool');
    expect(manifest.version).toBe('1.0.0');
  });
});