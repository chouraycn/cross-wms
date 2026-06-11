import React, { createContext, useContext, useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  subscribeSessions,
  getSessionsSnapshot,
  loadSessions,
} from '../utils/sessionStore';

interface ActiveSessionContextValue {
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
}

const ActiveSessionContext = createContext<ActiveSessionContextValue>({
  activeSessionId: '',
  setActiveSessionId: () => {},
});

export function ActiveSessionProvider({ children }: { children: React.ReactNode }) {
  const sessions = useSyncExternalStore(subscribeSessions, getSessionsSnapshot);

  const [activeSessionId, setActiveSessionIdRaw] = useState<string>(() => {
    const saved = loadSessions();
    return saved.length > 0 ? saved[0].id : '';
  });

  // 自动验证：如果 activeSessionId 对应的 session 被删了，回退到列表第一个
  useEffect(() => {
    if (sessions.length === 0) {
      setActiveSessionIdRaw('');
      return;
    }
    if (activeSessionId && !sessions.some((s) => s.id === activeSessionId)) {
      setActiveSessionIdRaw(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  const setActiveSessionId = useCallback((id: string) => {
    setActiveSessionIdRaw(id);
  }, []);

  return (
    <ActiveSessionContext.Provider value={{ activeSessionId, setActiveSessionId }}>
      {children}
    </ActiveSessionContext.Provider>
  );
}

export function useActiveSession() {
  return useContext(ActiveSessionContext);
}
