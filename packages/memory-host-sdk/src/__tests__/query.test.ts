import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryQueryEngine } from '../query';

describe('MemoryQueryEngine', () => {
  let engine: MemoryQueryEngine;

  beforeEach(() => {
    engine = new MemoryQueryEngine();
  });

  it('should initialize with default config', () => {
    expect(engine).toBeDefined();
  });

  it('should throw error when not initialized', async () => {
    await expect(engine.search({ text: 'test' })).rejects.toThrow('not initialized');
  });

  it('should track query history', () => {
    const history = engine.getQueryHistory();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(0);
  });

  it('should return false for isInitialized when not initialized', () => {
    expect(engine.isInitialized()).toBe(false);
  });

  it('should return null for backend type when not initialized', () => {
    expect(engine.getBackendType()).toBe(null);
  });
});