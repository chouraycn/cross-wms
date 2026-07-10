import React, { useEffect, useState, useRef } from 'react';
import {
  Box, Typography, Button, Paper, Stack, Chip, useTheme,
  FormControl, InputLabel, Select, MenuItem, TextField,
} from '@mui/material';
import { useProcessStatus } from '../contexts/ProcessStatusContext';
import { getGrayScale } from '../constants/theme';

const ProcessStatusDemoPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { addTask, updateTask, tasks, removeTask, clearCompleted } = useProcessStatus();
  const [demoName, setDemoName] = useState('数据导入');
  const [demoDesc, setDemoDesc] = useState('从 Excel 文件导入库存数据...');
  const [autoProgress, setAutoProgress] = useState(true);
  const intervalRef = useRef<number | null>(null);
  const progressMapRef = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startNewTask = () => {
    const taskId = addTask({
      name: demoName,
      description: demoDesc,
    });
    progressMapRef.current[taskId] = 0;

    if (autoProgress) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = window.setInterval(() => {
        let allDone = true;
        for (const [id, prog] of Object.entries(progressMapRef.current)) {
          if (prog < 100) {
            allDone = false;
            const increment = Math.random() * 8 + 2;
            const newProg = Math.min(100, prog + increment);
            progressMapRef.current[id] = newProg;
            
            if (newProg >= 100) {
              updateTask(id, { 
                status: 'completed', 
                progress: 100, 
                endTime: Date.now() 
              });
            } else {
              updateTask(id, { progress: Math.round(newProg) });
            }
          }
        }
        if (allDone && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, 500);
    }
    return taskId;
  };

  const addPendingTask = () => {
    const taskId = addTask({
      name: `待处理任务 ${Object.keys(progressMapRef.current).length + 1}`,
      description: '等待中...',
    });
    progressMapRef.current[taskId] = 0;
    updateTask(taskId, { status: 'pending' });
  };

  const addFailedTask = () => {
    const taskId = addTask({
      name: '失败的任务',
      description: '网络请求超时',
    });
    setTimeout(() => {
      updateTask(taskId, { 
        status: 'failed', 
        error: 'Connection timeout after 30s',
        endTime: Date.now() 
      });
    }, 1500);
  };

  const addCancelledTask = () => {
    const taskId = addTask({
      name: '已取消的任务',
      description: '用户主动取消',
    });
    progressMapRef.current[taskId] = 35;
    updateTask(taskId, { progress: 35 });
    setTimeout(() => {
      updateTask(taskId, { 
        status: 'cancelled', 
        endTime: Date.now() 
      });
    }, 1000);
  };

  const addMultiple = () => {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const names = ['文件上传', '数据同步', '报表生成', '模型训练', '备份任务'];
        const descs = ['上传到云存储...', '与远程服务器同步...', '生成月度报表...', '训练分类模型...', '创建数据备份...'];
        const taskId = addTask({
          name: names[i % names.length],
          description: descs[i % descs.length],
        });
        progressMapRef.current[taskId] = 0;
      }, i * 300);
    }

    if (autoProgress) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = window.setInterval(() => {
        let allDone = true;
        for (const [id, prog] of Object.entries(progressMapRef.current)) {
          if (prog < 100) {
            allDone = false;
            const increment = Math.random() * 5 + 1;
            const newProg = Math.min(100, prog + increment);
            progressMapRef.current[id] = newProg;
            
            if (newProg >= 100) {
              updateTask(id, { 
                status: 'completed', 
                progress: 100, 
                endTime: Date.now() 
              });
            } else {
              updateTask(id, { progress: Math.round(newProg) });
            }
          }
        }
        if (allDone && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, 400);
    }
  };

  return (
    <Box sx={{ p: 4, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 700, color: gs.textPrimary }}>
        进程状态面板 - 视觉效果演示
      </Typography>
      <Typography variant="body2" sx={{ mb: 4, color: gs.textMuted }}>
        测试不同状态下的进程显示效果。右上角会显示悬浮面板。
      </Typography>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 2,
          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          border: `1px solid ${gs.border}`,
        }}
      >
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: gs.textPrimary }}>
          任务配置
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="任务名称"
            value={demoName}
            onChange={(e) => setDemoName(e.target.value)}
            size="small"
            fullWidth
            sx={{ flex: 1 }}
          />
          <TextField
            label="任务描述"
            value={demoDesc}
            onChange={(e) => setDemoDesc(e.target.value)}
            size="small"
            fullWidth
            sx={{ flex: 1 }}
          />
        </Stack>
        <FormControl size="small" sx={{ mb: 2, minWidth: 120 }}>
          <InputLabel>自动进度</InputLabel>
          <Select
            value={autoProgress ? 'auto' : 'manual'}
            label="自动进度"
            onChange={(e) => setAutoProgress(e.target.value === 'auto')}
          >
            <MenuItem value="auto">自动递增</MenuItem>
            <MenuItem value="manual">手动控制</MenuItem>
          </Select>
        </FormControl>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 2,
          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          border: `1px solid ${gs.border}`,
        }}
      >
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: gs.textPrimary }}>
          快速操作
        </Typography>
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            onClick={startNewTask}
            sx={{ bgcolor: '#3B82F6', '&:hover': { bgcolor: '#2563EB' } }}
          >
            开始新任务
          </Button>
          <Button
            variant="outlined"
            onClick={addPendingTask}
            sx={{ borderColor: '#6B7280', color: '#6B7280', '&:hover': { borderColor: '#4B5563', bgcolor: 'rgba(107,114,128,0.08)' } }}
          >
            添加待处理
          </Button>
          <Button
            variant="outlined"
            onClick={addFailedTask}
            sx={{ borderColor: '#EF4444', color: '#EF4444', '&:hover': { borderColor: '#DC2626', bgcolor: 'rgba(239,68,68,0.08)' } }}
          >
            模拟失败
          </Button>
          <Button
            variant="outlined"
            onClick={addCancelledTask}
            sx={{ borderColor: '#F59E0B', color: '#F59E0B', '&:hover': { borderColor: '#D97706', bgcolor: 'rgba(245,158,11,0.08)' } }}
          >
            模拟取消
          </Button>
          <Button
            variant="contained"
            onClick={addMultiple}
            sx={{ bgcolor: '#8B5CF6', '&:hover': { bgcolor: '#7C3AED' } }}
          >
            批量添加 5 个
          </Button>
          <Button
            variant="text"
            onClick={clearCompleted}
            sx={{ color: gs.textMuted }}
          >
            清除已完成
          </Button>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 2,
          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          border: `1px solid ${gs.border}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary }}>
            当前任务列表
          </Typography>
          <Chip
            label={`${tasks.length} 个任务`}
            size="small"
            sx={{ bgcolor: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}
          />
        </Box>
        {tasks.length === 0 ? (
          <Typography variant="body2" sx={{ color: gs.textMuted, textAlign: 'center', py: 4 }}>
            暂无任务，点击上方按钮添加测试任务
          </Typography>
        ) : (
          <Stack spacing={1}>
            {tasks.map(task => {
              const statusColors: Record<string, { color: string; bg: string; label: string }> = {
                pending: { color: '#6B7280', bg: 'rgba(107,114,128,0.1)', label: '待处理' },
                running: { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', label: '进行中' },
                completed: { color: '#22C55E', bg: 'rgba(34,197,94,0.1)', label: '已完成' },
                failed: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', label: '失败' },
                cancelled: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', label: '已取消' },
              };
              const sc = statusColors[task.status];

              return (
                <Box
                  key={task.id}
                  sx={{
                    p: 2,
                    borderRadius: 1.5,
                    bgcolor: sc.bg,
                    border: `1px solid ${sc.color}30`,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Chip
                      label={sc.label}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: 10,
                        bgcolor: 'transparent',
                        color: sc.color,
                        border: `1px solid ${sc.color}40`,
                        '& .MuiChip-label': { px: 0.75 },
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 500, color: gs.textPrimary, flex: 1 }}>
                      {task.name}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => removeTask(task.id)}
                      sx={{ fontSize: 10, color: gs.textMuted, minWidth: 'auto', p: 0.5 }}
                    >
                      移除
                    </Button>
                  </Box>
                  {task.description && (
                    <Typography variant="caption" sx={{ color: gs.textMuted, ml: 0.5 }}>
                      {task.description}
                    </Typography>
                  )}
                  {task.status === 'running' && task.progress !== undefined && (
                    <Box sx={{ mt: 1, ml: 0.5 }}>
                      <Box
                        sx={{
                          height: 4,
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
                      <Typography variant="caption" sx={{ color: gs.textMuted, mt: 0.25, display: 'block', textAlign: 'right' }}>
                        {task.progress}%
                      </Typography>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
      </Paper>
    </Box>
  );
};

export default ProcessStatusDemoPage;
