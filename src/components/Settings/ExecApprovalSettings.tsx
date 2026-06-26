/**
 * 执行审批设置面板
 *
 * 提供可视化界面配置：
 * - 安全级别（deny / allowlist / full）
 * - 询问策略（off / on-miss / always）
 * - 白名单管理
 * - 审批历史
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  FormControl,
  FormLabel,
  RadioGroup,
  Radio,
  FormControlLabel,
  Switch,
  Button,
  TextField,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Divider,
  Alert,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import InfoIcon from '@mui/icons-material/Info';

import type { ExecSecurity, ExecAsk, ExecAllowlistEntry, RiskLevel } from '../../services/exec-approval';

// ===================== 类型 =====================

interface ExecApprovalSettingsProps {
  security: ExecSecurity;
  ask: ExecAsk;
  allowlist: ExecAllowlistEntry[];
  onSecurityChange: (security: ExecSecurity) => void;
  onAskChange: (ask: ExecAsk) => void;
  onAddAllowlist: (entry: Omit<ExecAllowlistEntry, 'id'>) => void;
  onRemoveAllowlist: (id: string) => void;
  onClearAllowlist: () => void;
}

// ===================== 样式配置 =====================

const securityOptions: { value: ExecSecurity; label: string; description: string; color: string }[] = [
  {
    value: 'deny',
    label: '完全拒绝',
    description: '阻止所有命令执行，适合高安全环境',
    color: '#EF4444',
  },
  {
    value: 'allowlist',
    label: '白名单模式',
    description: '仅允许匹配白名单的命令，更安全',
    color: '#3B82F6',
  },
  {
    value: 'full',
    label: '完全信任',
    description: '允许所有命令执行，⚠️ 存在安全风险',
    color: '#F59E0B',
  },
];

const askOptions: { value: ExecAsk; label: string; description: string }[] = [
  {
    value: 'off',
    label: '从不询问',
    description: '白名单匹配时直接执行，不询问',
  },
  {
    value: 'on-miss',
    label: '未匹配时询问',
    description: '白名单未命中时询问用户',
  },
  {
    value: 'always',
    label: '始终询问',
    description: '所有命令执行前都询问',
  },
];

const riskLevelColors: Record<RiskLevel, string> = {
  safe: '#16A34A',
  low: '#3B82F6',
  medium: '#EAB308',
  high: '#F97316',
  critical: '#EF4444',
};

// ===================== 组件 =====================

export const ExecApprovalSettings: React.FC<ExecApprovalSettingsProps> = ({
  security,
  ask,
  allowlist,
  onSecurityChange,
  onAskChange,
  onAddAllowlist,
  onRemoveAllowlist,
  onClearAllowlist,
}) => {
  const [newPattern, setNewPattern] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [pendingPattern, setPendingPattern] = useState('');

  // 添加白名单条目
  const handleAddEntry = useCallback(() => {
    if (!pendingPattern.trim()) return;

    onAddAllowlist({
      pattern: pendingPattern.trim(),
      source: 'user',
      commandText: pendingPattern.trim(),
      createdAt: Date.now(),
    });

    setPendingPattern('');
    setAddDialogOpen(false);
  }, [pendingPattern, onAddAllowlist]);

  // 删除确认
  const handleDelete = useCallback((id: string) => {
    onRemoveAllowlist(id);
  }, [onRemoveAllowlist]);

  return (
    <Paper sx={{ p: 3 }}>
      {/* 标题 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <SecurityIcon sx={{ color: '#F97316' }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          执行审批设置
        </Typography>
      </Box>

      {/* 安全级别 */}
      <FormControl component="fieldset" sx={{ mb: 4, width: '100%' }}>
        <FormLabel component="legend" sx={{ fontWeight: 600, mb: 2 }}>
          安全级别
        </FormLabel>

        <RadioGroup
          value={security}
          onChange={(e) => onSecurityChange(e.target.value as ExecSecurity)}
        >
          {securityOptions.map((option) => (
            <Paper
              key={option.value}
              sx={{
                p: 2,
                mb: 1,
                border: 2,
                borderColor: security === option.value ? option.color : 'transparent',
                bgcolor: security === option.value ? `${option.color}10` : 'transparent',
                transition: 'all 0.2s',
              }}
            >
              <FormControlLabel
                value={option.value}
                control={<Radio sx={{ color: option.color }} />}
                label={
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {option.label}
                      {option.value === 'full' && (
                        <Chip
                          size="small"
                          label="危险"
                          sx={{ ml: 1, bgcolor: '#EF4444', color: 'white', height: 20 }}
                        />
                      )}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {option.description}
                    </Typography>
                  </Box>
                }
                sx={{ width: '100%', m: 0 }}
              />
            </Paper>
          ))}
        </RadioGroup>
      </FormControl>

      <Divider sx={{ my: 3 }} />

      {/* 询问策略 */}
      <FormControl component="fieldset" sx={{ mb: 4, width: '100%' }}>
        <FormLabel component="legend" sx={{ fontWeight: 600, mb: 2 }}>
          询问策略
        </FormLabel>

        <RadioGroup
          value={ask}
          onChange={(e) => onAskChange(e.target.value as ExecAsk)}
        >
          {askOptions.map((option) => (
            <FormControlLabel
              key={option.value}
              value={option.value}
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="subtitle2">{option.label}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {option.description}
                  </Typography>
                </Box>
              }
            />
          ))}
        </RadioGroup>
      </FormControl>

      <Divider sx={{ my: 3 }} />

      {/* 白名单管理 */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              白名单
            </Typography>
            <Chip size="small" label={`${allowlist.length} 条`} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setAddDialogOpen(true)}
            >
              添加
            </Button>
            {allowlist.length > 0 && (
              <Button
                size="small"
                color="error"
                onClick={onClearAllowlist}
              >
                清除
              </Button>
            )}
          </Box>
        </Box>

        {allowlist.length === 0 ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            <InfoIcon sx={{ fontSize: 16, mr: 1, verticalAlign: 'middle' }} />
            白名单为空，所有自定义命令都将触发审批
          </Alert>
        ) : (
          <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
            {allowlist.map((entry) => (
              <ListItem
                key={entry.id || entry.pattern}
                sx={{
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  mb: 0.5,
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {entry.source === 'builtin' ? (
                    <VerifiedUserIcon sx={{ fontSize: 20, color: '#3B82F6' }} />
                  ) : entry.source === 'skill' ? (
                    <CheckCircleIcon sx={{ fontSize: 20, color: '#16A34A' }} />
                  ) : (
                    <BlockIcon sx={{ fontSize: 20, color: '#6B7280' }} />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {entry.pattern}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {entry.source === 'builtin' ? '内置安全命令' :
                       entry.source === 'skill' ? '技能允许' : '用户添加'}
                      {entry.lastUsedAt && ` · 上次使用: ${new Date(entry.lastUsedAt).toLocaleDateString()}`}
                    </Typography>
                  }
                />
                {entry.source === 'user' && (
                  <ListItemSecondaryAction>
                    <Tooltip title="删除">
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => handleDelete(entry.id!)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                )}
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      {/* 模式指示 */}
      <Alert
        severity={
          security === 'deny' ? 'error' :
          security === 'allowlist' ? 'info' : 'warning'
        }
        sx={{ mt: 2 }}
      >
        当前模式：
        {security === 'deny' && '完全拒绝 - 所有命令将被阻止'}
        {security === 'allowlist' && ask === 'off' && '白名单模式 - 仅允许白名单命令'}
        {security === 'allowlist' && ask === 'on-miss' && '白名单模式 + 未命中询问'}
        {security === 'allowlist' && ask === 'always' && '白名单模式 + 始终询问'}
        {security === 'full' && ask === 'off' && '完全信任 - 所有命令直接执行 ⚠️'}
        {security === 'full' && ask === 'always' && '完全信任 + 始终询问 ⚠️'}
      </Alert>

      {/* 添加对话框 */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>添加白名单条目</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="命令模式"
            placeholder="git, npm *, python3"
            value={pendingPattern}
            onChange={(e) => setPendingPattern(e.target.value)}
            helperText="支持通配符：* 匹配任意字符，? 匹配单个字符"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleAddEntry}
            disabled={!pendingPattern.trim()}
          >
            添加
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default ExecApprovalSettings;
