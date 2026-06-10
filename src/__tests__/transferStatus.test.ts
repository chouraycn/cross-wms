/**
 * Unit tests for src/constants/transferStatus.ts
 *
 * Tests:
 * - STATUS_CONFIG completeness (all 4 statuses)
 * - canTransition() state machine validation
 * - STATUS_ACTIONS per-status action availability
 */
import { describe, it, expect } from 'vitest';
import {
  STATUS_CONFIG,
  STATUS_FLOW,
  canTransition,
  STATUS_ACTIONS,
} from '../constants/transferStatus';
import type { TransferStatus } from '../types/wms';

// ===================== STATUS_CONFIG Tests =====================

describe('STATUS_CONFIG', () => {
  it('should define exactly 4 statuses', () => {
    const statusKeys = Object.keys(STATUS_CONFIG) as TransferStatus[];
    expect(statusKeys).toHaveLength(4);
    expect(statusKeys).toContain('draft');
    expect(statusKeys).toContain('submitted');
    expect(statusKeys).toContain('in_transit');
    expect(statusKeys).toContain('completed');
  });

  it.each([
    ['draft' as const, '草稿', 'default'],
    ['submitted' as const, '已提交', 'warning'],
    ['in_transit' as const, '在途', 'info'],
    ['completed' as const, '已完成', 'success'],
  ] as [TransferStatus, string, 'default' | 'warning' | 'info' | 'success'][])(
    'status "%s" should have label "%s" and color "%s"',
    (status, expectedLabel, expectedColor) => {
      expect(STATUS_CONFIG[status].label).toBe(expectedLabel);
      expect(STATUS_CONFIG[status].color).toBe(expectedColor);
      expect(STATUS_CONFIG[status]).toHaveProperty('actionLabel');
      expect(typeof STATUS_CONFIG[status].actionLabel).toBe('string');
    }
  );

  it('each status should have non-empty label and actionLabel', () => {
    for (const status of Object.keys(STATUS_CONFIG) as TransferStatus[]) {
      expect(STATUS_CONFIG[status].label.length).toBeGreaterThan(0);
      expect(STATUS_CONFIG[status].actionLabel.length).toBeGreaterThan(0);
    }
  });
});

// ===================== STATUS_FLOW Tests =====================

describe('STATUS_FLOW', () => {
  it('should cover all 4 statuses as keys', () => {
    const keys = Object.keys(STATUS_FLOW) as TransferStatus[];
    expect(keys.sort()).toEqual(['completed', 'draft', 'in_transit', 'submitted']);
  });

  it('draft should only allow transition to submitted', () => {
    expect(STATUS_FLOW['draft']).toEqual(['submitted']);
  });

  it('submitted should allow transitions to in_transit and completed', () => {
    expect(STATUS_FLOW['submitted']).toEqual(expect.arrayContaining(['in_transit', 'completed']));
    expect(STATUS_FLOW['submitted']).toHaveLength(2);
  });

  it('in_transit should allow transitions to submitted and completed', () => {
    expect(STATUS_FLOW['in_transit']).toEqual(expect.arrayContaining(['submitted', 'completed']));
    expect(STATUS_FLOW['in_transit']).toHaveLength(2);
  });

  it('completed should have no allowed transitions (terminal state)', () => {
    expect(STATUS_FLOW['completed']).toEqual([]);
  });
});

// ===================== canTransition() Tests =====================

describe('canTransition', () => {
  // Valid transitions — happy path
  it.each([
    ['draft', 'submitted'],
    ['submitted', 'in_transit'],
    ['submitted', 'completed'],
    ['in_transit', 'submitted'],
    ['in_transit', 'completed'],
  ] as [TransferStatus, TransferStatus][])(
    'should allow valid transition: %s → %s',
    (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    }
  );

  // Invalid transitions
  it.each([
    ['draft', 'in_transit'],       // cannot skip submitted
    ['draft', 'completed'],        // cannot skip to terminal
    ['submitted', 'draft'],        // cannot go back to draft
    ['completed', 'submitted'],    // terminal state, no outgoing
    ['completed', 'draft'],
    ['completed', 'in_transit'],
  ] as [TransferStatus, TransferStatus][])(
    'should reject invalid transition: %s → %s',
    (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    }
  );

  // Self-transition is not allowed for any status
  it.each(['draft', 'submitted', 'in_transit', 'completed'] as TransferStatus[])(
    'should reject self-transition on status "%s"',
    (status) => {
      expect(canTransition(status, status)).toBe(false);
    }
  );
});

// ===================== STATUS_ACTIONS Tests =====================

describe('STATUS_ACTIONS', () => {
  it('should define actions for all 4 statuses', () => {
    const keys = Object.keys(STATUS_ACTIONS) as TransferStatus[];
    expect(keys).toHaveLength(4);
    expect(keys.sort()).toEqual(['completed', 'draft', 'in_transit', 'submitted']);
  });

  it('draft should allow edit, submit, delete', () => {
    expect(STATUS_ACTIONS['draft']).toEqual(expect.arrayContaining(['edit', 'submit', 'delete']));
    expect(STATUS_ACTIONS['draft']).toHaveLength(3);
  });

  it('submitted should allow receive and bindTransit', () => {
    expect(STATUS_ACTIONS['submitted']).toEqual(expect.arrayContaining(['receive', 'bindTransit']));
    expect(STATUS_ACTIONS['submitted']).toHaveLength(2);
  });

  it('in_transit should allow receive and unbindTransit', () => {
    expect(STATUS_ACTIONS['in_transit']).toEqual(expect.arrayContaining(['receive', 'unbindTransit']));
    expect(STATUS_ACTIONS['in_transit']).toHaveLength(2);
  });

  it('completed should only allow view', () => {
    expect(STATUS_ACTIONS['completed']).toEqual(['view']);
  });

  it('mutually exclusive action sets across states', () => {
    // edit/delete only in draft
    expect(STATUS_ACTIONS['draft']).toContain('edit');
    expect(STATUS_ACTIONS['submitted']).not.toContain('edit');
    expect(STATUS_ACTIONS['in_transit']).not.toContain('edit');
    expect(STATUS_ACTIONS['completed']).not.toContain('edit');

    // submit only in draft
    expect(STATUS_ACTIONS['draft']).toContain('submit');

    // delete only in draft
    expect(STATUS_ACTIONS['draft']).toContain('delete');
    expect(STATUS_ACTIONS['submitted']).not.toContain('delete');

    // receive in submitted or in_transit
    expect(STATUS_ACTIONS['submitted']).toContain('receive');
    expect(STATUS_ACTIONS['in_transit']).toContain('receive');
    expect(STATUS_ACTIONS['draft']).not.toContain('receive');
    expect(STATUS_ACTIONS['completed']).not.toContain('receive');

    // bindTransit only in submitted
    expect(STATUS_ACTIONS['submitted']).toContain('bindTransit');
    expect(STATUS_ACTIONS['in_transit']).not.toContain('bindTransit');

    // unbindTransit only in in_transit
    expect(STATUS_ACTIONS['in_transit']).toContain('unbindTransit');
    expect(STATUS_ACTIONS['submitted']).not.toContain('unbindTransit');

    // view only in completed
    expect(STATUS_ACTIONS['completed']).toContain('view');
    expect(STATUS_ACTIONS['draft']).not.toContain('view');
  });
});
