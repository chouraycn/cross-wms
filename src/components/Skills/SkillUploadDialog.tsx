import React, { useState, useRef, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, IconButton, Tooltip,
  CircularProgress, Alert, useTheme,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getGrayScale } from '../../constants/theme';
import { useToast } from '../../contexts/ToastContext';
import { addSkill } from '../../stores/skillStore';
import { parseSkillMd, type ParsedSkillMd } from '../../utils/skillParser';
import { unzipSync } from 'fflate';

export interface SkillUploadDialogProps {
  open: boolean;
  onClose: () => void;
}

export const SkillUploadDialog: React.FC<SkillUploadDialogProps> = ({ open, onClose }) => {
  const { showToast } = useToast();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ParsedSkillMd | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setFile(null);
    setError('');
    setPreview(null);
    onClose();
  }, [onClose]);

  const handleFile = useCallback(async (f: File) => {
    setError('');
    setFile(f);
    setPreview(null);

    if (!f.name.endsWith('.zip')) {
      setError('请选择 .zip 格式的技能包');
      return;
    }

    setLoading(true);
    try {
      const buf = await f.arrayBuffer();
      const parsed = parseSkillZip(buf);
      if (parsed) {
        setPreview(parsed);
      } else {
        setError('技能包解析失败，请确保包内包含 SKILL.md 文件');
      }
    } catch (readErr) {
      setError('读取文件失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleSubmit = useCallback(async () => {
    if (!file || loading) return;
    if (!preview) {
      setError('请先选择有效的技能包');
      return;
    }

    setLoading(true);
    try {
      await addSkill({
        name: preview.name || file.name.replace(/\.zip$/i, ''),
        desc: preview.description || `从 ${file.name} 导入的技能包`,
        icon: preview.metadata?.emoji ? 'Emoji' : 'Extension',
        category: 'tool',
        path: '/chat',
        status: 'active',
        version: preview.version || '1.0',
        author: preview.author,
        executionMode: 'chat',
        promptTemplate: preview.body || undefined,
        detail: preview.description,
        tags: ['zip-import'],
        standardFields: {
          version: preview.version,
          author: preview.author,
        },
      });

      showToast(`技能「${preview.name || file.name}」安装成功`, 'success');
      handleClose();
    } catch (e) {
      showToast(`安装失败: ${e}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [file, loading, preview, showToast, handleClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          backgroundColor: gs.bgPanel,
        },
      }}
    >
      <DialogTitle sx={{
        px: 3, py: 2.5,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${gs.border}`,
      }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: gs.textPrimary }}>
          上传技能
        </Typography>
        <Tooltip title="关闭">
          <IconButton onClick={handleClose} sx={{
            width: 28,
            height: 28,
            borderRadius: '6px',
            '&:hover': { backgroundColor: gs.bgHover },
          }}>
            <CloseIcon sx={{ fontSize: 18, color: gs.textMuted }} />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2, fontSize: '0.75rem', borderRadius: '8px' }}>
            {error}
          </Alert>
        )}

        <Typography sx={{ fontSize: '0.8rem', color: gs.textMuted, mb: 2, lineHeight: 1.6 }}>
          上传 <code style={{ backgroundColor: gs.bgHover, padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'monospace' }}>.zip</code> 格式的技能包。
          包内需含 <code style={{ backgroundColor: gs.bgHover, padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'monospace' }}>SKILL.md</code> 描述文件。
        </Typography>

        <Box
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            border: `2px dashed ${dragging ? '#2563EB' : file ? '#10B981' : gs.borderDarker}`,
            borderRadius: '12px',
            backgroundColor: dragging ? '#EFF6FF' : file ? '#F0FDF4' : gs.bgHover,
            py: 3.5,
            px: 3,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': { borderColor: gs.textDisabled, backgroundColor: gs.bgHover },
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {loading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={24} sx={{ color: '#3b82f6' }} />
              <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>
                解析中...
              </Typography>
            </Box>
          ) : file ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircleIcon sx={{ fontSize: 26, color: '#10B981' }} />
              </Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: gs.textPrimary }}>{file.name}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                {(file.size / 1024).toFixed(1)} KB · <span style={{ color: '#2563EB', textDecoration: 'underline' }}>重新选择</span>
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: gs.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UploadFileIcon sx={{ fontSize: 24, color: gs.textMuted }} />
              </Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: gs.textSecondary }}>
                拖拽 .zip 文件到此处
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled }}>
                或点击选择文件（最大 3MB）
              </Typography>
            </Box>
          )}
        </Box>

        {preview && (
          <Box sx={{ mt: 2, p: 2, backgroundColor: '#F0FDF4', borderRadius: '10px', border: '1px solid #BBF7D0' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
              <CheckCircleIcon sx={{ fontSize: 15, color: '#10B981' }} />
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534' }}>技能包解析成功</Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, lineHeight: '24px' }}>名称</Typography>
              <Typography sx={{ fontSize: '0.8rem', color: gs.textPrimary, fontWeight: 600, lineHeight: '24px' }}>{preview.name || '（未指定）'}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, lineHeight: '20px' }}>描述</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary, lineHeight: '20px' }}>{preview.description || '（无描述）'}</Typography>
              {preview.version && (
                <>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, lineHeight: '20px' }}>版本</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary, lineHeight: '20px' }}>{preview.version}</Typography>
                </>
              )}
              {preview.author && (
                <>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, lineHeight: '20px' }}>作者</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary, lineHeight: '20px' }}>{preview.author}</Typography>
                </>
              )}
              {preview.metadata && preview.metadata.emoji && (
                <>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, lineHeight: '20px' }}>图标</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary, lineHeight: '20px' }}>{preview.metadata.emoji}</Typography>
                </>
              )}
              {preview.metadata && preview.metadata.homepage && (
                <>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, lineHeight: '20px' }}>主页</Typography>
                  <Typography sx={{ fontSize: '0.73rem', color: '#2563EB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '20px' }}>{preview.metadata.homepage}</Typography>
                </>
              )}
              {preview.metadata && preview.metadata.requires && (
                <>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, lineHeight: '20px' }}>依赖</Typography>
                  <Typography sx={{ fontSize: '0.73rem', color: gs.textSecondary, lineHeight: '20px' }}>
                    {preview.metadata.requires.bins?.length && `bins: ${preview.metadata.requires.bins.join(', ')}`}
                    {preview.metadata.requires.env?.length && ` env: ${preview.metadata.requires.env.join(', ')}`}
                  </Typography>
                </>
              )}
              {preview.body && (
                <>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, lineHeight: '20px' }}>AI 上下文</Typography>
                  <Typography sx={{ fontSize: '0.73rem', color: gs.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '20px' }}>
                    {preview.body.length > 60 ? `${preview.body.slice(0, 60)}...` : preview.body}
                  </Typography>
                </>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${gs.border}` }}>
        <Button
          onClick={handleClose}
          sx={{
            textTransform: 'none',
            fontSize: '0.8125rem',
            color: gs.textMuted,
            '&:hover': { backgroundColor: gs.bgHover },
          }}
        >
          取消
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          sx={{
            textTransform: 'none',
            fontSize: '0.8125rem',
            borderRadius: '8px',
            backgroundColor: '#2563EB',
            '&:hover': { backgroundColor: '#1D4ED8' },
          }}
          disabled={!file || loading || !preview}
        >
          {loading ? '安装中...' : '安装'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

function parseSkillZip(buf: ArrayBuffer): ParsedSkillMd | null {
  try {
    const entries = unzipSync(new Uint8Array(buf));

    let skillMdKey: string | null = null;
    for (const key of Object.keys(entries)) {
      const basename = key.split('/').pop() || '';
      if ((basename === 'SKILL.md' || basename === 'skill.md') && !key.startsWith('__MACOSX')) {
        skillMdKey = key;
        break;
      }
    }

    if (!skillMdKey) return null;

    const mdBytes = entries[skillMdKey];
    const mdText = new TextDecoder('utf-8').decode(mdBytes);
    return parseSkillMd(mdText);
  } catch {
    return null;
  }
}

export default SkillUploadDialog;
