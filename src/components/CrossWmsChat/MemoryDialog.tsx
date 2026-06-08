import React, { useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { useToast } from '../../contexts/ToastContext';

const MEMORY_API = 'http://localhost:3001/api/memory';

// ===================== Types =====================

export interface MemoryDialogHandle {
  open: () => void;
}

// ===================== Component =====================

const MemoryDialog = forwardRef<MemoryDialogHandle>((_props, ref) => {
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryContent, setMemoryContent] = useState('');
  const [memorySaving, setMemorySaving] = useState(false);
  const { showToast } = useToast();

  const handleOpen = useCallback(async () => {
    try {
      const res = await fetch(MEMORY_API);
      const data = await res.json();
      setMemoryContent(data.content || '');
    } catch {
      setMemoryContent('');
    }
    setMemoryOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    setMemorySaving(true);
    try {
      const res = await fetch(MEMORY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: memoryContent }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('记忆已保存', 'success');
        setMemoryOpen(false);
      } else {
        showToast('保存失败', 'error');
      }
    } catch {
      showToast('保存失败', 'error');
    }
    setMemorySaving(false);
  }, [memoryContent, showToast]);

  useImperativeHandle(ref, () => ({ open: handleOpen }), [handleOpen]);

  return (
    <>
      <Dialog
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, minHeight: 420 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
          <PsychologyIcon sx={{ fontSize: 20, color: '#7C3AED' }} />
          <Typography sx={{ fontWeight: 600, fontSize: '1rem' }}>记忆</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', ml: 0.5 }}>MEMORY.md</Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6B7280', mb: 1.5 }}>
            在此记录重要信息，AI 助手将在每次对话中自动读取这些记忆作为上下文。
          </Typography>
          <TextField
            multiline
            fullWidth
            minRows={10}
            maxRows={20}
            value={memoryContent}
            onChange={(e) => setMemoryContent(e.target.value)}
            placeholder="在此输入你想让 AI 助手记住的内容..."
            sx={{
              '& .MuiOutlinedInput-root': {
                fontSize: '0.875rem',
                lineHeight: 1.7,
                fontFamily: '"SF Mono", "Menlo", "Monaco", monospace',
                bgcolor: '#F9FAFB',
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMemoryOpen(false)} sx={{ color: '#6B7280' }}>
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={memorySaving}
            variant="contained"
            sx={{
              bgcolor: '#7C3AED',
              '&:hover': { bgcolor: '#6D28D9' },
              textTransform: 'none',
              borderRadius: 2,
              px: 3,
            }}
          >
            {memorySaving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
});

MemoryDialog.displayName = 'MemoryDialog';

export default MemoryDialog;
