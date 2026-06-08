/**
 * 技能权限确认对话框
 *
 * 弹出对话框，展示技能声明的权限，用户确认后才能安装。
 * 根据权限等级分类显示：危险（红色）、警告（橙色）、信息（蓝色）。
 *
 * @module SkillPermissionDialog
 */

import React, { useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Alert,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import ErrorIcon from '@mui/icons-material/Error';
import LockIcon from '@mui/icons-material/Lock';

/**
 * 权限项定义
 */
interface PermissionItem {
  /** 权限名称 */
  name: string;
  /** 权限描述 */
  description?: string;
  /** 权限等级：danger / warning / info */
  level: 'danger' | 'warning' | 'info';
}

/**
 * SkillPermissionDialog 组件属性
 */
interface SkillPermissionDialogProps {
  /** 对话框是否打开 */
  open: boolean;
  /** 权限名称列表 */
  permissions: string[];
  /** 技能名称 */
  skillName: string;
  /** 关闭对话框回调 */
  onClose: () => void;
  /** 确认安装回调 */
  onConfirm: () => void;
}

/**
 * 权限描述映射
 */
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

/**
 * 获取权限等级
 *
 * @param permission - 权限名称
 * @returns 权限等级
 */
function getPermissionLevel(permission: string): 'danger' | 'warning' | 'info' {
  const dangerous = ['execute_command', 'network', 'shell', 'root', 'sudo'];
  const warning = ['file_write', 'delete', 'install'];

  if (dangerous.includes(permission)) {
    return 'danger';
  }
  if (warning.includes(permission)) {
    return 'warning';
  }
  return 'info';
}

/**
 * 技能权限确认对话框
 *
 * @param props - 组件属性
 * @returns React 组件
 */
const SkillPermissionDialog: React.FC<SkillPermissionDialogProps> = ({
  open,
  permissions,
  skillName,
  onClose,
  onConfirm,
}) => {
  /**
   * 分类权限
   */
  const categorizedPermissions = useMemo(() => {
    const danger: PermissionItem[] = [];
    const warning: PermissionItem[] = [];
    const info: PermissionItem[] = [];

    if (!permissions || permissions.length === 0) {
      return { danger, warning, info };
    }

    for (const perm of permissions) {
      const level = getPermissionLevel(perm);
      const item: PermissionItem = {
        name: perm,
        description: PERMISSION_DESCRIPTIONS[perm],
        level,
      };

      switch (level) {
        case 'danger':
          danger.push(item);
          break;
        case 'warning':
          warning.push(item);
          break;
        case 'info':
          info.push(item);
          break;
      }
    }

    return { danger, warning, info };
  }, [permissions]);

  /**
   * 渲染权限列表
   */
  const renderPermissionList = (items: PermissionItem[], icon: React.ReactNode, color: 'error' | 'warning' | 'info') => {
    if (items.length === 0) {
      return null;
    }

    return (
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          {color === 'error' ? '危险权限' : color === 'warning' ? '警告权限' : '信息权限'} ({items.length})
        </Typography>
        <Alert
          severity={color}
          sx={{ mb: 1 }}
        >
          <List dense disablePadding>
            {items.map((item, index) => (
              <ListItem key={index} disablePadding sx={{ py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.name}
                  secondary={item.description}
                />
              </ListItem>
            ))}
          </List>
        </Alert>
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="permission-dialog-title"
    >
      <DialogTitle id="permission-dialog-title">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LockIcon color="primary" />
          <Typography variant="h6" component="span">
            权限确认
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" gutterBottom>
          技能 "{skillName}" 请求以下权限：
        </Typography>

        {(!permissions || permissions.length === 0) ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            此技能未声明任何权限
          </Alert>
        ) : (
          <Box sx={{ mt: 2 }}>
            {/* 危险权限 */}
            {renderPermissionList(categorizedPermissions.danger, <ErrorIcon />, 'error')}

            {/* 警告权限 */}
            {renderPermissionList(categorizedPermissions.warning, <WarningIcon />, 'warning')}

            {/* 信息权限 */}
            {renderPermissionList(categorizedPermissions.info, <InfoIcon />, 'info')}

            <Divider sx={{ my: 2 }} />

            <Alert severity="warning" sx={{ mt: 2 }}>
              请仔细审查。安装即表示你信任此技能。
            </Alert>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          取消
        </Button>
        <Button
          onClick={onConfirm}
          color="primary"
          variant="contained"
          startIcon={<LockIcon />}
        >
          我信任此技能
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SkillPermissionDialog;
