/**
 * AddServerDialog — 添加 MCP Server 对话框
 */

import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, FormControlLabel, Switch, Box, Typography,
} from '@mui/material';
import type { AddServerRequest } from './types';

interface AddServerDialogProps {
  open: boolean;
  onAdd: (req: AddServerRequest) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
}

const AddServerDialog: React.FC<AddServerDialogProps> = ({ open, onAdd, onClose }) => {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [envText, setEnvText] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    if (!name.trim() || !command.trim()) {
      setErrorMsg('名称和命令为必填项');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    // 解析 args：逗号分隔
    const parsedArgs = args.trim() ? args.trim().split(/\s+/) : [];

    // 解析 env：每行 KEY=VALUE
    const parsedEnv: Record<string, string> = {};
    if (envText.trim()) {
      for (const line of envText.trim().split('\n')) {
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
          parsedEnv[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
        }
      }
    }

    try {
      const result = await onAdd({
        name: name.trim(),
        command: command.trim(),
        args: parsedArgs,
        env: parsedEnv,
        enabled,
        transportType: 'stdio',
      });

      if (result.success) {
        // 重置并关闭
        setName('');
        setCommand('');
        setArgs('');
        setEnvText('');
        setEnabled(true);
        onClose();
      } else {
        setErrorMsg(result.error || '添加失败');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '0.95rem', fontWeight: 600 }}>添加 MCP Server</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="名称"
            value={name}
            onChange={e => setName(e.target.value)}
            size="small"
            fullWidth
            required
            placeholder="如: filesystem"
            sx={{ '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
          />
          <TextField
            label="命令"
            value={command}
            onChange={e => setCommand(e.target.value)}
            size="small"
            fullWidth
            required
            placeholder="如: npx @anthropic/mcp-server-filesystem"
            sx={{ '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
          />
          <TextField
            label="参数 (空格分隔)"
            value={args}
            onChange={e => setArgs(e.target.value)}
            size="small"
            fullWidth
            placeholder="如: /Users/me/Documents"
            sx={{ '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
          />
          <TextField
            label="环境变量 (每行 KEY=VALUE)"
            value={envText}
            onChange={e => setEnvText(e.target.value)}
            size="small"
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            placeholder="API_KEY=xxx\nBASE_URL=https://..."
            sx={{ '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
          />
          <FormControlLabel
            control={<Switch checked={enabled} onChange={e => setEnabled(e.target.checked)} size="small" />}
            label={<Typography sx={{ fontSize: '0.85rem' }}>启用后自动连接</Typography>}
          />
          {errorMsg && (
            <Typography sx={{ fontSize: '0.8rem', color: 'error.main' }}>{errorMsg}</Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} size="small" sx={{ fontSize: '0.8rem' }}>取消</Button>
        <Button onClick={handleSubmit} size="small" variant="contained" disabled={submitting} sx={{ fontSize: '0.8rem' }}>
          {submitting ? '添加中...' : '添加'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddServerDialog;
