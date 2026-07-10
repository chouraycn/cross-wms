/**
 * GitManagerPage — Git 管理页面
 *
 * 提供状态、历史、分支三个 Tab，支持提交、AI 生成提交信息等操作。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Tabs,
  Tab,
  Grid,
  Chip,
  Button,
  TextField,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  LinearProgress,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  useTheme,
} from '@mui/material';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import CommitIcon from '@mui/icons-material/Commit';
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import DescriptionIcon from '@mui/icons-material/Description';
import PublishIcon from '@mui/icons-material/Publish';
import DownIcon from '@mui/icons-material/GetApp';
import FolderIcon from '@mui/icons-material/Folder';

import { getGrayScale } from '../constants/theme';
import {
  getGitStatus,
  getGitLog,
  getGitBranches,
  commitGitChanges,
  generateCommitMessage,
  type GitStatus,
  type GitFileChange,
  type GitLogEntry,
  type GitBranch,
} from '../services/gitApi';

// ===================== 文件状态颜色映射 =====================

const STATUS_COLOR_MAP: Record<GitFileChange['status'], 'warning' | 'success' | 'error' | 'info'> = {
  modified: 'warning',
  added: 'success',
  deleted: 'error',
  renamed: 'info',
  copied: 'info',
};

const STATUS_LABEL_MAP: Record<GitFileChange['status'], string> = {
  modified: '修改',
  added: '新增',
  deleted: '删除',
  renamed: '重命名',
  copied: '复制',
};

const STATUS_ICON_MAP: Record<GitFileChange['status'], React.ReactElement> = {
  modified: <EditIcon sx={{ fontSize: 18 }} />,
  added: <AddIcon sx={{ fontSize: 18 }} />,
  deleted: <DeleteIcon sx={{ fontSize: 18 }} />,
  renamed: <DriveFileRenameOutlineIcon sx={{ fontSize: 18 }} />,
  copied: <FileCopyIcon sx={{ fontSize: 18 }} />,
};

// ===================== 主组件 =====================

const GitManagerPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [tabIndex, setTabIndex] = useState(0);

  // 状态 Tab
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [committing, setCommitting] = useState(false);

  // 历史 Tab
  const [logs, setLogs] = useState<GitLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // 分支 Tab
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  // ===================== 数据加载 =====================

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const data = await getGitStatus();
      setStatus(data);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const data = await getGitLog(undefined, 50);
      setLogs(data.logs || []);
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : String(e));
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const loadBranches = useCallback(async () => {
    setBranchesLoading(true);
    setBranchesError(null);
    try {
      const data = await getGitBranches();
      setBranches(data.branches || []);
    } catch (e) {
      setBranchesError(e instanceof Error ? e.message : String(e));
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  // 初次加载状态
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Tab 切换时按需加载数据
  useEffect(() => {
    if (tabIndex === 1 && logs.length === 0 && !logsLoading) {
      loadLogs();
    }
    if (tabIndex === 2 && branches.length === 0 && !branchesLoading) {
      loadBranches();
    }
  }, [tabIndex, logs.length, branches.length, logsLoading, branchesLoading, loadLogs, loadBranches]);

  // ===================== 操作 =====================

  const handleGenerateMessage = useCallback(async () => {
    setGenerating(true);
    try {
      const data = await generateCommitMessage();
      setCommitMessage(data.message || '');
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, []);

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return;
    setCommitting(true);
    setStatusError(null);
    try {
      await commitGitChanges(commitMessage.trim());
      setCommitMessage('');
      await loadStatus();
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }, [commitMessage, loadStatus]);

  const handleRefresh = useCallback(() => {
    if (tabIndex === 0) loadStatus();
    else if (tabIndex === 1) loadLogs();
    else if (tabIndex === 2) loadBranches();
  }, [tabIndex, loadStatus, loadLogs, loadBranches]);

  // ===================== 渲染：状态 Tab =====================

  const renderStatusTab = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 分支信息 */}
      <Card variant="outlined" sx={{ backgroundColor: gs.bgPanel, borderColor: gs.border }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CallSplitIcon sx={{ fontSize: 20, color: gs.textPrimary }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: gs.textPrimary }}>
                {status?.branch || '未知分支'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {status && status.ahead > 0 && (
                <Chip
                  icon={<PublishIcon sx={{ fontSize: 16 }} />}
                  label={`领先 ${status.ahead}`}
                  size="small"
                  color="success"
                  variant="outlined"
                />
              )}
              {status && status.behind > 0 && (
                <Chip
                  icon={<DownIcon sx={{ fontSize: 16 }} />}
                  label={`落后 ${status.behind}`}
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              )}
              {status && (
                <Chip
                  label={`共 ${status.totalChanges} 处变更`}
                  size="small"
                  sx={{ backgroundColor: gs.bgHover, color: gs.textSecondary }}
                />
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* 文件变更列表 */}
      <Grid container spacing={2}>
        {/* 已暂存 */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ backgroundColor: gs.bgPanel, borderColor: gs.border, height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary }}>
                  已暂存 ({status?.staged?.length || 0})
                </Typography>
              </Box>
              <Divider sx={{ mb: 1 }} />
              {status && status.staged.length > 0 ? (
                <List dense disablePadding>
                  {status.staged.map((file, idx) => (
                    <ListItem key={`staged-${idx}`} disableGutters sx={{ py: 0.25 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {STATUS_ICON_MAP[file.status]}
                      </ListItemIcon>
                      <ListItemText
                        primary={file.path}
                        secondary={
                          <Chip
                            label={STATUS_LABEL_MAP[file.status]}
                            size="small"
                            color={STATUS_COLOR_MAP[file.status]}
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.65rem' }}
                          />
                        }
                        primaryTypographyProps={{
                          sx: { fontSize: '0.8rem', fontFamily: 'monospace', color: gs.textPrimary },
                        }}
                        secondaryTypographyProps={{ sx: { mt: 0.25 } }}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography sx={{ fontSize: '0.8rem', color: gs.textMuted, py: 1 }}>
                  无已暂存文件
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 已修改 */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ backgroundColor: gs.bgPanel, borderColor: gs.border, height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <EditIcon sx={{ fontSize: 18, color: 'warning.main' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary }}>
                  已修改 ({status?.modified?.length || 0})
                </Typography>
              </Box>
              <Divider sx={{ mb: 1 }} />
              {status && status.modified.length > 0 ? (
                <List dense disablePadding>
                  {status.modified.map((file, idx) => (
                    <ListItem key={`modified-${idx}`} disableGutters sx={{ py: 0.25 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {STATUS_ICON_MAP[file.status]}
                      </ListItemIcon>
                      <ListItemText
                        primary={file.path}
                        secondary={
                          <Chip
                            label={STATUS_LABEL_MAP[file.status]}
                            size="small"
                            color={STATUS_COLOR_MAP[file.status]}
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.65rem' }}
                          />
                        }
                        primaryTypographyProps={{
                          sx: { fontSize: '0.8rem', fontFamily: 'monospace', color: gs.textPrimary },
                        }}
                        secondaryTypographyProps={{ sx: { mt: 0.25 } }}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography sx={{ fontSize: '0.8rem', color: gs.textMuted, py: 1 }}>
                  无已修改文件
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 未跟踪 */}
        <Grid item xs={12}>
          <Card variant="outlined" sx={{ backgroundColor: gs.bgPanel, borderColor: gs.border }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AddIcon sx={{ fontSize: 18, color: 'info.main' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary }}>
                  未跟踪 ({status?.untracked?.length || 0})
                </Typography>
              </Box>
              <Divider sx={{ mb: 1 }} />
              {status && status.untracked.length > 0 ? (
                <List dense disablePadding>
                  {status.untracked.map((file, idx) => (
                    <ListItem key={`untracked-${idx}`} disableGutters sx={{ py: 0.25 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <DescriptionIcon sx={{ fontSize: 18, color: gs.textMuted }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={file}
                        primaryTypographyProps={{
                          sx: { fontSize: '0.8rem', fontFamily: 'monospace', color: gs.textPrimary },
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography sx={{ fontSize: '0.8rem', color: gs.textMuted, py: 1 }}>
                  无未跟踪文件
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 提交区 */}
      <Card variant="outlined" sx={{ backgroundColor: gs.bgPanel, borderColor: gs.border }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <CommitIcon sx={{ fontSize: 18, color: gs.textPrimary }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary }}>
              提交更改
            </Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <TextField
            fullWidth
            multiline
            rows={3}
            size="small"
            placeholder="输入提交信息..."
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            sx={{
              mb: 2,
              '& .MuiOutlinedInput-root': {
                backgroundColor: gs.bgInput,
              },
            }}
          />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<CommitIcon />}
              onClick={handleCommit}
              disabled={committing || !commitMessage.trim()}
            >
              {committing ? '提交中...' : '提交'}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AutoAwesomeIcon />}
              onClick={handleGenerateMessage}
              disabled={generating}
            >
              {generating ? '生成中...' : 'AI 生成'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );

  // ===================== 渲染：历史 Tab =====================

  const renderHistoryTab = () => (
    <Card variant="outlined" sx={{ backgroundColor: gs.bgPanel, borderColor: gs.border }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <HistoryIcon sx={{ fontSize: 18, color: gs.textPrimary }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary }}>
            提交历史（最近 50 条）
          </Typography>
        </Box>
        <Divider sx={{ mb: 1 }} />
        {logsLoading ? (
          <LinearProgress />
        ) : logs.length === 0 ? (
          <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted, py: 3, textAlign: 'center' }}>
            无提交记录
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: gs.bgHover }}>
                  <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>哈希</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>作者</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>日期</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>提交信息</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((log, idx) => (
                  <TableRow key={`${log.hash}-${idx}`} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {log.hash.slice(0, 7)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{log.author}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                      {log.date}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: '0.8rem', color: gs.textPrimary }}>
                          {log.message}
                        </Typography>
                        {log.refs.map((ref) => (
                          <Chip
                            key={ref}
                            label={ref}
                            size="small"
                            sx={{ height: 18, fontSize: '0.65rem', backgroundColor: gs.bgActive }}
                          />
                        ))}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );

  // ===================== 渲染：分支 Tab =====================

  const renderBranchesTab = () => (
    <Card variant="outlined" sx={{ backgroundColor: gs.bgPanel, borderColor: gs.border }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <CallSplitIcon sx={{ fontSize: 18, color: gs.textPrimary }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: gs.textPrimary }}>
            分支列表 ({branches.length})
          </Typography>
        </Box>
        <Divider sx={{ mb: 1 }} />
        {branchesLoading ? (
          <LinearProgress />
        ) : branches.length === 0 ? (
          <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted, py: 3, textAlign: 'center' }}>
            无分支
          </Typography>
        ) : (
          <List>
            {branches.map((branch, idx) => (
              <ListItem
                key={`${branch.name}-${idx}`}
                sx={{
                  backgroundColor: branch.current ? gs.bgActive : 'transparent',
                  border: `1px solid ${branch.current ? gs.borderDarker : gs.border}`,
                  borderRadius: 1,
                  mb: 0.5,
                }}
                secondaryAction={
                  branch.current && (
                    <Chip
                      icon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                      label="当前"
                      size="small"
                      color="success"
                      variant="outlined"
                    />
                  )
                }
              >
                <ListItemIcon>
                  {branch.remote ? (
                    <CallSplitIcon sx={{ fontSize: 20, color: gs.textSecondary }} />
                  ) : (
                    <FolderIcon sx={{ fontSize: 20, color: gs.textSecondary }} />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography
                        component="span"
                        sx={{
                          fontWeight: branch.current ? 700 : 500,
                          fontSize: '0.9rem',
                          color: gs.textPrimary,
                        }}
                      >
                        {branch.name}
                      </Typography>
                      {branch.remote && (
                        <Chip
                          label={branch.remote}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Typography
                      component="span"
                      sx={{ fontSize: '0.75rem', color: gs.textMuted, fontFamily: 'monospace' }}
                    >
                      最近提交: {branch.lastCommit}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );

  // ===================== 渲染主界面 =====================

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: gs.textPrimary }}>
          Git 管理
        </Typography>
        <IconButton size="small" onClick={handleRefresh} disabled={statusLoading || logsLoading || branchesLoading}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      <Tabs
        value={tabIndex}
        onChange={(_, v) => setTabIndex(v)}
        sx={{ mb: 2, borderBottom: `1px solid ${gs.border}` }}
      >
        <Tab icon={<CallSplitIcon />} iconPosition="start" label="状态" />
        <Tab icon={<HistoryIcon />} iconPosition="start" label="历史" />
        <Tab icon={<FolderIcon />} iconPosition="start" label="分支" />
      </Tabs>

      {statusLoading && tabIndex === 0 && <LinearProgress sx={{ mb: 2 }} />}

      {tabIndex === 0 && statusError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {statusError}
        </Alert>
      )}
      {tabIndex === 1 && logsError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {logsError}
        </Alert>
      )}
      {tabIndex === 2 && branchesError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {branchesError}
        </Alert>
      )}

      {tabIndex === 0 && renderStatusTab()}
      {tabIndex === 1 && renderHistoryTab()}
      {tabIndex === 2 && renderBranchesTab()}
    </Box>
  );
};

export default GitManagerPage;
