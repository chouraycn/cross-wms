import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { GrayScale } from '../constants/theme';

export interface ProcessTask {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  startTime: number;
  endTime?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface ProcessStatusContextValue {
  tasks: ProcessTask[];
  addTask: (task: Omit<ProcessTask, 'id' | 'startTime' | 'status'>) => string;
  updateTask: (id: string, updates: Partial<ProcessTask>) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
}

const ProcessStatusContext = createContext<ProcessStatusContextValue | null>(null);

export function useProcessStatus() {
  const ctx = useContext(ProcessStatusContext);
  if (!ctx) {
    throw new Error('useProcessStatus must be used within ProcessStatusProvider');
  }
  return ctx;
}

let taskIdCounter = 0;

export const ProcessStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<ProcessTask[]>([]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const addTask = useCallback((task: Omit<ProcessTask, 'id' | 'startTime' | 'status'>): string => {
    const id = `task-${++taskIdCounter}-${Date.now()}`;
    const newTask: ProcessTask = {
      ...task,
      id,
      status: 'running',
      startTime: Date.now(),
    };
    setTasks(prev => [...prev, newTask]);
    return id;
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<ProcessTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status === 'running' || t.status === 'pending'));
  }, []);

  return (
    <ProcessStatusContext.Provider value={{ tasks, addTask, updateTask, removeTask, clearCompleted }}>
      {children}
    </ProcessStatusContext.Provider>
  );
};

// ===================== Process Status Panel =====================

interface ProcessStatusPanelProps {
  isDark: boolean;
  gs: GrayScale;
}

