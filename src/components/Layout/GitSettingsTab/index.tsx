/**
 * Git 设置 Tab
 *
 * 功能：
 * - 配置默认仓库路径
 * - 配置提交模板
 * - 配置分支策略
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Divider,
  Chip,
  useTheme,
  Alert,
  CircularProgress,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getGrayScale } from '../../../constants/theme';

// ===================== GitSettingsTab =====================

const GitSettingsTab: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 状态管理
  const [repoPath, setRepoPath] = useState('');
  const [commitTemplate, setCommitTemplate] = useState('');
  const [branchStrategy, setBranchStrategy] = useState<'main' | 'master' | 'custom'>('main');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 验证仓库路径
  const validateRepoPath = useCallback(async () => {
    if (!repoPath) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/git/status?path=${encodeURIComponent(repoPath)}`);
      if (!response.ok) {
        throw new Error('路径无效或不是 Git 仓库');
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 3 }}>
      {/* 标题 */}
      <Box>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary, mb: 0.5 }}>
          Git 配置
        </Typography>
        <Typography sx={{ fontSize: '0.8rem', color: gs.textSecondary }}>
          配置默认仓库路径、提交模板和分支策略
        </Typography>
      </Box>

      {/* 默认仓库路径 */}
      <Paper
        sx={{
          p: 2,
          backgroundColor: gs.bgPanel,
          border: `1px solid ${gs.border}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <FolderIcon sx={{ fontSize: 18, color: gs.textPrimary }} />
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
            默认仓库路径
          </Typography>
        </Box>

        <Typography sx={{ fontSize: '0.78rem', color: gs.textSecondary, mb: 2 }}>
          设置默认的 Git 仓库路径，用于 Git 操作的快捷访问
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="例如: /Users/user/project"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            sx={{
              flex: 1,
              '& .MuiOutlinedInput-root': {
                backgroundColor: gs.bgSidebar,
              },
            }}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={validateRepoPath}
            disabled={loading || !repoPath}
            sx={{ fontSize: '0.8rem' }}
          >
            {loading ? <CircularProgress size={18} /> : '验证'}
          </Button>
        </Box>

        {/* 状态提示 */}
        {success && (
          <Alert severity="success" sx={{ mt: 2, borderRadius: 1.5 }}>
            仓库路径验证成功
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2, borderRadius: 1.5 }}>
            {error}
          </Alert>
        )}
      </Paper>

      {/* 提交模板 */}
      <Paper
        sx={{
          p: 2,
          backgroundColor: gs.bgPanel,
          border: `1px solid ${gs.border}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <DescriptionIcon sx={{ fontSize: 18, color: gs.textPrimary }} />
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
            提交模板
          </Typography>
        </Box>

        <Typography sx={{ fontSize: '0.78rem', color: gs.textSecondary, mb: 2 }}>
          配置默认的提交信息模板，支持模板变量
        </Typography>

        <TextField
          size="small"
          multiline
          rows={4}
          placeholder="例如:
[类型] 描述

类型: feat | fix | refactor | docs | test
描述: 简要说明本次提交的内容
"
          value={commitTemplate}
          onChange={(e) => setCommitTemplate(e.target.value)}
          sx={{
            width: '100%',
            '& .MuiOutlinedInput-root': {
              backgroundColor: gs.bgSidebar,
            },
          }}
        />

        <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
            支持的模板变量:
          </Typography>
          <Chip label="{files}" size="small" sx={{ fontSize: '0.7rem' }} />
          <Chip label="{changes}" size="small" sx={{ fontSize: '0.7rem' }} />
          <Chip label="{author}" size="small" sx={{ fontSize: '0.7rem' }} />
        </Box>
      </Paper>

      {/* 分支策略 */}
      <Paper
        sx={{
          p: 2,
          backgroundColor: gs.bgPanel,
          border: `1px solid ${gs.border}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AccountTreeIcon sx={{ fontSize: 18, color: gs.textPrimary }} />
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
            分支策略
          </Typography>
        </Box>

        <Typography sx={{ fontSize: '0.78rem', color: gs.textSecondary, mb: 2 }}>
          配置默认的主分支名称和分支命名规范
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button
            variant={branchStrategy === 'main' ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setBranchStrategy('main')}
            sx={{ fontSize: '0.8rem' }}
          >
            main (推荐)
          </Button>
          <Button
            variant={branchStrategy === 'master' ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setBranchStrategy('master')}
            sx={{ fontSize: '0.8rem' }}
          >
            master
          </Button>
          <Button
            variant={branchStrategy === 'custom' ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setBranchStrategy('custom')}
            sx={{ fontSize: '0.8rem' }}
          >
            自定义
          </Button>
        </Box>

        {branchStrategy === 'custom' && (
          <TextField
            size="small"
            placeholder="自定义分支名"
            sx={{
              width: '200px',
              '& .MuiOutlinedInput-root': {
                backgroundColor: gs.bgSidebar,
              },
            }}
          />
        )}

        <Divider sx={{ my: 2, borderColor: gs.border }} />

        <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
          推荐的分支命名规范:
        </Typography>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
            • feature/xxx - 新功能开发
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
            • fix/xxx - Bug 修复
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
            • refactor/xxx - 代码重构
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
            • docs/xxx - 文档更新
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default GitSettingsTab;