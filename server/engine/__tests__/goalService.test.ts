// goalService unit tests cover the durable goal lifecycle (event-sourced):
// create / edit / pause / resume / block(with reason) / complete / clear,
// CAS revision conflicts, round-budget accounting, and fold semantics.
import { describe, expect, it, beforeEach } from 'vitest';
import {
  GoalError,
  GoalService,
  InMemoryGoalStore,
  foldGoalEvents,
  type GoalSnapshot,
} from '../goalService.js';

describe('engine/goalService — lifecycle', () => {
  let service: GoalService;
  beforeEach(() => {
    service = new GoalService(new InMemoryGoalStore());
  });

  it('create → get returns the active snapshot with revision 1', async () => {
    const goal = await service.create('s1', { objective: '对账 7 月跨境订单' });
    expect(goal.phase).toBe('active');
    expect(goal.revision).toBe(1);
    expect(goal.roundsStarted).toBe(0);
    expect(goal.maxGoalRounds).toBeGreaterThan(0);
    const read = await service.get('s1');
    expect(read?.objective).toBe('对账 7 月跨境订单');
    expect(read?.id).toBe(goal.id);
  });

  it('rejects empty objective', async () => {
    await expect(service.create('s1', { objective: '   ' })).rejects.toThrowError(GoalError);
  });

  it('rejects create while an active goal exists, allows replace after complete', async () => {
    const g1 = await service.create('s1', { objective: '任务 A' });
    await expect(service.create('s1', { objective: '任务 B' })).rejects.toMatchObject({ code: 'EXISTS' });
    await service.transition('s1', { id: g1.id, revision: g1.revision }, 'complete');
    const g2 = await service.create('s1', { objective: '任务 B' });
    expect(g2.objective).toBe('任务 B');
  });

  it('pause → resume → complete transitions and guards invalid transitions', async () => {
    const g = await service.create('s1', { objective: '任务 C' });
    const paused = await service.transition('s1', { id: g.id, revision: 1 }, 'pause');
    expect(paused.phase).toBe('paused');
    await expect(service.transition('s1', { id: g.id, revision: paused.revision }, 'pause')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    const resumed = await service.transition('s1', { id: g.id, revision: paused.revision }, 'resume');
    expect(resumed.phase).toBe('active');
    const done = await service.transition('s1', { id: g.id, revision: resumed.revision }, 'complete');
    expect(done.phase).toBe('complete');
  });

  it('block requires machine-routable code + human message, and is reversible via resume', async () => {
    const g = await service.create('s1', { objective: '申报任务' });
    await expect(
      service.transition('s1', { id: g.id, revision: 1 }, 'block', { code: '', message: 'x' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const blocked = await service.transition('s1', { id: g.id, revision: 1 }, 'block', {
      code: 'customs_waiting',
      message: '等待海关回执，最长 24h',
    });
    expect(blocked.phase).toBe('blocked');
    expect(blocked.blockedReason).toEqual({ code: 'customs_waiting', message: '等待海关回执，最长 24h' });
    const resumed = await service.transition('s1', { id: g.id, revision: blocked.revision }, 'resume');
    expect(resumed.phase).toBe('active');
    expect(resumed.blockedReason).toBeUndefined();
  });
});

describe('engine/goalService — CAS conflicts', () => {
  it('rejects stale revisions with CONFLICT', async () => {
    const service = new GoalService(new InMemoryGoalStore());
    const g = await service.create('s1', { objective: '并发任务' });
    await service.edit('s1', { id: g.id, revision: g.revision }, { objective: '已编辑' });
    // 用旧 revision 再改 → 冲突
    await expect(service.edit('s1', { id: g.id, revision: g.revision }, { objective: '过期编辑' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('edit on unknown session throws NO_GOAL', async () => {
    const service = new GoalService(new InMemoryGoalStore());
    await expect(service.edit('s-unknown', { id: 'x', revision: 1 }, { objective: 'y' })).rejects.toMatchObject({
      code: 'NO_GOAL',
    });
  });
});

describe('engine/goalService — round budget', () => {
  it('admits rounds up to the cap, then rejects with ROUNDS_EXHAUSTED', async () => {
    const service = new GoalService(new InMemoryGoalStore());
    const g = await service.create('s1', { objective: '限量任务', maxGoalRounds: 2 });
    const r1 = await service.admitRound('s1', { id: g.id, revision: 1 });
    expect(r1.roundsStarted).toBe(1);
    const r2 = await service.admitRound('s1', { id: r1.id, revision: r1.revision });
    expect(r2.roundsStarted).toBe(2);
    await expect(service.admitRound('s1', { id: r2.id, revision: r2.revision })).rejects.toMatchObject({
      code: 'ROUNDS_EXHAUSTED',
    });
  });

  it('rejects round admission when paused', async () => {
    const service = new GoalService(new InMemoryGoalStore());
    const g = await service.create('s1', { objective: '暂停任务' });
    const paused = await service.transition('s1', { id: g.id, revision: 1 }, 'pause');
    await expect(service.admitRound('s1', { id: g.id, revision: paused.revision })).rejects.toMatchObject({
      code: 'STOPPED',
    });
  });
});

describe('engine/goalService — clear tombstone & fold', () => {
  it('clear returns tombstone and get() becomes undefined; events retain history', async () => {
    const store = new InMemoryGoalStore();
    const service = new GoalService(store);
    const g = await service.create('s1', { objective: '一次性任务' });
    const tombstone = await service.clear('s1', { id: g.id, revision: g.revision });
    expect(tombstone.revision).toBe(g.revision + 1);
    expect(await service.get('s1')).toBeUndefined();
    const events = await store.readAll('s1');
    expect(events.length).toBe(2); // create + clear
    expect(events[1].operation).toBe('clear');
    expect(foldGoalEvents(events)).toBeUndefined();
  });

  it('fold is last-wins by revision', async () => {
    const store = new InMemoryGoalStore();
    const service = new GoalService(store);
    const g = await service.create('s1', { objective: 'A' });
    await service.edit('s1', { id: g.id, revision: 1 }, { objective: 'B' });
    await service.edit('s1', { id: g.id, revision: 2 }, { objective: 'C' });
    const folded = foldGoalEvents(await store.readAll('s1')) as GoalSnapshot;
    expect(folded.objective).toBe('C');
    expect(folded.revision).toBe(3);
  });
});
