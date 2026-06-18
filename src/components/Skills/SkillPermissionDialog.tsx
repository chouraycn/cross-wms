/**
 * 技能权限确认对话框
 *
 * v2.0: 重写样式，对齐 ToolPermissionDialog / SystemAuthBanner 设计体系。
 * - 使用 getGrayScale 主题系统，支持暗色模式
 * - 顶部渐变条 + 风险等级颜色编码
 * - 结构化权限展示（替代原生 Alert + List）
 * - 自定义按钮样式，与全站风格统一
 */

import React, { useMemo } from 'react';
import {
  Dialog,
  Typography,
  Box,
  Button,
  IconButton,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ShieldIcon from '@mui/icons-material/Shield';
import LockIcon from '@mui/icons-material/Lock';
import { getGrayScale, getSemanticColors } from '../../constants/theme';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface PermissionItem {
  name: string;
  description?: string;
  level: 'danger' | 'warning' | 'info';
}

export interface SkillPermissionDialogProps {
  open: boolean;
  permissions: string[];
  skillName: string;
  onClose: () => void;
  onConfirm: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  file_write: '读写文件',
  file_read: '读取文件（只读）',
  network: '网络访问',
  execute_command: '执行命令',
  shell: 'Shell 访问',
  root: 'Root 权限',
  sudo: 'Sudo 权限',
  delete: '删除文件',
  install: '安装软件',
};

function getPermissionLevel(perm: string): 'danger' | 'warning' | 'info' {
  if (['execute_command', 'network', 'shell', 'root', 'sudo'].includes(perm)) return 'danger';
  if (['file_write', 'delete', 'install'].includes(perm)) return 'warning';
  return 'info';
}

/** 每个风险等级对应的视觉 Token */
const LEVEL_STYLES = {
  danger: {
    label: '危险权限',
    gradient: 'linear-gradient(90deg, #EF4444, #F87171)',
    border: 'rgba(239,68,68,0.2)',
  },
  warning: {
    label: '警告权限',
    gradient: 'linear-gradient(90deg, #F59E0B, #FBBF24)',
    border: 'rgba(245,158,11,0.2)',
  },
  info: {
    label: '信息权限',
    gradient: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
    border: 'rgba(59,130,246,0.2)',
  },
} as const;

/* ------------------------------------------------------------------ */
/*  Sub-component: PermissionGroup                                      */
/* ------------------------------------------------------------------ */

const PermissionGroup: React.FC<{
  items: PermissionItem[];
  level: 'danger' | 'warning' | 'info';
  isDark: boolean;
}> = ({ items, level, isDark }) => {
  if (items.length === 0) return null;

  const style = LEVEL_STYLES[level];
  const sem = getSemanticColors(isDark);
  const colors = level === 'danger' ? sem : level === 'warning' ? sem : sem;
  const levelColor = level === 'danger' ? sem.error : level === 'warning' ? sem.warning : sem.info;
  const levelBg = level === 'danger' ? sem.errorBg : level === 'warning' ? sem.warningBg : sem.infoBg;
  const levelBorder = level === 'danger' ? sem.errorBorder : level === 'warning' ? sem.warningBorder : sem.infoBorder;

  const LevelIcon = level === 'danger' ? ErrorOutlineIcon : level === 'warning' ? WarningAmberIcon : InfoOutlinedIcon;

  return (
    <Box sx={{ mb: 1.5 }}>
      {/* 分组标题 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
        <LevelIcon sx={{ fontSize: 14, color: levelColor }} />
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: levelColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {style.label} ({items.length})
        </Typography>
      </Box>

      {/* 权限条目 */}
      <Box
        sx={{
          borderRadius: 1,
          border: `1px solid ${levelBorder}`,
          overflow: 'hidden',
        }}
      >
        {items.map((item, idx) => (
          <Box
            key={item.name}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.75,
              bgcolor: levelBg,
              ...(idx > 0 ? { borderTop: `1px solid ${levelBorder}` } : {}),
            }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: levelColor,
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{
                fontSize: 12,
                fontFamily: 'monospace',
                color: isDark ? '#E5E7EB' : '#374151',
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              {item.name}
            </Typography>
            {item.description && (
              <Typography sx={{ fontSize: 11, color: isDark ? '#9CA3AF' : '#6B7280', flex: 1 }}>
                — {item.description}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */

const SkillPermissionDialog: React.FC<SkillPermissionDialogProps> = ({
  open,
  permissions,
  skillName,
  onClose,
  onConfirm,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const sem = getSemanticColors(isDark);

  const categorized = useMemo(() => {
    const danger: PermissionItem[] = [];
    const warning: PermissionItem[] = [];
    const info: PermissionItem[] = [];

    if (!permissions || permissions.length === 0) return { danger, warning, info };

    for (const perm of permissions) {
      const level = getPermissionLevel(perm);
      const item: PermissionItem = { name: perm, description: PERMISSION_DESCRIPTIONS[perm], level };
      if (level === 'danger') danger.push(item);
      else if (level === 'warning') warning.push(item);
      else info.push(item);
    }
    return { danger, warning, info };
  }, [permissions]);

  const hasDanger = categorized.danger.length > 0;
  const topGradient = hasDanger
    ? LEVEL_STYLES.danger.gradient
    : categorized.warning.length > 0
      ? LEVEL_STYLES.warning.gradient
      : LEVEL_STYLES.info.gradient;

  const accentColor = hasDanger ? sem.error : categorized.warning.length > 0 ? sem.warning : sem.info;
  const confirmBg = hasDanger ? '#EF4444' : categorized.warning.length > 0 ? '#F59E0B' : gs.textPrimary;
  const confirmHover = hasDanger ? '#DC2626' : categorized.warning.length > 0 ? '#D97706' : gs.textSecondary;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          borderRadius: 2,
          boxShadow: isDark
            ? '0 24px 64px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.06)'
            : '0 24px 64px rgba(0,0,0,0.18)',
          bgcolor: gs.bgPanel,
          border: `1px solid ${gs.border}`,
          width: 440,
          maxHeight: 'none',
          margin: 'auto',
          overflow: 'hidden',
          animation: 'skillPermIn 0.2s cubic-bezier(0.4,0,0.2,1)',
          '@keyframes skillPermIn': {
            from: { opacity: 0, transform: 'scale(0.96) translateY(8px)' },
            to: { opacity: 1, transform: 'scale(1) translateY(0)' },
          },
        },
      }}
    >
      {/* 顶部渐变条 */}
      <Box sx={{ height: 3, background: topGradient }} />

      {/* 关闭按钮 */}
      <IconButton
        size="small"
        onClick={onClose}
        sx={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          color: gs.textMuted,
          '&:hover': { color: gs.textPrimary, backgroundColor: gs.bgHover },
        }}
      >
        <CloseIcon sx={{ fontSize: 18 }} />
      </IconButton>

      <Box sx={{ px: 2.5, pt: 2, pb: 0 }}>
        {/* 头部 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: hasDanger ? sem.errorBg : categorized.warning.length > 0 ? sem.warningBg : sem.infoBg,
            }}
          >
            <LockIcon sx={{ fontSize: 16, color: accentColor }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: gs.textPrimary, lineHeight: 1.3 }}>
              权限确认
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                fontFamily: 'monospace',
                color: gs.textMuted,
                lineHeight: 1.3,
              }}
            >
              {skillName}
            </Typography>
          </Box>
          <ShieldIcon sx={{ fontSize: 14, color: gs.textDisabled, opacity: 0.5 }} />
        </Box>

        {/* 技能名称提示 */}
        <Typography sx={{ fontSize: 12, color: gs.textSecondary, mb: 1.5 }}>
          此技能请求以下权限{hasDanger ? '，包含高风险操作' : ''}：
        </Typography>

        {/* 权限分组 */}
        {!permissions || permissions.length === 0 ? (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1,
              bgcolor: sem.infoBg,
              border: `1px solid ${sem.infoBorder}`,
              mb: 1.5,
            }}
          >
            <Typography sx={{ fontSize: 12, color: sem.infoText }}>
              此技能未声明任何权限
            </Typography>
          </Box>
        ) : (
          <Box sx={{ mb: 1.5 }}>
            <PermissionGroup items={categorized.danger} level="danger" isDark={isDark} />
            <PermissionGroup items={categorized.warning} level="warning" isDark={isDark} />
            <PermissionGroup items={categorized.info} level="info" isDark={isDark} />

            {/* 高风险警告 */}
            {hasDanger && (
              <Box
                sx={{
                  p: 1,
                  borderRadius: 1,
                  bgcolor: sem.errorBg,
                  border: `1px solid ${sem.errorBorder}`,
                  mt: 1,
                }}
              >
                <Typography sx={{ fontSize: 11, color: sem.error, fontWeight: 500 }}>
                  此操作可能对系统产生不可逆的影响，请仔细确认后再安装。
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* 底部操作栏 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          py: 1.5,
          borderTop: `1px solid ${gs.border}`,
        }}
      >
        <Button
          onClick={onClose}
          variant="text"
          size="small"
          sx={{
            borderRadius: 1.5,
            textTransform: 'none',
            color: gs.textMuted,
            fontSize: 12,
            px: 1.5,
            '&:hover': { color: gs.textSecondary, bgcolor: 'rgba(0,0,0,0.04)' },
          }}
        >
          取消
        </Button>

        <Button
          onClick={onConfirm}
          variant="contained"
          size="small"
          startIcon={<ShieldIcon sx={{ fontSize: 14 }} />}
          sx={{
            borderRadius: 1.5,
            textTransform: 'none',
            bgcolor: confirmBg,
            color: '#fff',
            fontSize: 12,
            px: 2,
            '&:hover': { bgcolor: confirmHover },
          }}
        >
          我信任此技能
        </Button>
      </Box>
    </Dialog>
  );
};

export default SkillPermissionDialog;
