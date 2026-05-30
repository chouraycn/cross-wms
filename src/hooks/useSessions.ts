import { useState, useCallback, useEffect } from 'react';
import type { Session, Message } from '../types/chat';

const API_BASE = 'http://localhost:3001/api';

export interface UseSessionsReturn {
  sessions: Session[];
  currentSession: Session | null;
  fetchSessions: () => Promise<void>;
  addSession: (title: string, model: string, agentId?: string) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  selectSession: (session: Session) => void;
  updateSessionMessages: (sessionId: string, messages: Message[]) => void;
}

export function useSessions(): UseSessionsReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/sessions`);
      const data = await response.json();
      if (data.ok) {
        // Transform date strings to Date objects
        const sessionsWithDates = data.sessions.map((s: Record<string, unknown>) => ({
          ...s,
          createdAt: new Date(s.createdAt as string),
          updatedAt: new Date(s.updatedAt as string),
          messages: [],
        }));
        setSessions(sessionsWithDates);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  }, []);

  const addSession = useCallback(async (title: string, model: string, agentId?: string): Promise<Session> => {
    try {
      const response = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, model, agentId }),
      });
      const data = await response.json();
      if (data.ok) {
        const newSession: Session = {
          ...data.session,
          createdAt: new Date(data.session.createdAt),
          updatedAt: new Date(data.session.updatedAt),
          messages: [],
        };
        setSessions((prev) => [newSession, ...prev]);
        setCurrentSession(newSession);
        return newSession;
      }
      throw new Error('Failed to create session');
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/sessions/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (currentSession?.id === id) {
          setCurrentSession(null);
        }
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  }, [currentSession]);

  const selectSession = useCallback((session: Session) => {
    setCurrentSession(session);
  }, []);

  const updateSessionMessages = useCallback((sessionId: string, messages: Message[]) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, messages } : s
      )
    );
    if (currentSession?.id === sessionId) {
      setCurrentSession((prev) => prev ? { ...prev, messages } : null);
    }
  }, [currentSession]);

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    currentSession,
    fetchSessions,
    addSession,
    deleteSession,
    selectSession,
    updateSessionMessages,
  };
}
