/**
 * Goal Context - 目标管理上下文
 *
 * 提供会话目标的全局状态管理，支持创建、获取、更新、清除目标
 */

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { GoalStatus, GoalRecord } from '../../types/goal';

interface GoalContextValue {
  goal: GoalRecord | null;
  isLoading: boolean;
  error: string | null;
  loadGoal: (sessionKey: string) => Promise<void>;
  createGoal: (sessionKey: string, objective: string, tokenBudget?: number) => Promise<boolean>;
  updateGoalStatus: (sessionKey: string, status: GoalStatus, note?: string) => Promise<boolean>;
  clearGoal: (sessionKey: string) => Promise<boolean>;
}

const GoalContext = createContext<GoalContextValue | null>(null);

export function useGoal() {
  const context = useContext(GoalContext);
  if (!context) {
    throw new Error('useGoal must be used within a GoalProvider');
  }
  return context;
}

interface GoalProviderProps {
  children: ReactNode;
}

export const GoalProvider: React.FC<GoalProviderProps> = ({ children }) => {
  const [goal, setGoal] = useState<GoalRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGoal = useCallback(async (sessionKey: string) => {
    if (!sessionKey) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(sessionKey)}`);
      const data = await response.json();

      if (data.data && data.data.status === 'found' && data.data.goal) {
        setGoal(data.data.goal);
      } else {
        setGoal(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGoal(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createGoal = useCallback(async (sessionKey: string, objective: string, tokenBudget?: number): Promise<boolean> => {
    if (!sessionKey || !objective.trim()) return false;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(sessionKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective, tokenBudget }),
      });

      const data = await response.json();

      if (data.data && data.data.goal) {
        setGoal(data.data.goal);
        return true;
      }
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateGoalStatus = useCallback(async (sessionKey: string, status: GoalStatus, note?: string): Promise<boolean> => {
    if (!sessionKey || !status) return false;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(sessionKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note }),
      });

      const data = await response.json();

      if (data.data && data.data.goal) {
        setGoal(data.data.goal);
        return true;
      }
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearGoal = useCallback(async (sessionKey: string): Promise<boolean> => {
    if (!sessionKey) return false;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(sessionKey)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.data && data.data.success) {
        setGoal(null);
        return true;
      }
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value: GoalContextValue = {
    goal,
    isLoading,
    error,
    loadGoal,
    createGoal,
    updateGoalStatus,
    clearGoal,
  };

  return (
    <GoalContext.Provider value={value}>
      {children}
    </GoalContext.Provider>
  );
};

export default GoalContext;
