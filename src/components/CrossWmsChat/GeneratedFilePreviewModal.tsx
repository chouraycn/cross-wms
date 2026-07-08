import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Typography,
  Box,
  CircularProgress,
  Alert,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import FileOpenIcon from '@mui/icons-material/FileOpen';
import { getGrayScale } from '../../constants/theme';

interface GeneratedFilePreviewModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  downloadUrl: string;
  previewUrl?: string;
  sessionId?: string;
  isDark: boolean;
  onFileUpdated?: () => void;
}

type ViewMode = 'preview' | 'edit';

interface SyntaxToken {
  type: 'keyword' | 'string' | 'number' | 'comment' | 'function' | 'property' | 'normal';
  value: string;
}

function highlightSyntax(content: string, ext: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let remaining = content;

  const jsKeywords = [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
    'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'class', 'extends',
    'new', 'this', 'super', 'import', 'export', 'default', 'async', 'await', 'yield',
    'true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'in', 'of', 'from', 'as',
    'interface', 'type', 'enum', 'implements', 'private', 'public', 'protected', 'static',
    'abstract', 'readonly', 'any', 'void', 'never', 'unknown', 'boolean', 'number', 'string',
    'symbol', 'bigint', 'object', 'array', 'function', 'Promise', 'Map', 'Set', 'Array', 'Object',
  ];

  const cssKeywords = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'margin', 'padding', 'border',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'background',
    'color', 'font', 'text', 'align', 'justify', 'float', 'clear', 'overflow', 'z-index',
    'flex', 'grid', 'box-shadow', 'transition', 'transform', 'opacity', 'cursor', 'pointer-events',
    'content', 'before', 'after', 'hover', 'active', 'focus', 'first-child', 'last-child',
    'nth-child', 'not', 'and', 'or', 'only', 'all', 'screen', 'print', 'speech', 'portrait',
    'landscape', 'media', 'keyframes', 'from', 'to', 'animation', 'linear', 'ease', 'steps',
    'infinite', 'alternate', 'reverse', 'forwards', 'backwards', 'both', 'running', 'paused',
    'hidden', 'visible', 'collapse', 'initial', 'inherit', 'unset', 'revert', 'auto',
    'none', 'block', 'inline', 'inline-block', 'flex', 'grid', 'table', 'table-row', 'table-cell',
    'absolute', 'relative', 'fixed', 'sticky', 'static',
  ];

  if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
    const commentRegex = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
    const stringRegex = /(['"`])(?:(?!\1)[^\\]|\\.)*\1/g;
    const numberRegex = /\b\d+\.?\d*\b/g;
    const functionRegex = /\b([a-zA-Z_$][\w$]*)\s*\(/g;
    const propertyRegex = /\b([a-zA-Z_$][\w$]*)\s*:/g;

    let lastIndex = 0; // eslint-disable-line prefer-const

    const findNextToken = () => {
      const matches: Array<{ start: number; end: number; type: SyntaxToken['type']; value: string }> = [];

      let match;
      while ((match = commentRegex.exec(remaining)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length, type: 'comment', value: match[0] });
      }
      commentRegex.lastIndex = 0;

      while ((match = stringRegex.exec(remaining)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length, type: 'string', value: match[0] });
      }
      stringRegex.lastIndex = 0;

      while ((match = numberRegex.exec(remaining)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length, type: 'number', value: match[0] });
      }
      numberRegex.lastIndex = 0;

      while ((match = functionRegex.exec(remaining)) !== null) {
        matches.push({ start: match.index, end: match.index + match[1].length, type: 'function', value: match[1] });
      }
      functionRegex.lastIndex = 0;

      while ((match = propertyRegex.exec(remaining)) !== null) {
        matches.push({ start: match.index, end: match.index + match[1].length, type: 'property', value: match[1] });
      }
      propertyRegex.lastIndex = 0;

      for (const keyword of jsKeywords) {
        const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'g');
        while ((match = keywordRegex.exec(remaining)) !== null) {
          matches.push({ start: match.index, end: match.index + match[0].length, type: 'keyword', value: match[0] });
        }
        keywordRegex.lastIndex = 0;
      }

      if (matches.length === 0) return null;

      matches.sort((a, b) => a.start - b.start);

      for (let i = matches.length - 1; i > 0; i--) {
        for (let j = i - 1; j >= 0; j--) {
          if (matches[i].start < matches[j].end) {
            matches.splice(i, 1);
            break;
          }
        }
      }

      return matches[0];
    };

    let token;
    while ((token = findNextToken()) !== null) {
      if (token.start > 0) {
        tokens.push({ type: 'normal', value: remaining.slice(0, token.start) });
      }
      tokens.push({ type: token.type, value: token.value });
      remaining = remaining.slice(token.end);
    }

    if (remaining.length > 0) {
      tokens.push({ type: 'normal', value: remaining });
    }
  } else if (ext === 'css') {
    const commentRegex = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
    const stringRegex = /(['"`])(?:(?!\1)[^\\]|\\.)*\1/g;
    const numberRegex = /\b\d+\.?\d*%?\b/g;

    let lastIndex = 0; // eslint-disable-line prefer-const
    let match;

    while ((match = commentRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const segment = content.slice(lastIndex, match.index);
        const subTokens = segment.split(/(\b[\w-]+\s*:|\b[\w-]+\b)/g).filter(Boolean);
        for (const sub of subTokens) {
          if (sub.includes(':')) {
            const propName = sub.split(':')[0].trim();
            if (cssKeywords.includes(propName)) {
              tokens.push({ type: 'keyword', value: propName });
              tokens.push({ type: 'normal', value: sub.slice(propName.length) });
            } else {
              tokens.push({ type: 'property', value: sub });
            }
          } else if (cssKeywords.includes(sub) || sub === '{') {
            tokens.push({ type: 'keyword', value: sub });
          } else {
            tokens.push({ type: 'normal', value: sub });
          }
        }
      }
      tokens.push({ type: 'comment', value: match[0] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      const segment = content.slice(lastIndex);
      const subTokens = segment.split(/(\b[\w-]+\s*:|\b[\w-]+\b)/g).filter(Boolean);
      for (const sub of subTokens) {
        if (sub.includes(':')) {
          const propName = sub.split(':')[0].trim();
          if (cssKeywords.includes(propName)) {
            tokens.push({ type: 'keyword', value: propName });
            tokens.push({ type: 'normal', value: sub.slice(propName.length) });
          } else {
            tokens.push({ type: 'property', value: sub });
          }
        } else if (cssKeywords.includes(sub)) {
          tokens.push({ type: 'keyword', value: sub });
        } else {
          tokens.push({ type: 'normal', value: sub });
        }
      }
    }
  } else if (ext === 'json') {
    const stringRegex = /(["'])(?:(?!\1)[^\\]|\\.)*\1/g;
    const numberRegex = /\b\d+\.?\d*\b/g;
    const booleanRegex = /\b(true|false)\b/g;
    const nullRegex = /\bnull\b/g;
    const keyRegex = /(["'])([a-zA-Z_$][\w$]*)\1(?=\s*:)/g;

    let lastIndex = 0; // eslint-disable-line prefer-const
    let match;

    while ((match = keyRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: 'normal', value: content.slice(lastIndex, match.index) });
      }
      tokens.push({ type: 'property', value: match[0] });
      lastIndex = match.index + match[0].length;
    }

    content = content.slice(lastIndex);
    lastIndex = 0;

    const allMatches: Array<{ start: number; end: number; type: SyntaxToken['type']; value: string }> = [];

    while ((match = stringRegex.exec(content)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[0].length, type: 'string', value: match[0] });
    }
    stringRegex.lastIndex = 0;

    while ((match = numberRegex.exec(content)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[0].length, type: 'number', value: match[0] });
    }
    numberRegex.lastIndex = 0;

    while ((match = booleanRegex.exec(content)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[0].length, type: 'keyword', value: match[0] });
    }
    booleanRegex.lastIndex = 0;

    while ((match = nullRegex.exec(content)) !== null) {
      allMatches.push({ start: match.index, end: match.index + match[0].length, type: 'keyword', value: match[0] });
    }
    nullRegex.lastIndex = 0;

    allMatches.sort((a, b) => a.start - b.start);

    for (const m of allMatches) {
      if (m.start > lastIndex) {
        tokens.push({ type: 'normal', value: content.slice(lastIndex, m.start) });
      }
      tokens.push({ type: m.type, value: m.value });
      lastIndex = m.end;
    }

    if (lastIndex < content.length) {
      tokens.push({ type: 'normal', value: content.slice(lastIndex) });
    }
  } else if (ext === 'md') {
    const headingRegex = /^(#{1,6})\s.*$/gm;
    const boldRegex = /(\*\*|__)(.+?)\1/g;
    const italicRegex = /(\*|_)(.+?)\1/g;
    const codeRegex = /(`+)([^`]+)\1/g;
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

    let lastIndex = 0; // eslint-disable-line prefer-const
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: 'normal', value: content.slice(lastIndex, match.index) });
      }
      tokens.push({ type: 'keyword', value: match[1] });
      tokens.push({ type: 'function', value: match[0].slice(match[1].length) });
      lastIndex = match.index + match[0].length;
    }

    content = content.slice(lastIndex);
    lastIndex = 0;

    while ((match = boldRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: 'normal', value: content.slice(lastIndex, match.index) });
      }
      tokens.push({ type: 'function', value: match[0] });
      lastIndex = match.index + match[0].length;
    }

    content = content.slice(lastIndex);
    lastIndex = 0;

    while ((match = italicRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: 'normal', value: content.slice(lastIndex, match.index) });
      }
      tokens.push({ type: 'property', value: match[0] });
      lastIndex = match.index + match[0].length;
    }

    content = content.slice(lastIndex);
    lastIndex = 0;

    while ((match = codeRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: 'normal', value: content.slice(lastIndex, match.index) });
      }
      tokens.push({ type: 'string', value: match[0] });
      lastIndex = match.index + match[0].length;
    }

    content = content.slice(lastIndex);
    lastIndex = 0;

    while ((match = linkRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: 'normal', value: content.slice(lastIndex, match.index) });
      }
      tokens.push({ type: 'property', value: `[${match[1]}]` });
      tokens.push({ type: 'comment', value: `(${match[2]})` });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      tokens.push({ type: 'normal', value: content.slice(lastIndex) });
    }
  }

  if (tokens.length === 0) {
    tokens.push({ type: 'normal', value: content });
  }

  return tokens;
}

