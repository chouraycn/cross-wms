import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, Chip,
  CircularProgress, Alert, LinearProgress,
  useTheme, IconButton, Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getGrayScale } from '../../constants/theme';
import { useToast } from '../../contexts/ToastContext';
import { API_BASE } from '../../constants/api';

interface SkillCreateDialogProps {
  open: boolean;
  onClose: () => void;
  initialSkillName?: string;
  initialDescription?: string;
  onCreated?: (skillName: string) => void;
}

type CreateStep = 'config' | 'generating' | 'preview' | 'applying' | 'done';

export const SkillCreateDialog: React.FC<SkillCreateDialogProps> = ({
  open,
  onClose,
  initialSkillName = '',
  initialDescription = '',
  onCreated,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const { showToast } = useToast();

  const [skillName, setSkillName] = useState(initialSkillName);
  const [description, setDescription] = useState(initialDescription);
  const [step, setStep] = useState<CreateStep>('config');
  const [generatedContent, setGeneratedContent] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [autoApply, setAutoApply] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setSkillName(initialSkillName);
      setDescription(initialDescription);
      setStep('config');
      setGeneratedContent('');
      setProgress(0);
      setError('');
    }
  }, [open, initialSkillName, initialDescription]);

  const validateName = useCallback((name: string): boolean => {
    if (!name.trim()) return false;
    if (!/^[a-z][a-z0-9_-]*$/.test(name.trim())) {
      return false;
    }
    return true;
  }, []);

  const generateSkill = useCallback(async () => {
    if (!skillName.trim()) {
      setError('请输入技能名称');
      return;
    }
    if (!validateName(skillName)) {
      setError('技能名称只能包含小写字母、数字、下划线和连字符，且必须以字母开头');
      return;
    }
    if (!description.trim()) {
      setError('请输入技能描述');
      return;
    }

    setError('');
    setStep('generating');
    setProgress(10);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const templateContent = generateSkillTemplate(skillName.trim(), description.trim());
      setGeneratedContent(templateContent);
      setProgress(60);

      await new Promise((r) => setTimeout(r, 500));
      setProgress(80);

      await new Promise((r) => setTimeout(r, 300));
      setProgress(100);

      setStep('preview');
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || '生成失败');
      setStep('config');
    }
  }, [skillName, description, validateName]);

  const generateSkillTemplate = (name: string, desc: string): string => {
    const titleCase = name.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return `---
name: ${name}
description: "${desc}"
version: 0.1.0
triggers:
  - "keyword:${name}"
  - "keyword:${desc.slice(0, 10)}"
allowed-tools:
  - file_readFile
  - file_writeFile
  - file_execCommand
---

# ${titleCase}

${desc}

## 何时使用

当用户提到以下内容时使用本技能：
- ${desc}
- 与 ${name} 相关的操作

## 工作流程

1. 理解用户需求，确认操作目标
2. 收集必要的参数和上下文
3. 执行相应操作
4. 验证结果并向用户汇报

## 输出规范

- 简洁明了，突出关键信息
- 操作结果清晰可见
- 如有错误，提供排查建议

## 注意事项

- 执行重要操作前请确认用户意图
- 保留操作记录以便追溯
- 遵循安全最佳实践
`;
  };

  const applySkill = useCallback(async () => {
    setStep('applying');
    setProgress(0);

    try {
      setProgress(30);

      const response = await fetch(`${API_BASE}/skill-workshop/quick-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          skillName: skillName.trim(),
          description: description.trim(),
          content: generatedContent,
          autoApply: true,
        }),
      });

      setProgress(70);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '创建失败');
      }

      setProgress(100);
      setStep('done');

      showToast(`技能「${skillName}」创建成功`, 'success', 3000);

      onCreated?.(skillName.trim());
    } catch (err: any) {
      setError(err.message || '应用失败');
      setStep('preview');
    }
  }, [skillName, description, generatedContent, showToast, onCreated]);

  const handleClose = useCallback(() => {
    if (step === 'generating' || step === 'applying') {
      abortControllerRef.current?.abort();
    }
    onClose();
  }, [step, onClose]);

  const stepLabels: Record<CreateStep, string> = {
    config: '配置技能',
    generating: '生成中...',
    preview: '预览内容',
    applying: '安装中...',
    done: '创建完成',
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          backgroundColor: gs.bgPanel,
          border: `1px solid ${gs.border}`,
          maxHeight: '85vh',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AutoAwesomeIcon sx={{ color: '#F59E0B', fontSize: 28 }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                创建新技能
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {stepLabels[step]}
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {(step === 'generating' || step === 'applying') && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 4,
                borderRadius: 2,
                backgroundColor: gs.bgHover,
                '& .MuiLinearProgress-bar': {
                  backgroundColor: '#F59E0B',
                },
              }}
            />
          </Box>
        )}
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {step === 'config' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                技能名称
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value.toLowerCase())}
                placeholder="例如：my-custom-skill"
                helperText="小写字母、数字、下划线和连字符，以字母开头"
                error={skillName.length > 0 && !validateName(skillName)}
                InputProps={{
                  sx: {
                    backgroundColor: gs.bgInput,
                    borderRadius: '8px',
                  },
                }}
              />
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                技能描述
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                size="small"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述这个技能是做什么的..."
                InputProps={{
                  sx: {
                    backgroundColor: gs.bgInput,
                    borderRadius: '8px',
                  },
                }}
              />
            </Box>

            <Box
              sx={{
                p: 2,
                backgroundColor: gs.bgHover,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
              }}
            >
              <AutoAwesomeIcon sx={{ color: '#F59E0B', fontSize: 20, mt: 0.25 }} />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  AI 自动生成
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  系统将根据名称和描述自动生成 SKILL.md 模板，你可以在预览中编辑修改
                </Typography>
              </Box>
            </Box>
          </Box>
        )}

        {step === 'generating' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, gap: 2 }}>
            <CircularProgress size={48} sx={{ color: '#F59E0B' }} />
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              正在生成技能模板...
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              分析需求并生成 SKILL.md 内容
            </Typography>
          </Box>
        )}

        {step === 'preview' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={skillName}
                size="small"
                sx={{
                  backgroundColor: '#E0EBFF',
                  color: '#000',
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  height: 24,
                  borderRadius: '6px',
                }}
              />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {description}
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                SKILL.md 预览
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={12}
                value={generatedContent}
                onChange={(e) => setGeneratedContent(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    backgroundColor: isDark ? '#1a1a1a' : '#fafafa',
                  },
                }}
              />
            </Box>

            <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
              你可以编辑上面的内容，确认无误后点击「安装技能」
            </Alert>
          </Box>
        )}

        {step === 'applying' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, gap: 2 }}>
            <CircularProgress size={48} sx={{ color: '#10B981' }} />
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              正在安装技能...
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              写入文件并注册到技能系统
            </Typography>
          </Box>
        )}

        {step === 'done' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, gap: 2 }}>
            <CheckCircleIcon sx={{ color: '#10B981', fontSize: 56 }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              创建成功！
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
              技能「{skillName}」已安装完成，现在可以在对话中使用了
            </Typography>
            <Chip
              label={`/${skillName}`}
              sx={{
                backgroundColor: '#E0EBFF',
                color: '#000',
                fontWeight: 500,
                mt: 1,
              }}
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {step === 'config' && (
          <>
            <Button onClick={handleClose} color="inherit">
              取消
            </Button>
            <Button
              onClick={generateSkill}
              variant="contained"
              disabled={!skillName.trim() || !description.trim()}
              sx={{
                backgroundColor: '#F59E0B',
                '&:hover': { backgroundColor: '#D97706' },
                textTransform: 'none',
                fontWeight: 600,
              }}
            >
              生成技能
            </Button>
          </>
        )}

        {step === 'preview' && (
          <>
            <Button onClick={() => setStep('config')} color="inherit">
              返回修改
            </Button>
            <Button
              onClick={applySkill}
              variant="contained"
              disabled={!generatedContent.trim()}
              sx={{
                backgroundColor: '#10B981',
                '&:hover': { backgroundColor: '#059669' },
                textTransform: 'none',
                fontWeight: 600,
              }}
            >
              安装技能
            </Button>
          </>
        )}

        {step === 'done' && (
          <Button
            onClick={handleClose}
            variant="contained"
            sx={{
              backgroundColor: '#10B981',
              '&:hover': { backgroundColor: '#059669' },
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            完成
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
