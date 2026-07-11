/**
 * GitManagerPage — Git 管理页面
 *
 * 三个 Tab：
 * - 状态：复用富面板 GitStatusPanel（含工作区变更、提交、历史、AI 生成提交信息）
 * - 差异：复用 CodeChangePreview 渲染后端 diff（行级高亮、搜索、按变更类型过滤）
 * - 分支：分支列表 + AI Code Review
 *
 * 仓库路径由顶部输入框提供（localStorage 持久化）。后端所有 Git 接口均以 `path` 参数接收。
 * 在状态 Tab 中点击某文件会通过 onFileSelect 联动跳转差异 Tab 并预筛选该文件。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  TextField,
  Button,
  Alert,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  useTheme,
} from '@mui/material';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import CompareIcon from '@mui/icons-material/Compare';
import FolderIcon from '@mui/icons-material/Folder';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import { getGrayScale } from '../constants/theme';
import GitStatusPanel from '../components/Git/GitStatusPanel';
import CodeChangePreview from '../components/Git/CodeChangePreview';
import {
  getGitBranches,
  getGitDiff,
  reviewCode,
  type RawBranches,
  type GitDiffView,
} from '../services/gitApi';

const REPO_PATH_KEY = 'git_repo_path';

const GitManagerPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [repoPath, setRepoPath] = useState<string>(() => {
    try {
      return localStorage.getItem(REPO_PATH_KEY) || '';
    } catch {
      return '';
    }
  });
  const [tabIndex, setTabIndex] = useState(0);
  const [statusKey, setStatusKey] = useState(0);

  const updateRepoPath = useCallback((value: string) => {
    setRepoPath(value);
    try {
      if (value) localStorage.setItem(REPO_PATH_KEY, value);
      else localStorage.removeItem(REPO_PATH_KEY);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  // 差异 Tab
  const [diff, setDiff] = useState<GitDiffView | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const loadDiff = useCallback(async () => {
    if (!repoPath) return;
    setDiffLoading(true);
    setDiffError(null);
    try {
      const data = await getGitDiff(repoPath);
      setDiff(data);
    } catch (e) {
      setDiffError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiffLoading(false);
    }
  }, [repoPath]);

  // 分支 Tab
  const [branches, setBranches] = useState<RawBranches | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [reviewSuggestions, setReviewSuggestions] = useState<string[] | null>(null);

  const loadBranches = useCallback(async () => {
    if (!repoPath) return;
    setBranchesLoading(true);
    setBranchesError(null);
    try {
      const data = await getGitBranches(repoPath);
      setBranches(data);
    } catch (e) {
      setBranchesError(e instanceof Error ? e.message : String(e));
    } finally {
      setBranchesLoading(false);
    }
  }, [repoPath]);

  const handleReview = useCallback(async () => {
    if (!repoPath) return;
    setBranchesError(null);
    try {
      const data = await reviewCode(repoPath);
      setReviewSuggestions(data.suggestions || []);
    } catch (e) {
      setBranchesError(e instanceof Error ? e.message : String(e));
    }
  }, [repoPath]);

  // Tab 切换时按需加载
  useEffect(() => {
    if (tabIndex === 1 && !diff && !diffLoading) loadDiff();
    if (tabIndex === 2 && !branches && !branchesLoading) loadBranches();
  }, [tabIndex, diff, diffLoading, loadDiff, branches, branchesLoading, loadBranches]);

  const handleFileSelect = useCallback((file: string) => {
    setSelectedFile(file);
    setTabIndex(1);
  }, []);

  const handleRefresh = useCallback(() => {
    if (tabIndex === 0) setStatusKey((k) => k + 1);
    else if (tabIndex === 1) {
      setDiff(null);
      loadDiff();
    } else {
      setBranches(null);
      loadBranches();
    }
  }, [tabIndex, loadDiff, loadBranches]);

  // ===================== 渲染：差异 Tab =====================

  const renderDiffTab = () => {
    const filteredDiffs =
      selectedFile && diff ? diff.diffs.filter((d) => d.file === selectedFile) : diff?.diffs ?? [];
    const filteredFiles =
      selectedFile && diff ? diff.files.filter((f) => f.file === selectedFile) : diff?.files ?? [];
    const stats = diff?.stats ?? { files: 0, insertions: 0, deletions: 0 };

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {selectedFile && (
          <Alert
            severity="info"
            onClose={() => setSelectedFile(null)}
            sx={{ borderRadius: 1.5 }}
          >
            已筛选文件：{selectedFile}（点击右侧 × 查看全部差异）
          </Alert>
        )}

        {diffLoading ? (
          <LinearProgress sx={{ borderRadius: 1 }} />
        ) : filteredFiles.length > 0 ? (
          <Box sx={{ height: '62vh' }}>
            <CodeChangePreview files={filteredFiles} diffs={filteredDiffs} stats={stats} />
          </Box>
        ) : (
          <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted, py: 4, textAlign: 'center' }}>
            {repoPath ? '当前工作区无差异' : '请先在顶部输入仓库路径'}
          </Typography>
        )}

        {diffError && (
          <Alert severity="error" sx={{ borderRadius: 1.5 }}>
            {diffError}
          </Alert>
        )}
      </Box>
    );
  };

  // ===================== 渲染：分支 Tab =====================

  const renderBranchesTab = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AutoAwesomeIcon />}
          onClick={handleReview}
          disabled={!repoPath}
        >
          AI Code Review
        </Button>
        {reviewSuggestions && (
          <Alert
            severity="info"
            sx={{ flex: 1, minWidth: 240 }}
            onClose={() => setReviewSuggestions(null)}
          >
            <Box component="div" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {reviewSuggestions.map((s, i) => (
                <Typography key={i} sx={{ fontSize: '0.8rem' }}>
                  • {s}
                </Typography>
              ))}
            </Box>
          </Alert>
        )}
      </Box>

      {branchesLoading ? (
        <LinearProgress sx={{ borderRadius: 1 }} />
      ) : branches && branches.local.length > 0 ? (
        <List>
          {branches.local.map((name, idx) => {
            const isCurrent = name === branches.current;
            return (
              <ListItem
                key={`${name}-${idx}`}
                sx={{
                  backgroundColor: isCurrent ? gs.bgActive : 'transparent',
                  border: `1px solid ${isCurrent ? gs.borderDarker : gs.border}`,
                  borderRadius: 1,
                  mb: 0.5,
                }}
                secondaryAction={
                  isCurrent ? (
                    <Chip label="当前" size="small" color="success" variant="outlined" />
                  ) : undefined
                }
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <FolderIcon sx={{ fontSize: 20, color: gs.textSecondary }} />
                </ListItemIcon>
                <ListItemText
                  primary={name}
                  primaryTypographyProps={{
                    fontWeight: isCurrent ? 700 : 500,
                    color: gs.textPrimary,
                  }}
                />
              </ListItem>
            );
          })}
        </List>
      ) : (
        <Typography sx={{ fontSize: '0.85rem', color: gs.textMuted, py: 4, textAlign: 'center' }}>
          {repoPath ? '无分支' : '请先在顶部输入仓库路径'}
        </Typography>
      )}

      {branchesError && (
        <Alert severity="error" sx={{ borderRadius: 1.5 }}>
          {branchesError}
        </Alert>
      )}
    </Box>
  );

  // ===================== 主界面 =====================

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: gs.textPrimary }}>
          Git 管理
        </Typography>
        <IconButton size="small" onClick={handleRefresh} disabled={!repoPath}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Box>

      <TextField
        fullWidth
        size="small"
        label="仓库路径"
        placeholder="/path/to/your/repo"
        value={repoPath}
        onChange={(e) => updateRepoPath(e.target.value)}
        sx={{ mb: 2, '& .MuiOutlinedInput-root': { backgroundColor: gs.bgInput } }}
      />
      {!repoPath && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 1.5 }}>
          请输入本地 Git 仓库路径以加载状态、差异与分支。后端所有 Git 接口均以 <code>path</code> 参数接收。
        </Alert>
      )}

      <Tabs
        value={tabIndex}
        onChange={(_, v) => setTabIndex(v)}
        sx={{ mb: 2, borderBottom: `1px solid ${gs.border}` }}
      >
        <Tab icon={<CallSplitIcon />} iconPosition="start" label="状态" />
        <Tab icon={<CompareIcon />} iconPosition="start" label="差异" />
        <Tab icon={<FolderIcon />} iconPosition="start" label="分支" />
      </Tabs>

      {tabIndex === 0 && (
        <GitStatusPanel key={statusKey} repoPath={repoPath} onFileSelect={handleFileSelect} />
      )}
      {tabIndex === 1 && renderDiffTab()}
      {tabIndex === 2 && renderBranchesTab()}
    </Box>
  );
};

export default GitManagerPage;