const GeneratedFilePreviewModal: React.FC<GeneratedFilePreviewModalProps> = React.memo(
  function GeneratedFilePreviewModal({ open, onClose, fileName, downloadUrl, previewUrl, sessionId, isDark, onFileUpdated }) {
    const gs = getGrayScale(isDark);
    const [loading, setLoading] = useState(false);
    const [content, setContent] = useState<string>('');
    const [editedContent, setEditedContent] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [isHtml, setIsHtml] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('preview');
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    const syntaxTokens = React.useMemo(() => {
      if (!content || isHtml) return [];
      return highlightSyntax(content, ext);
    }, [content, ext, isHtml]);

    useEffect(() => {
      if (!open) {
        setContent('');
        setEditedContent('');
        setError(null);
        setLoading(false);
        setViewMode('preview');
        setSaveSuccess(false);
        return;
      }

      const isHtmlFile = ['html', 'htm'].includes(ext);
      setIsHtml(isHtmlFile);

      if (isHtmlFile && previewUrl) {
        setContent('');
        setEditedContent('');
        setError(null);
        setLoading(false);
        return;
      }

      const textExtensions = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'csv', 'xml', 'yaml', 'yml', 'log', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'rb', 'php', 'sh', 'bash', 'zsh'];
      if (textExtensions.includes(ext) || previewUrl) {
        setLoading(true);
        setError(null);
        setContent('');
        setEditedContent('');

        const url = previewUrl || downloadUrl;
        fetch(url)
          .then((res) => {
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            return res.text();
          })
          .then((text) => {
            setContent(text);
            setEditedContent(text);
            setLoading(false);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : '加载文件内容失败');
            setLoading(false);
          });
      } else {
        setContent('');
        setEditedContent('');
        setError(null);
        setLoading(false);
      }
    }, [open, fileName, downloadUrl, previewUrl, ext]);

    const handleDownload = () => {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const handleCopyContent = async () => {
      if (!content) return;
      try {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // 复制失败，忽略
      }
    };

    const handleSave = async () => {
      if (!editedContent || editedContent === content || !sessionId) return;

      setSaving(true);
      setSaveSuccess(false);

      try {
        const response = await fetch('/api/file/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: `/generated-files/${sessionId}/${fileName}`,
            content: editedContent,
          }),
        });

        const result = await response.json();

        if (result.ok) {
          setContent(editedContent);
          setSaveSuccess(true);
          onFileUpdated?.();
          setTimeout(() => setSaveSuccess(false), 3000);
        } else {
          setError(result.error || '保存失败');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '保存失败');
      } finally {
        setSaving(false);
      }
    };

    const handleOpenInNewTab = () => {
      if (previewUrl) {
        window.open(previewUrl, '_blank', 'width=1024,height=768');
      }
    };

    const isEditable = !isHtml && content.length > 0;

    return (
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: gs.bgPanel,
            border: `1px solid ${gs.border}`,
            borderRadius: '12px',
            height: '85vh',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            px: 2.5,
            py: 1.75,
            borderBottom: `1px solid ${gs.border}`,
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)',
                color: '#6366F1',
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: gs.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {fileName}
              </Typography>
              <Typography sx={{ fontSize: 11, color: gs.textMuted }}>
                {ext.toUpperCase()} 文件
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {isEditable && (
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                size="small"
                sx={{
                  borderRadius: '8px',
                  bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  '& .MuiToggleButton-root': {
                    borderRadius: '6px',
                    textTransform: 'none',
                    fontSize: 12,
                    fontWeight: 500,
                    color: gs.textMuted,
                    '&.Mui-selected': {
                      color: '#6366F1',
                      bgcolor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)',
                    },
                  },
                }}
              >
                <ToggleButton value="preview" onClick={() => setViewMode('preview')}>
                  <FileOpenIcon sx={{ fontSize: 14, mr: 0.5 }} />
                  预览
                </ToggleButton>
                <ToggleButton value="edit" onClick={() => setViewMode('edit')}>
                  <EditIcon sx={{ fontSize: 14, mr: 0.5 }} />
                  编辑
                </ToggleButton>
              </ToggleButtonGroup>
            )}
            {content && (
              <IconButton
                size="small"
                onClick={handleCopyContent}
                sx={{ color: gs.textMuted, '&:hover': { color: '#6366F1' } }}
                title="复制内容"
              >
                {copied ? <CheckIcon sx={{ fontSize: 18, color: '#22C55E' }} /> : <ContentCopyIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            )}
            {isHtml && previewUrl && (
              <IconButton
                size="small"
                onClick={handleOpenInNewTab}
                sx={{ color: gs.textMuted, '&:hover': { color: '#6366F1' } }}
                title="在新窗口打开"
              >
                <FileOpenIcon sx={{ fontSize: 18 }} />
              </IconButton>
            )}
            <IconButton
              size="small"
              onClick={handleDownload}
              sx={{ color: gs.textMuted, '&:hover': { color: '#22C55E' } }}
              title="下载文件"
            >
              <DownloadIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={onClose}
              sx={{ color: gs.textMuted, '&:hover': { color: gs.textPrimary } }}
              title="关闭"
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent
          sx={{
            p: 0,
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {loading && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                gap: 1.5,
              }}
            >
              <CircularProgress size={24} sx={{ color: '#6366F1' }} />
              <Typography sx={{ fontSize: 13, color: gs.textMuted }}>加载文件内容...</Typography>
            </Box>
          )}

          {error && (
            <Box sx={{ p: 3 }}>
              <Alert severity="error" sx={{ bgcolor: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)' }}>
                {error}
              </Alert>
            </Box>
          )}

          {saveSuccess && (
            <Box sx={{ p: 2, borderBottom: `1px solid ${gs.border}` }}>
              <Alert severity="success" sx={{ bgcolor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.05)' }}>
                文件保存成功！
              </Alert>
            </Box>
          )}

          {!loading && !error && isHtml && previewUrl && (
            <Box sx={{ flex: 1, bgcolor: '#fff', position: 'relative' }}>
              <iframe
                src={previewUrl}
                title={fileName}
                style={{ width: '100%', height: '100%', border: 'none' }}
                sandbox="allow-same-origin allow-scripts"
              />
            </Box>
          )}

          {!loading && !error && !isHtml && content && viewMode === 'preview' && (
            <Box
              sx={{
                flex: 1,
                overflow: 'auto',
                p: 2,
                fontFamily: 'monospace',
                fontSize: 12.5,
                lineHeight: 1.6,
                color: gs.textPrimary,
                bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.01)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {syntaxTokens.length > 0 ? (
                syntaxTokens.map((token, idx) => (
                  <span
                    key={idx}
                    style={{
                      color:
                        token.type === 'keyword'
                          ? '#C678DD'
                          : token.type === 'string'
                          ? '#98C379'
                          : token.type === 'number'
                          ? '#D19A66'
                          : token.type === 'comment'
                          ? '#5C6370'
                          : token.type === 'function'
                          ? '#61AFEF'
                          : token.type === 'property'
                          ? '#E5C07B'
                          : undefined,
                      fontWeight: token.type === 'function' ? 600 : undefined,
                      fontStyle: token.type === 'property' ? 'italic' : undefined,
                    }}
                  >
                    {token.value}
                  </span>
                ))
              ) : (
                content.length > 50000
                  ? content.slice(0, 50000) + '\n\n... [文件过长，仅显示前 50000 字符，下载查看完整内容] ...'
                  : content
              )}
            </Box>
          )}

          {!loading && !error && !isHtml && content && viewMode === 'edit' && (
            <Box sx={{ flex: 1, overflow: 'hidden', p: 2 }}>
              <TextField
                fullWidth
                multiline
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                variant="outlined"
                sx={{
                  flex: 1,
                  height: '100%',
                  '& .MuiOutlinedInput-root': {
                    height: '100%',
                  },
                  '& textarea': {
                    fontFamily: 'monospace',
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    padding: '12px',
                  },
                }}
              />
            </Box>
          )}

          {!loading && !error && !isHtml && !content && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                gap: 1.5,
                p: 4,
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: isDark ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.06)',
                  color: '#6366F1',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </Box>
              <Typography sx={{ fontSize: 14, fontWeight: 500, color: gs.textPrimary }}>
                此文件类型不支持内容预览
              </Typography>
              <Typography sx={{ fontSize: 12, color: gs.textMuted, textAlign: 'center' }}>
                该文件为二进制格式或无法直接预览，请点击下方按钮下载查看
              </Typography>
              <Button
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
                sx={{
                  mt: 1,
                  bgcolor: '#6366F1',
                  '&:hover': { bgcolor: '#4F46E5' },
                  borderRadius: '8px',
                  textTransform: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                下载文件
              </Button>
            </Box>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            px: 2.5,
            py: 1.5,
            borderTop: `1px solid ${gs.border}`,
            flexShrink: 0,
            gap: 1,
          }}
        >
          <Button
            onClick={onClose}
            sx={{
              color: gs.textSecondary,
              textTransform: 'none',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: '8px',
            }}
          >
            关闭
          </Button>
          {viewMode === 'edit' && isEditable && (
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
              onClick={handleSave}
              disabled={saving || editedContent === content}
              sx={{
                bgcolor: '#6366F1',
                '&:hover': { bgcolor: '#4F46E5' },
                borderRadius: '8px',
                textTransform: 'none',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {saving ? '保存中...' : '保存修改'}
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleDownload}
            sx={{
              bgcolor: '#6366F1',
              '&:hover': { bgcolor: '#4F46E5' },
              borderRadius: '8px',
              textTransform: 'none',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            下载文件
          </Button>
        </DialogActions>
      </Dialog>
    );
  }
);

export default GeneratedFilePreviewModal;
