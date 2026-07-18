import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { skillsCommand } from '../skills.js';

describe('CLI skills command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('has correct command name and description', () => {
    expect(skillsCommand.name()).toBe('skills');
    expect(skillsCommand.description()).toContain('技能');
  });

  it('shows help output', () => {
    const helpInformation = skillsCommand.helpInformation();
    expect(helpInformation).toContain('list');
    expect(helpInformation).toContain('show');
  });

  it('list subcommand outputs skill list', async () => {
    await skillsCommand.parseAsync(['node', 'test', 'list']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('技能列表'))).toBe(true);
  });

  it('show subcommand handles missing skill', async () => {
    await skillsCommand.parseAsync(['node', 'test', 'show', 'nonexistent-skill']);

    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((line) => line.includes('未找到'))).toBe(true);
  });
});