export const ProcessStatusPanel: React.FC<ProcessStatusPanelProps> = ({ isDark, gs }) => {
  const { tasks, updateTask, removeTask, clearCompleted } = useProcessStatus();
  const [expanded, setExpanded] = React.useState(true);
  const [minimized, setMinimized] = React.useState(false);

  const runningTasks = tasks.filter(t => t.status === 'running' || t.status === 'pending');
  const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled');
  const allTasks = [...runningTasks, ...completedTasks].slice(0, 5);

  if (tasks.length === 0) return null;

  const handleCancel = (id: string) => {
    updateTask(id, { status: 'cancelled', endTime: Date.now() });
  };

  const handleRetry = (id: string) => {
    updateTask(id, { status: 'running', error: undefined, endTime: undefined });
  };

  const getDuration = (task: ProcessTask): string => {
    const end = task.endTime || Date.now();
    const duration = Math.round((end - task.startTime) / 1000);
    if (duration < 60) return `${duration}s`;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  };

  const statusConfig: Record<string, { color: string; icon: string; bg: string }> = {
    pending: { color: '#6B7280', icon: '⏳', bg: 'rgba(107,114,128,0.1)' },
    running: { color: '#3B82F6', icon: '▶', bg: 'rgba(59,130,246,0.1)' },
    completed: { color: '#22C55E', icon: '✓', bg: 'rgba(34,197,94,0.1)' },
    failed: { color: '#EF4444', icon: '✗', bg: 'rgba(239,68,68,0.1)' },
    cancelled: { color: '#F59E0B', icon: '⊘', bg: 'rgba(245,158,11,0.1)' },
  };

  if (minimized) {
    return (
      <Box
        onClick={() => setMinimized(false)}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.5,
          py: 0.75,
          borderRadius: 2,
          bgcolor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)',
          border: '1px solid rgba(59,130,246,0.3)',
          cursor: 'pointer',
          '&:hover': {
            bgcolor: isDark ? 'rgba(59,130,246,0.25)' : 'rgba(59,130,246,0.15)',
          },
        }}
      >
        <Box sx={{ fontSize: 12, color: '#3B82F6' }}>⚙</Box>
        <Box sx={{ fontSize: 11, fontWeight: 500, color: '#3B82F6' }}>
          {runningTasks.length} 进程
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 100,
        width: 320,
        maxWidth: 'calc(100% - 16px)',
        borderRadius: 2,
        bgcolor: isDark ? 'rgba(26,26,26,0.95)' : 'rgba(255,255,255,0.95)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
        boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.15)',
        backdropFilter: 'blur(8px)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        }}
      >
        <Box sx={{ fontSize: 14 }}>⚙</Box>
        <Box sx={{ fontSize: 12, fontWeight: 600, color: gs.textPrimary, flex: 1 }}>
          进程状态
        </Box>
        <Box
          sx={{
            fontSize: 10,
            px: 0.75,
            py: 0.25,
            borderRadius: 1,
            bgcolor: runningTasks.length > 0 ? 'rgba(59,130,246,0.15)' : 'rgba(34,197,94,0.15)',
            color: runningTasks.length > 0 ? '#3B82F6' : '#22C55E',
          }}
        >
          {runningTasks.length > 0 ? `${runningTasks.length} 运行中` : '全部完成'}
        </Box>
        <Box
          onClick={() => setExpanded(!expanded)}
          sx={{ cursor: 'pointer', color: gs.textMuted, fontSize: 12, ml: 0.5 }}
        >
          {expanded ? '▼' : '▶'}
        </Box>
        <Box
          onClick={() => setMinimized(true)}
          sx={{ cursor: 'pointer', color: gs.textMuted, fontSize: 10 }}
        >
          ✕
        </Box>
      </Box>

      {/* Task List */}
      {expanded && (
        <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
          {allTasks.map(task => {
            const config = statusConfig[task.status];
            return (
              <Box
                key={task.id}
                sx={{
                  px: 1.5,
                  py: 1,
                  borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                  '&:last-child': { borderBottom: 'none' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Box sx={{ fontSize: 12, color: config.color }}>{config.icon}</Box>
                  <Box sx={{ fontSize: 12, fontWeight: 500, color: gs.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.name}
                  </Box>
                  <Box sx={{ fontSize: 10, color: gs.textMuted }}>
                    {getDuration(task)}
                  </Box>
                </Box>

                {task.description && (
                  <Box sx={{ fontSize: 10, color: gs.textMuted, ml: 2.5, mb: 0.5 }}>
                    {task.description}
                  </Box>
                )}

                {task.status === 'running' && task.progress !== undefined && (
                  <Box sx={{ ml: 2.5, mr: 1 }}>
                    <Box
                      sx={{
                        height: 3,
                        borderRadius: 2,
                        bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        sx={{
                          height: '100%',
                          width: `${task.progress}%`,
                          bgcolor: '#3B82F6',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </Box>
                    <Box sx={{ fontSize: 9, color: gs.textMuted, mt: 0.25, textAlign: 'right' }}>
                      {task.progress}%
                    </Box>
                  </Box>
                )}

                {task.status === 'failed' && task.error && (
                  <Box sx={{ fontSize: 10, color: '#EF4444', ml: 2.5 }}>
                    {task.error}
                  </Box>
                )}

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, ml: 2.5 }}>
                  {task.status === 'running' && (
                    <Box
                      onClick={() => handleCancel(task.id)}
                      sx={{
                        fontSize: 10,
                        px: 0.75,
                        py: 0.25,
                        borderRadius: 1,
                        bgcolor: 'rgba(239,68,68,0.1)',
                        color: '#EF4444',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.2)' },
                      }}
                    >
                      取消
                    </Box>
                  )}
                  {task.status === 'failed' && (
                    <Box
                      onClick={() => handleRetry(task.id)}
                      sx={{
                        fontSize: 10,
                        px: 0.75,
                        py: 0.25,
                        borderRadius: 1,
                        bgcolor: 'rgba(59,130,246,0.1)',
                        color: '#3B82F6',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(59,130,246,0.2)' },
                      }}
                    >
                      重试
                    </Box>
                  )}
                  {(task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') && (
                    <Box
                      onClick={() => removeTask(task.id)}
                      sx={{
                        fontSize: 10,
                        px: 0.75,
                        py: 0.25,
                        borderRadius: 1,
                        bgcolor: 'rgba(107,114,128,0.1)',
                        color: gs.textMuted,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(107,114,128,0.2)' },
                      }}
                    >
                      清除
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Footer */}
      {expanded && completedTasks.length > 0 && (
        <Box
          sx={{
            px: 1.5,
            py: 0.75,
            borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
            bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
          }}
        >
          <Box
            onClick={clearCompleted}
            sx={{
              fontSize: 10,
              color: gs.textMuted,
              cursor: 'pointer',
              '&:hover': { color: gs.textPrimary },
            }}
          >
            清除已完成 ({completedTasks.length})
          </Box>
        </Box>
      )}
    </Box>
  );
};

// ===================== 导入 Box 组件 =====================
import { Box } from '@mui/material';