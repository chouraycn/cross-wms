import React, { useState, useCallback, useEffect } from 'react';
import {
  Box, Typography, Switch, Button, TextField,
  List, ListItem, Chip,
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ReplayIcon from '@mui/icons-material/Replay';
import { skillHotReloader, SkillHotReloadEvent } from '../../utils/skillHotReloader';
import { getGrayScale } from '../../constants/theme';
import { useToast } from '../../contexts/ToastContext';

export interface SkillHotReloadPanelProps {
  gs: ReturnType<typeof getGrayScale>;
  isDark: boolean;
}

const SkillHotReloadPanel: React.FC<SkillHotReloadPanelProps> = ({ gs }) => {
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [watchPaths, setWatchPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState('');
  const [events, setEvents] = useState<SkillHotReloadEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const callback = (event: SkillHotReloadEvent) => {
      setEvents((prev) => [event, ...prev].slice(0, 20));
    };
    skillHotReloader.on(callback);
    return () => {
      skillHotReloader.off(callback);
    };
  }, []);

  const handleToggle = useCallback(async () => {
    if (enabled) {
      await skillHotReloader.stop();
      setEnabled(false);
      setIsRunning(false);
      showToast('Workspace 技能热重载已停止', 'info');
    } else {
      skillHotReloader['config'].watchPaths = watchPaths;
      skillHotReloader['config'].enabled = true;
      await skillHotReloader.start();
      setEnabled(true);
      setIsRunning(true);
      showToast('Workspace 技能热重载已启用', 'success');
    }
  }, [enabled, watchPaths, showToast]);

  const handleAddPath = useCallback(() => {
    if (!newPath.trim()) return;
    if (watchPaths.includes(newPath.trim())) return;
    setWatchPaths((prev) => [...prev, newPath.trim()]);
    setNewPath('');
  }, [newPath, watchPaths]);

  const handleRemovePath = useCallback((path: string) => {
    setWatchPaths((prev) => prev.filter((p) => p !== path));
  }, []);

  const handleReloadAll = useCallback(async () => {
    try {
      await skillHotReloader.reloadAll();
      showToast('已手动重载所有 workspace 技能', 'success');
    } catch {
      showToast('手动重载失败', 'error');
    }
  }, [showToast]);

  return (
    <Box>
      <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: gs.textPrimary, mb: 1 }}>
        Workspace 技能热重载
      </Typography>
      <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted, mb: 3 }}>
        开启后，系统会监听指定目录下的 SKILL.md 文件变化，自动完成解析、安全扫描并刷新技能。
      </Typography>

      <Box sx={{
        backgroundColor: gs.bgPanel,
        border: `1px solid ${gs.border}`,
        borderRadius: '12px',
        p: 2.5,
        mb: 3,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ReplayIcon sx={{ fontSize: 20, color: enabled ? '#059669' : gs.textMuted }} />
            <Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: gs.textPrimary }}>
                启用热重载
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                {enabled ? '正在监听 workspace 技能变化' : '已停止监听'}
              </Typography>
            </Box>
          </Box>
          <Switch
            checked={enabled}
            onChange={handleToggle}
            disabled={watchPaths.length === 0}
          />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: gs.textPrimary, mb: 1 }}>
            监听目录
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
            <TextField
              size="small"
              placeholder="输入 workspace 目录绝对路径"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddPath(); }}
              sx={{
                flex: 1,
                '& .MuiOutlinedInput-root': {
                  fontSize: '0.8125rem',
                  borderRadius: '8px',
                  backgroundColor: gs.bgHover,
                },
              }}
            />
            <Button
              variant="outlined"
              startIcon={<FolderOpenIcon sx={{ fontSize: 16 }} />}
              onClick={handleAddPath}
              sx={{
                textTransform: 'none',
                fontSize: '0.8125rem',
                borderRadius: '8px',
                borderColor: gs.border,
                color: gs.textSecondary,
              }}
            >
              添加
            </Button>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {watchPaths.length === 0 && (
              <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled }}>
                未添加监听目录
              </Typography>
            )}
            {watchPaths.map((path) => (
              <Chip
                key={path}
                label={path}
                size="small"
                onDelete={() => handleRemovePath(path)}
                sx={{
                  fontSize: '0.75rem',
                  bgcolor: gs.bgHover,
                  color: gs.textSecondary,
                }}
              />
            ))}
          </Box>
        </Box>

        <Button
          variant="outlined"
          startIcon={<ReplayIcon sx={{ fontSize: 14 }} />}
          onClick={handleReloadAll}
          disabled={!enabled || isRunning}
          sx={{
            textTransform: 'none',
            fontSize: '0.8125rem',
            borderRadius: '8px',
            borderColor: gs.border,
            color: gs.textSecondary,
          }}
        >
          立即重载
        </Button>
      </Box>

      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: gs.textPrimary, mb: 1.5 }}>
        最近事件
      </Typography>
      {events.length === 0 ? (
        <Typography sx={{ fontSize: '0.8125rem', color: gs.textDisabled }}>
          暂无热重载事件
        </Typography>
      ) : (
        <List sx={{ p: 0 }}>
          {events.map((event, index) => (
            <ListItem
              key={index}
              sx={{
                px: 2,
                py: 1,
                mb: 0.75,
                borderRadius: '8px',
                backgroundColor: gs.bgHover,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Typography sx={{ fontSize: '0.8125rem', color: gs.textPrimary }}>
                  {event.type === 'added' && '新增'}
                  {event.type === 'changed' && '变更'}
                  {event.type === 'removed' && '移除'}
                  {' '}
                  <strong>{event.skillId}</strong>
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mt: 0.25 }}>
                  {event.filePath}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
                {new Date(event.timestamp).toLocaleTimeString('zh-CN')}
              </Typography>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
};

export default SkillHotReloadPanel;
