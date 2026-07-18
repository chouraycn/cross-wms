import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../logger.js';
import { SessionStore } from './store.js';
import type { SessionGoal } from './types.js';
import { SessionGoalSchema } from './types.js';

export class SessionGoalsManager {
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  getGoals(sessionId: string): SessionGoal[] {
    const sessionData = this.store.getSession(sessionId);
    return sessionData?.goals || [];
  }

  getGoal(sessionId: string, goalId: string): SessionGoal | null {
    const goals = this.getGoals(sessionId);
    return goals.find(g => g.id === goalId) || null;
  }

  async addGoal(
    sessionId: string,
    goal: Partial<SessionGoal> & { description: string }
  ): Promise<SessionGoal | null> {
    const goals = this.getGoals(sessionId);

    const newGoal: SessionGoal = SessionGoalSchema.parse({
      ...goal,
      id: goal.id || uuidv4(),
      createdAt: goal.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: goal.status || 'pending',
      priority: goal.priority || 'medium',
      progress: goal.progress ?? 0,
      subtasks: goal.subtasks || [],
    });

    goals.push(newGoal);
    const updated = await this.updateGoals(sessionId, goals);
    return updated ? newGoal : null;
  }

  async updateGoal(
    sessionId: string,
    goalId: string,
    updates: Partial<SessionGoal>
  ): Promise<SessionGoal | null> {
    const goals = this.getGoals(sessionId);
    const index = goals.findIndex(g => g.id === goalId);

    if (index < 0) return null;

    goals[index] = SessionGoalSchema.parse({
      ...goals[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    });

    const updated = await this.updateGoals(sessionId, goals);
    return updated ? goals[index] : null;
  }

  async removeGoal(sessionId: string, goalId: string): Promise<boolean> {
    const goals = this.getGoals(sessionId);
    const filtered = goals.filter(g => g.id !== goalId);

    if (filtered.length === goals.length) return false;

    const updated = await this.updateGoals(sessionId, filtered);
    return updated !== null;
  }

  async updateGoals(
    sessionId: string,
    goals: SessionGoal[]
  ): Promise<SessionGoal[] | null> {
    const sessionData = this.store.getSession(sessionId);
    if (!sessionData) return null;

    const writer = this.store.getWriter();
    const firstLine = JSON.stringify({
      session: sessionData.metadata,
      messages: [],
      ...sessionData,
      goals,
    });

    const result = await writer.rewriteFirstLine(sessionId, firstLine);
    if (result.success) {
      this.store.getCache().invalidateSessionData(sessionId);
      return goals;
    }

    return null;
  }

  async setGoalStatus(
    sessionId: string,
    goalId: string,
    status: SessionGoal['status']
  ): Promise<SessionGoal | null> {
    return this.updateGoal(sessionId, goalId, {
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : undefined,
    });
  }

  async setGoalProgress(
    sessionId: string,
    goalId: string,
    progress: number
  ): Promise<SessionGoal | null> {
    return this.updateGoal(sessionId, goalId, { progress });
  }

  async addSubtask(
    sessionId: string,
    goalId: string,
    description: string
  ): Promise<SessionGoal | null> {
    const goals = this.getGoals(sessionId);
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return null;

    goal.subtasks.push({
      id: uuidv4(),
      description,
      completed: false,
    });

    goal.updatedAt = new Date().toISOString();
    const updated = await this.updateGoals(sessionId, goals);
    return updated ? goal : null;
  }

  async toggleSubtask(
    sessionId: string,
    goalId: string,
    subtaskId: string
  ): Promise<SessionGoal | null> {
    const goals = this.getGoals(sessionId);
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return null;

    const subtask = goal.subtasks.find(s => s.id === subtaskId);
    if (!subtask) return null;

    subtask.completed = !subtask.completed;
    goal.updatedAt = new Date().toISOString();

    const completedCount = goal.subtasks.filter(s => s.completed).length;
    goal.progress = goal.subtasks.length > 0
      ? Math.round((completedCount / goal.subtasks.length) * 100)
      : 0;

    const updated = await this.updateGoals(sessionId, goals);
    return updated ? goal : null;
  }

  async clearGoals(sessionId: string): Promise<boolean> {
    const updated = await this.updateGoals(sessionId, []);
    return updated !== null;
  }

  getProgress(sessionId: string): number {
    const goals = this.getGoals(sessionId);
    if (goals.length === 0) return 0;

    const totalProgress = goals.reduce((sum, g) => sum + g.progress, 0);
    return Math.round(totalProgress / goals.length);
  }

  getCompletedCount(sessionId: string): number {
    const goals = this.getGoals(sessionId);
    return goals.filter(g => g.status === 'completed').length;
  }

  getActiveCount(sessionId: string): number {
    const goals = this.getGoals(sessionId);
    return goals.filter(g => g.status === 'in_progress').length;
  }
}
