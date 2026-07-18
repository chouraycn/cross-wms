import { describe, it, expect } from 'vitest';
import {
  stripHeartbeatToken,
  isHeartbeatContentEffectivelyEmpty,
  parseHeartbeatTasks,
  resolveHeartbeatPrompt,
  isTaskDue,
  HEARTBEAT_TOKEN,
  HEARTBEAT_PROMPT,
} from '../heartbeat.js';

describe('heartbeat', () => {
  describe('stripHeartbeatToken', () => {
    it('should skip when HEARTBEAT_OK is the only content', () => {
      const result = stripHeartbeatToken(HEARTBEAT_TOKEN, { mode: 'heartbeat' });
      expect(result.shouldSkip).toBe(true);
      expect(result.didStrip).toBe(true);
      expect(result.text).toBe('');
    });

    it('should keep text when there is substantial content', () => {
      const result = stripHeartbeatToken(
        `${HEARTBEAT_TOKEN} Here is some important information that needs attention.`,
        { mode: 'heartbeat', maxAckChars: 10 },
      );
      expect(result.shouldSkip).toBe(false);
      expect(result.didStrip).toBe(true);
      expect(result.text).toContain('important information');
    });

    it('should handle token at the beginning', () => {
      const result = stripHeartbeatToken(`${HEARTBEAT_TOKEN} hello`, { mode: 'message' });
      expect(result.didStrip).toBe(true);
      expect(result.text).toBe('hello');
    });

    it('should handle token at the end', () => {
      const result = stripHeartbeatToken(`hello ${HEARTBEAT_TOKEN}`, { mode: 'message' });
      expect(result.didStrip).toBe(true);
      expect(result.text).toBe('hello');
    });

    it('should not strip when token not present', () => {
      const result = stripHeartbeatToken('hello world', { mode: 'message' });
      expect(result.shouldSkip).toBe(false);
      expect(result.didStrip).toBe(false);
      expect(result.text).toBe('hello world');
    });

    it('should return shouldSkip for empty input', () => {
      expect(stripHeartbeatToken('', { mode: 'message' }).shouldSkip).toBe(true);
      expect(stripHeartbeatToken(undefined, { mode: 'message' }).shouldSkip).toBe(true);
    });

    it('should strip markup-wrapped tokens', () => {
      const result = stripHeartbeatToken(`**${HEARTBEAT_TOKEN}**`, { mode: 'heartbeat' });
      expect(result.shouldSkip).toBe(true);
      expect(result.didStrip).toBe(true);
    });
  });

  describe('isHeartbeatContentEffectivelyEmpty', () => {
    it('should return true for empty content', () => {
      expect(isHeartbeatContentEffectivelyEmpty('')).toBe(true);
      expect(isHeartbeatContentEffectivelyEmpty('   ')).toBe(true);
    });

    it('should return true for only comments and headers', () => {
      const content = `
# Heartbeat
<!-- This is a comment -->
## Tasks
- [ ]
- [ ]

\`\`\`
\`\`\`
      `;
      expect(isHeartbeatContentEffectivelyEmpty(content)).toBe(true);
    });

    it('should return false for content with actual text', () => {
      expect(isHeartbeatContentEffectivelyEmpty('# Title\n\nSome content here')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isHeartbeatContentEffectivelyEmpty(null)).toBe(false);
      expect(isHeartbeatContentEffectivelyEmpty(undefined)).toBe(false);
    });
  });

  describe('parseHeartbeatTasks', () => {
    it('should parse tasks from YAML-like format', () => {
      const content = `
tasks:
  - name: email-check
    interval: 30m
    prompt: "Check for urgent unread emails"
  - name: calendar-reminder
    interval: 1h
    prompt: "Check calendar for upcoming meetings"
`;
      const tasks = parseHeartbeatTasks(content);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].name).toBe('email-check');
      expect(tasks[0].interval).toBe('30m');
      expect(tasks[0].prompt).toBe('Check for urgent unread emails');
      expect(tasks[1].name).toBe('calendar-reminder');
      expect(tasks[1].interval).toBe('1h');
    });

    it('should return empty array for no tasks', () => {
      expect(parseHeartbeatTasks('just some text')).toEqual([]);
      expect(parseHeartbeatTasks('')).toEqual([]);
    });

    it('should skip tasks without required fields', () => {
      const content = `
tasks:
  - name: incomplete
    interval: 30m
`;
      const tasks = parseHeartbeatTasks(content);
      expect(tasks).toHaveLength(0);
    });
  });

  describe('resolveHeartbeatPrompt', () => {
    it('should return default prompt for empty input', () => {
      expect(resolveHeartbeatPrompt('')).toBe(HEARTBEAT_PROMPT);
      expect(resolveHeartbeatPrompt(undefined)).toBe(HEARTBEAT_PROMPT);
    });

    it('should return custom prompt', () => {
      const custom = 'Custom heartbeat prompt';
      expect(resolveHeartbeatPrompt(custom)).toBe(custom);
    });
  });

  describe('isTaskDue', () => {
    const now = 1000000;

    it('should return true when never run', () => {
      expect(isTaskDue(undefined, '30m', now)).toBe(true);
    });

    it('should return true when interval has passed', () => {
      const lastRun = now - 40 * 60 * 1000;
      expect(isTaskDue(lastRun, '30m', now)).toBe(true);
    });

    it('should return false when interval has not passed', () => {
      const lastRun = now - 10 * 60 * 1000;
      expect(isTaskDue(lastRun, '30m', now)).toBe(false);
    });

    it('should handle different time units', () => {
      expect(isTaskDue(now - 1500, '1s', now)).toBe(true);
      expect(isTaskDue(now - 70 * 60 * 1000, '1h', now)).toBe(true);
      expect(isTaskDue(now - 2 * 24 * 60 * 60 * 1000, '1d', now)).toBe(true);
    });
  });
});
