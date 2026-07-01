/**
 * Git 状态面板组件
 *
 * 功能：
 * - 当前分支显示
 * - 工作区状态（修改文件列表）
 * - 提交历史列表
 * - 快捷操作按钮（提交、推送、拉取）
 * - 提交信息输入框（带 AI 生成按钮）
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  IconButton,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  CircularProgress,
  Alert,
  useTheme,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PublishIcon from '@mui/icons-material/Publish';
import GetAppIcon from '@mui/icons-material/GetApp';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import EditIcon from '@mui/icons-material/Edit';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import CommitIcon from '@mui/icons-material/Source';
import { getGrayScale } from '../../constants/theme';

// ===================== 类型定义 =====================

interface GitStatus {
  branch: string;
  tracking?: string;
  staged: string[];
  modified: string[];
  untracked: string[];
  conflicts: string[];
  ahead: number;
  behind: number;
}

interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  files: number;
}

interface GitBranches {
  current: string;
  local: string[];
  remote?: string[];
}

interface GitStatusPanelProps {
  repoPath: string;
  onFileSelect?: (file: string) => void;
}

// ===================== Git 状态面板 =====================

const GitStatusPanel: React.FC<GitStatusPanelProps> = memo(({ repoPath, onFileSelect }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 状态管理
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranches | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  // 加载 Git 状态
  const loadGitStatus = useCallback(async () => {
    if (!repoPath) return;

    setLoading(true);
    setError(null);

    try {
      // 获取状态
      const statusResponse = await fetch(`/api/git/status?path=${encodeURIComponent(repoPath)}`);
      if (!statusResponse.ok) throw new Error('获取状态失败');
      const statusData = await statusResponse.json();
      setStatus(statusData);

      // 获取提交历史
      const logResponse = await fetch(`/api/git/log?path=${encodeURIComponent(repoPath)}&limit=10`);
      if (!logResponse.ok) throw new Error('获取日志失败');
      const logData = await logResponse.json();
      setCommits(logData.commits || []);

      // 获取分支列表
      const branchesResponse = await fetch(`/api/git/branches?path=${encodeURIComponent(repoPath)}&remote=true`);
      if (!branchesResponse.ok) throw new Error('获取分支失败');
      const branchesData = await branchesResponse.json();
      setBranches(branchesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  // AI 生成提交信息
  const generateCommitMessage = useCallback(async () => {
    if (!repoPath) return;

    try {
      const response = await fetch('/api/git/commit-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath }),
      });

      if (!response.ok) throw new Error('生成提交信息失败');

      const data = await response.json();
      setCommitMessage(data.message || '');
    } catch (err) {
      console.error('生成提交信息失败:', err);
    }
  }, [repoPath]);

  // 提交更改
  const handleCommit = useCallback(async () => {
    if (!repoPath || !commitMessage) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: repoPath,
          message: commitMessage,
          files: selectedFiles,
        }),
      });

      if (!response.ok) throw new Error('提交失败');

      const result = await response.json();
      if (result.success) {
        setCommitMessage('');
        setSelectedFiles([]);
        await loadGitStatus();
      } else {
        setError(result.message || '提交失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [repoPath, commitMessage, selectedFiles, loadGitStatus]);

  // 初始加载
  useEffect(() => {
    loadGitStatus();
  }, [loadGitStatus]);

  // 文件图标选择
  const getFileIcon = (file: string, statusType: string) => {
    switch (statusType) {
      case 'staged':
        return <CheckCircleIcon sx={{ fontSize: 18, color: '#2e7d32' }} />;
      case 'modified':
        return <EditIcon sx={{ fontSize: 18, color: '#ff9800' }} />;
      case 'untracked':
        return <AddIcon sx={{ fontSize: 18, color: '#2196f3' }} />;
      case 'conflicts':
        return <WarningIcon sx={{ fontSize: 18, color: '#c62828' }} />;
      default:
        return <DescriptionIcon sx={{ fontSize: 18, color: gs.textMuted }} />;
    }
  };

  // 统计信息
  const stats = useMemo(() => {
    if (!status) return null;

    return {
      staged: status.staged.length,
      modified: status.modified.length,
      untracked: status.untracked.length,
      conflicts: status.conflicts.length,
      total: status.staged.length + status.modified.length + status.untracked.length,
    };
  }, [status]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
      {/* 头部：分支信息 */}
      <Paper
        sx={{
          p: 2,
          backgroundColor: gs.bgPanel,
          border: `1px solid ${gs.border}`,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CallSplitIcon sx={{ fontSize: 20, color: gs.textPrimary }} />
            <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: gs.textPrimary }}>
              {status?.branch || '未初始化'}
            </Typography>
            {status?.tracking && (
              <Chip
                label={status.tracking}
                size="small"
                sx={{
                  backgroundColor: gs.bgHover,
                  fontSize: '0.75rem',
                  color: gs.textSecondary,
                }}
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="刷新">
              <IconButton size="small" onClick={loadGitStatus} disabled={loading}>
                {loading ? <CircularProgress size={18} /> : <RefreshIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* 统计信息 */}
        {stats && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {stats.staged > 0 && (
              <Chip
                label={`已暂存 ${stats.staged}`}
                size="small"
                icon={<CheckCircleIcon />}
                sx={{
                  backgroundColor: isDark ? '#2e7d32' : '#c8e6c9',
                  color: isDark ? '#fff' : '#2e7d32',
                  fontSize: '0.75rem',
                }}
              />
            )}
            {stats.modified > 0 && (
              <Chip
                label={`已修改 ${stats.modified}`}
                size="small"
                icon={<EditIcon />}
                sx={{
                  backgroundColor: isDark ? '#ff9800' : '#fff3e0',
                  color: isDark ? '#fff' : '#ff9800',
                  fontSize: '0.75rem',
                }}
              />
            )}
            {stats.untracked > 0 && (
              <Chip
                label={`未跟踪 ${stats.untracked}`}
                size="small"
                icon={<AddIcon />}
                sx={{
                  backgroundColor: isDark ? '#2196f3' : '#e3f2fd',
                  color: isDark ? '#fff' : '#2196f3',
                  fontSize: '0.75rem',
                }}
              />
            )}
            {stats.conflicts > 0 && (
              <Chip
                label={`冲突 ${stats.conflicts}`}
                size="small"
                icon={<WarningIcon />}
                sx={{
                  backgroundColor: isDark ? '#c62828' : '#ffcdd2',
                  color: isDark ? '#fff' : '#c62828',
                  fontSize: '0.75rem',
                }}
              />
            )}
            {status && status.ahead > 0 && (
              <Chip
                label={`领先 ${status.ahead}`}
                size="small"
                icon={<PublishIcon />}
                sx={{ fontSize: '0.75rem' }}
              />
            )}
            {status && status.behind > 0 && (
              <Chip
                label={`落后 ${status.behind}`}
                size="small"
                icon={<GetAppIcon />}
                sx={{ fontSize: '0.75rem' }}
              />
            )}
          </Box>
        )}
      </Paper>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ borderRadius: 1.5 }}>
          {error}
        </Alert>
      )}

      {/* 主内容区 */}
      <Box sx={{ display: 'flex', flex: 1, gap: 2, minHeight: 0 }}>
        {/* 左侧：文件列表 */}
        <Paper
          sx={{
            width: '300px',
            backgroundColor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            overflow: 'auto',
            flexShrink: 0,
          }}
        >
          <Box sx={{ p: 1 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
              工作区变更
            </Typography>

            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={20} />
              </Box>
            )}

            {!loading && status && (
              <>
                {/* 已暂存 */}
                {status.staged.length > 0 && (
                  <>
                    <Typography sx={{ fontSize: '0.75rem', color: '#2e7d32', fontWeight: 600, mb: 0.5 }}>
                      已暂存
                    </Typography>
                    {status.staged.map((file, index) => (
                      <ListItemButton
                        key={`staged-${index}`}
                        dense
                        selected={selectedFiles.includes(file)}
                        onClick={() => {
                          if (onFileSelect) onFileSelect(file);
                          setSelectedFiles(prev =>
                            prev.includes(file)
                              ? prev.filter(f => f !== file)
                              : [...prev, file]
                          );
                        }}
                        sx={{
                          borderRadius: 1,
                          fontSize: '0.75rem',
                          '&.Mui-selected': {
                            backgroundColor: gs.bgActive,
                          },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          {getFileIcon(file, 'staged')}
                        </ListItemIcon>
                        <ListItemText
                          primary={file}
                          sx={{
                            '& .MuiListItemText-primary': {
                              fontSize: '0.75rem',
                              fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                            },
                          }}
                        />
                      </ListItemButton>
                    ))}
                  </>
                )}

                {/* 已修改 */}
                {status.modified.length > 0 && (
                  <>
                    <Typography sx={{ fontSize: '0.75rem', color: '#ff9800', fontWeight: 600, mb: 0.5, mt: 1 }}>
                      已修改
                    </Typography>
                    {status.modified.map((file, index) => (
                      <ListItemButton
                        key={`modified-${index}`}
                        dense
                        selected={selectedFiles.includes(file)}
                        onClick={() => {
                          if (onFileSelect) onFileSelect(file);
                          setSelectedFiles(prev =>
                            prev.includes(file)
                              ? prev.filter(f => f !== file)
                              : [...prev, file]
                          );
                        }}
                        sx={{
                          borderRadius: 1,
                          fontSize: '0.75rem',
                          '&.Mui-selected': {
                            backgroundColor: gs.bgActive,
                          },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          {getFileIcon(file, 'modified')}
                        </ListItemIcon>
                        <ListItemText
                          primary={file}
                          sx={{
                            '& .MuiListItemText-primary': {
                              fontSize: '0.75rem',
                              fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                            },
                          }}
                        />
                      </ListItemButton>
                    ))}
                  </>
                )}

                {/* 未跟踪 */}
                {status.untracked.length > 0 && (
                  <>
                    <Typography sx={{ fontSize: '0.75rem', color: '#2196f3', fontWeight: 600, mb: 0.5, mt: 1 }}>
                      未跟踪
                    </Typography>
                    {status.untracked.map((file, index) => (
                      <ListItemButton
                        key={`untracked-${index}`}
                        dense
                        selected={selectedFiles.includes(file)}
                        onClick={() => {
                          if (onFileSelect) onFileSelect(file);
                          setSelectedFiles(prev =>
                            prev.includes(file)
                              ? prev.filter(f => f !== file)
                              : [...prev, file]
                          );
                        }}
                        sx={{
                          borderRadius: 1,
                          fontSize: '0.75rem',
                          '&.Mui-selected': {
                            backgroundColor: gs.bgActive,
                          },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          {getFileIcon(file, 'untracked')}
                        </ListItemIcon>
                        <ListItemText
                          primary={file}
                          sx={{
                            '& .MuiListItemText-primary': {
                              fontSize: '0.75rem',
                              fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                            },
                          }}
                        />
                      </ListItemButton>
                    ))}
                  </>
                )}

                {/* 无变更 */}
                {stats?.total === 0 && (
                  <Box sx={{ py: 4, textAlign: 'center', color: gs.textMuted }}>
                    <Typography sx={{ fontSize: '0.8rem' }}>工作区无变更</Typography>
                  </Box>
                )}
              </>
            )}
          </Box>
        </Paper>

        {/* 右侧：提交历史和提交区 */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {/* 提交区 */}
          <Paper
            sx={{
              p: 2,
              backgroundColor: gs.bgPanel,
              border: `1px solid ${gs.border}`,
            }}
          >
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
              提交更改
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                size="small"
                placeholder="输入提交信息..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                multiline
                rows={2}
                sx={{
                  flex: 1,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: gs.bgSidebar,
                  },
                }}
              />
              <Tooltip title="AI 生成提交信息">
                <IconButton
                  size="small"
                  onClick={generateCommitMessage}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  <AutoAwesomeIcon sx={{ fontSize: 18, color: '#ff9800' }} />
                </IconButton>
              </Tooltip>
            </Box>

            <Button
              variant="contained"
              size="small"
              onClick={handleCommit}
              disabled={loading || !commitMessage}
              sx={{
                backgroundColor: '#2e7d32',
                '&:hover': { backgroundColor: '#1b5e20' },
                fontSize: '0.8rem',
              }}
            >
              提交 ({selectedFiles.length || '全部'})
            </Button>
          </Paper>

          {/* 提交历史 */}
          <Paper
            sx={{
              flex: 1,
              backgroundColor: gs.bgPanel,
              border: `1px solid ${gs.border}`,
              overflow: 'auto',
              minWidth: 0,
            }}
          >
            <Box sx={{ p: 1 }}>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
                提交历史
              </Typography>

              {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={20} />
                </Box>
              )}

              {!loading && commits.length > 0 && (
                <List dense>
                  {commits.map((commit, index) => (
                    <ListItem
                      key={index}
                      sx={{
                        borderRadius: 1,
                        backgroundColor: gs.bgSidebar,
                        mb: 0.5,
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <CommitIcon sx={{ fontSize: 18, color: gs.textMuted }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={commit.message}
                        secondary={`${commit.author} · ${commit.date}`}
                        sx={{
                          '& .MuiListItemText-primary': {
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          },
                          '& .MuiListItemText-secondary': {
                            fontSize: '0.7rem',
                            color: gs.textMuted,
                          },
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: '0.7rem',
                          color: gs.textMuted,
                          fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                          ml: 1,
                        }}
                      >
                        {commit.hash.slice(0, 7)}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              )}

              {!loading && commits.length === 0 && (
                <Box sx={{ py: 4, textAlign: 'center', color: gs.textMuted }}>
                  <Typography sx={{ fontSize: '0.8rem' }}>无提交历史</Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
});

GitStatusPanel.displayName = 'GitStatusPanel';

export default GitStatusPanel;