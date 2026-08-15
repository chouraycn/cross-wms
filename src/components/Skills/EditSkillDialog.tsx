import React, { useState } from 'react';
import {
  Box, Typography, Button, TextField,
  Select, MenuItem, FormControl, InputLabel, Alert,
  CircularProgress,
} from '@mui/material';
import EditNoteIcon from '@mui/icons-material/EditNote';
import ExtensionIcon from '@mui/icons-material/Extension';
import { updateSkill } from '../../stores/skillStore';
import { ICON_MAP, AVAILABLE_ICON_NAMES } from '../../types/skill';
import type { Skill } from '../../types/skill';
import SkillDialogShell, { PrimaryPill, SecondaryGhost } from './SkillDialogShell';

// ===================== 类型 =====================

export interface EditSkillDialogProps {
  open: boolean;
  onClose: () => void;
  skill: Skill;
  onSaved: () => void;
}

// ===================== 编辑技能对话框 =====================

const EditSkillDialog: React.FC<EditSkillDialogProps> = ({ open, onClose, skill, onSaved }) => {
  const [editForm, setEditForm] = useState({
    name: skill.name,
    desc: skill.desc,
    icon: skill.icon,
    category: skill.category,
    trigger: skill.trigger || '',
    path: skill.path,
    tags: (skill.tags || []).join(', '),
  });
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!editForm.name.trim()) {
      setEditError('请输入技能名称');
      return;
    }
    if (!editForm.desc.trim()) {
      setEditError('请输入技能描述');
      return;
    }
    if (!editForm.path.trim()) {
      setEditError('请输入路径');
      return;
    }
    setEditError('');
    setSaving(true);
    try {
      updateSkill(skill.id, {
        name: editForm.name.trim(),
        desc: editForm.desc.trim(),
        icon: editForm.icon,
        category: editForm.category,
        path: editForm.path.trim(),
        trigger: editForm.trigger.trim() || undefined,
        tags: editForm.tags.trim() ? editForm.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SkillDialogShell
      open={open}
      onClose={onClose}
      maxWidth="sm"
      icon={<EditNoteIcon sx={{ fontSize: 22 }} />}
      title="编辑技能"
      subtitle={<>修改技能基本信息、标签与唤起词（ID 不变）</>}
      actions={
        <>
          <Button {...SecondaryGhost} onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button
            {...PrimaryPill}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                <CircularProgress size={16} sx={{ color: '#FFFFFF' }} />
                保存中…
              </Box>
            ) : (
              '保存修改'
            )}
          </Button>
        </>
      }
    >
      {editError && (
        <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem', borderRadius: '8px' }}>
          {editError}
        </Alert>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="技能名称"
          size="small"
          required
          value={editForm.name}
          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          fullWidth
          sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
        />
        <TextField
          label="技能描述"
          size="small"
          required
          value={editForm.desc}
          onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })}
          fullWidth
          multiline
          minRows={2}
          sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
        />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>图标</InputLabel>
            <Select
              value={editForm.icon}
              label="图标"
              onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
            >
              {AVAILABLE_ICON_NAMES.map((name) => (
                <MenuItem key={name} value={name}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', color: '#6B7280' }}>
                      {ICON_MAP[name] || <ExtensionIcon sx={{ fontSize: 20 }} />}
                    </Box>
                    <Typography sx={{ fontSize: '0.8rem' }}>{name}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>分类</InputLabel>
            <Select
              value={editForm.category}
              label="分类"
              onChange={(e) => setEditForm({ ...editForm, category: e.target.value as 'core' | 'data' | 'auto' | 'tool' })}
            >
              <MenuItem value="core">核心功能</MenuItem>
              <MenuItem value="data">数据管理</MenuItem>
              <MenuItem value="auto">自动化</MenuItem>
              <MenuItem value="tool">工具</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="触发词"
            size="small"
            value={editForm.trigger}
            onChange={(e) => setEditForm({ ...editForm, trigger: e.target.value })}
            fullWidth
            placeholder="如: 同步数据 / 快捷指令"
            sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
          />
          <TextField
            label="路径"
            size="small"
            required
            value={editForm.path}
            onChange={(e) => setEditForm({ ...editForm, path: e.target.value })}
            fullWidth
            placeholder="/"
            sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
          />
        </Box>
        <TextField
          label="标签"
          size="small"
          value={editForm.tags}
          onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
          fullWidth
          placeholder="用逗号分隔，如: 同步,数据,报表"
          sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
        />
      </Box>
    </SkillDialogShell>
  );
};

export default EditSkillDialog;
