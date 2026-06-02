import React, { useState } from 'react';
import {
  Box, Typography, Button, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExtensionIcon from '@mui/icons-material/Extension';
import { addSkill } from '../../stores/skillStore';

// ===================== 类型 =====================

export interface AddSkillDialogProps {
  open: boolean;
  onClose: () => void;
  onAdded: (name: string) => void;
}

// ===================== 添加技能对话框 =====================

const AddSkillDialog: React.FC<AddSkillDialogProps> = ({ open, onClose, onAdded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.zip')) {
      setError('请上传 .zip 格式的技能包');
      return;
    }
    setFile(f);
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleInstall = async () => {
    if (!file) { setError('请选择技能包文件'); return; }
    setLoading(true);
    setError('');

    try {
      // 读取 zip 内容，解析 skill.json
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      // 简单读取文件名（不依赖 jszip，纯文本匹配提取 skill.json）
      const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
      const jsonMatch = text.match(/\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"desc"\s*:\s*"([^"]+)"[\s\S]*?\}/);

      if (jsonMatch) {
        let skillData: Record<string, unknown> = {};
        try {
          const fullJsonMatch = text.match(/\{[^{}]*"name"[^{}]*"desc"[^{}]*\}/);
          if (fullJsonMatch) skillData = JSON.parse(fullJsonMatch[0]);
        } catch {
          skillData = { name: jsonMatch[1], desc: jsonMatch[2] };
        }
        const name = (skillData['name'] as string) || file.name.replace('.zip', '');
        const desc = (skillData['desc'] as string) || '从技能包导入';
        const icon = (skillData['icon'] as string) || 'Extension';
        const category = (skillData['category'] as 'core' | 'data' | 'auto' | 'tool') || 'tool';
        const trigger = skillData['trigger'] as string | undefined;
        const tags = skillData['tags'] as string[] | undefined;
        const path = (skillData['path'] as string) || '/';

        const newSkill = await addSkill({ name, desc, icon, category, path, trigger, tags, status: 'active', version: '1.0' });
        onAdded(newSkill.name);
        reset();
        onClose();
      } else {
        const name = file.name.replace('.zip', '');
        const newSkill = await addSkill({ name, desc: `从 ${file.name} 导入的技能包`, icon: 'Extension', category: 'tool', path: '/', status: 'active', version: '1.0' });
        onAdded(newSkill.name);
        reset();
        onClose();
      }
    } catch (err) {
      setError(`安装失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, color: '#111827', pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <ExtensionIcon sx={{ fontSize: 22, color: '#6B7280' }} />
        安装技能包
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Typography sx={{ fontSize: '0.8rem', color: '#6B7280', mb: 2 }}>
          上传 <code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>.zip</code> 格式的技能包文件。技能包应包含 <code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>skill.json</code> 描述文件。
        </Typography>

        {/* 拖拽上传区 */}
        <Box
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            border: `2px dashed ${dragging ? '#111827' : file ? '#10B981' : '#E5E7EB'}`,
            borderRadius: '12px',
            backgroundColor: dragging ? '#F9FAFB' : file ? '#F0FDF4' : '#FAFAFA',
            py: 4,
            px: 3,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': { borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' },
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {file ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircleIcon sx={{ fontSize: 28, color: '#10B981' }} />
              </Box>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827' }}>{file.name}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                {(file.size / 1024).toFixed(1)} KB · 点击重新选择
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AddIcon sx={{ fontSize: 28, color: '#9CA3AF' }} />
              </Box>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, color: '#374151' }}>
                拖拽技能包到此处
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                或点击选择 .zip 文件
              </Typography>
            </Box>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2, fontSize: '0.8rem' }}>
            {error}
          </Alert>
        )}

        {/* 技能包格式说明 */}
        <Box sx={{ mt: 2, p: 1.5, backgroundColor: '#F9FAFB', borderRadius: 2, border: '1px solid #E5E7EB' }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>技能包格式（skill.json）</Typography>
          <Box
            component="pre"
            sx={{ fontSize: '0.7rem', color: '#374151', backgroundColor: 'transparent', m: 0, fontFamily: 'monospace', lineHeight: 1.6 }}
          >{`{
  "name": "技能名称",
  "desc": "技能描述",
  "icon": "Extension",
  "category": "tool",
  "trigger": "触发词（可选）",
  "tags": ["标签1", "标签2"]
}`}</Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} sx={{ textTransform: 'none', color: '#6B7280' }}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleInstall}
          disabled={!file || loading}
          sx={{
            backgroundColor: '#111827',
            '&:hover': { backgroundColor: '#374151' },
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          {loading ? <CircularProgress size={16} sx={{ color: '#fff', mr: 1 }} /> : null}
          {loading ? '安装中...' : '安装技能'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddSkillDialog;
