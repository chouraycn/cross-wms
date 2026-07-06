/**
 * MessageAuditLog 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MessageAuditLog, messageAuditLog } from '../audit-log.js';

describe('MessageAuditLog', () => {
  let auditLog: MessageAuditLog;

  beforeEach(() => {
    auditLog = new MessageAuditLog();
  });

  it('should log a message audit entry', () => {
    const entry = auditLog.logMessage('session-1', 'msg-1', 'message_created', 'user-1', 'Message created');

    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(entry.sessionKey).toBe('session-1');
    expect(entry.messageId).toBe('msg-1');
    expect(entry.action).toBe('message_created');
    expect(entry.actor).toBe('user-1');
    expect(entry.severity).toBe('info');
  });

  it('should query entries by session key', () => {
    auditLog.logMessage('session-a', 'msg-1', 'message_created', 'user-1', 'Message created');
    auditLog.logMessage('session-b', 'msg-2', 'message_sent', 'user-2', 'Message sent');
    auditLog.logMessage('session-a', 'msg-3', 'message_delivered', 'system', 'Message delivered');

    const result = auditLog.query({ sessionKey: 'session-a' });

    expect(result.total).toBe(2);
    expect(result.entries.every((e) => e.sessionKey === 'session-a')).toBe(true);
  });

  it('should filter by severity', () => {
    auditLog.logMessage('session-1', 'msg-1', 'message_created', 'user-1', 'Created');
    auditLog.logMessage(
      'session-1',
      'msg-2',
      'message_failed',
      'system',
      'Failed',
      { severity: 'error' },
    );

    const result = auditLog.query({ severity: 'error' });

    expect(result.total).toBe(1);
    expect(result.entries[0].action).toBe('message_failed');
  });

  it('should support pagination', () => {
    for (let i = 0; i < 5; i++) {
      auditLog.logMessage('session-1', `msg-${i}`, 'message_created', 'user-1', `Message ${i}`);
    }

    const page1 = auditLog.query({ limit: 2, offset: 0 });
    expect(page1.entries).toHaveLength(2);
    expect(page1.hasMore).toBe(true);

    const page2 = auditLog.query({ limit: 2, offset: 2 });
    expect(page2.entries).toHaveLength(2);
    expect(page2.hasMore).toBe(true);

    const page3 = auditLog.query({ limit: 2, offset: 4 });
    expect(page3.entries).toHaveLength(1);
    expect(page3.hasMore).toBe(false);
  });

  it('should generate session timeline in chronological order', () => {
    auditLog.logMessage('session-1', 'msg-1', 'message_created', 'user-1', 'Created');
    auditLog.logMessage('session-1', 'msg-1', 'message_sent', 'system', 'Sent');
    auditLog.logMessage('session-1', 'msg-1', 'message_delivered', 'system', 'Delivered');

    const timeline = auditLog.getSessionTimeline('session-1');

    expect(timeline).toHaveLength(3);
    expect(timeline[0].action).toBe('message_created');
    expect(timeline[1].action).toBe('message_sent');
    expect(timeline[2].action).toBe('message_delivered');
  });

  it('should provide summary statistics', () => {
    auditLog.logMessage('session-1', 'msg-1', 'message_created', 'user-1', 'Created');
    auditLog.logMessage('session-1', 'msg-1', 'message_sent', 'system', 'Sent');
    auditLog.logMessage('session-1', 'msg-2', 'message_created', 'user-1', 'Created');
    auditLog.logMessage('session-1', 'msg-2', 'message_failed', 'system', 'Failed', { severity: 'error' });

    const summary = auditLog.getSummary();

    expect(summary.totalEntries).toBe(4);
    expect(summary.byAction.message_created).toBe(2);
    expect(summary.byAction.message_sent).toBe(1);
    expect(summary.byAction.message_failed).toBe(1);
    expect(summary.bySeverity.info).toBe(3);
    expect(summary.bySeverity.error).toBe(1);
    expect(summary.byActorType.user).toBe(2);
    expect(summary.byActorType.system).toBe(2);
    expect(summary.firstEntryAt).toBeDefined();
    expect(summary.lastEntryAt).toBeDefined();
  });

  it('should export to JSON', () => {
    auditLog.logMessage('session-1', 'msg-1', 'message_created', 'user-1', 'Created');

    const json = auditLog.exportToJson();
    const parsed = JSON.parse(json);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].sessionKey).toBe('session-1');
  });

  it('should export to CSV', () => {
    auditLog.logMessage('session-1', 'msg-1', 'message_created', 'user-1', 'Created');

    const csv = auditLog.exportToCsv();
    const lines = csv.split('\n');

    expect(lines[0]).toContain('id,timestamp,sessionKey,messageId');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('session-1');
  });

  it('should enforce retention limit', () => {
    const smallLog = new MessageAuditLog({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      smallLog.logMessage('session-1', `msg-${i}`, 'message_created', 'user-1', `Message ${i}`);
    }

    expect(smallLog.size()).toBe(3);
  });

  it('singleton messageAuditLog should be available', () => {
    messageAuditLog.clear();
    messageAuditLog.logMessage('session-test', 'msg-test', 'message_created', 'system', 'Test');

    expect(messageAuditLog.size()).toBeGreaterThan(0);
  });
});
