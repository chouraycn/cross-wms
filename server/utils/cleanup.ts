import { initDb } from '../db.js';
import type { Database } from 'better-sqlite3';

const CLEANUP_CONFIG = {
  todoRetentionDays: 90,
  artifactRetentionDays: 30,
  toolCallRetentionDays: 60,
  trajectoryRetentionDays: 30,
};

function db(): Database {
  return initDb();
}

export function cleanupOldRecords(dbInstance?: Database): void {
  const database = dbInstance || db();
  
  const now = new Date();
  
  const todoCutoff = new Date(now.getTime() - CLEANUP_CONFIG.todoRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const todoResult = database.prepare(
    'DELETE FROM todo_items WHERE created_at < ?'
  ).run(todoCutoff);
  
  const artifactCutoff = new Date(now.getTime() - CLEANUP_CONFIG.artifactRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const artifactResult = database.prepare(
    'DELETE FROM artifacts WHERE created_at < ?'
  ).run(artifactCutoff);
  
  const toolCallCutoff = new Date(now.getTime() - CLEANUP_CONFIG.toolCallRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const toolCallResult = database.prepare(
    'DELETE FROM tool_calls WHERE started_at < ?'
  ).run(toolCallCutoff);
  
  const trajectoryCutoff = new Date(now.getTime() - CLEANUP_CONFIG.trajectoryRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const trajectoryResult = database.prepare(
    'DELETE FROM trajectory_events WHERE ts < ?'
  ).run(trajectoryCutoff);

  console.log(`[Cleanup] Completed: todos=${todoResult.changes}, artifacts=${artifactResult.changes}, tool_calls=${toolCallResult.changes}, trajectory_events=${trajectoryResult.changes}`);
}

export function getCleanupStats(dbInstance?: Database): {
  todos: number;
  artifacts: number;
  toolCalls: number;
  trajectoryEvents: number;
} {
  const database = dbInstance || db();
  
  const now = new Date();
  
  const todoCutoff = new Date(now.getTime() - CLEANUP_CONFIG.todoRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const todoCount = (database.prepare(
    'SELECT COUNT(*) as count FROM todo_items WHERE created_at < ?'
  ).get(todoCutoff) as { count: number }).count;
  
  const artifactCutoff = new Date(now.getTime() - CLEANUP_CONFIG.artifactRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const artifactCount = (database.prepare(
    'SELECT COUNT(*) as count FROM artifacts WHERE created_at < ?'
  ).get(artifactCutoff) as { count: number }).count;
  
  const toolCallCutoff = new Date(now.getTime() - CLEANUP_CONFIG.toolCallRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const toolCallCount = (database.prepare(
    'SELECT COUNT(*) as count FROM tool_calls WHERE started_at < ?'
  ).get(toolCallCutoff) as { count: number }).count;
  
  const trajectoryCutoff = new Date(now.getTime() - CLEANUP_CONFIG.trajectoryRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const trajectoryCount = (database.prepare(
    'SELECT COUNT(*) as count FROM trajectory_events WHERE ts < ?'
  ).get(trajectoryCutoff) as { count: number }).count;

  return {
    todos: todoCount,
    artifacts: artifactCount,
    toolCalls: toolCallCount,
    trajectoryEvents: trajectoryCount,
  };
}

export function scheduleCleanup(cronScheduler: any, schedule: string = '0 3 * * *'): void {
  if (cronScheduler && typeof cronScheduler.schedule === 'function') {
    cronScheduler.schedule(schedule, () => {
      console.log('[Cleanup] Starting scheduled cleanup...');
      cleanupOldRecords();
    });
    console.log(`[Cleanup] Scheduled cleanup task: ${schedule}`);
  }
}