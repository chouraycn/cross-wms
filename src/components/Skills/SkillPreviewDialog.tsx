/**
 * SkillPreviewDialog — 技能预览弹窗
 *
 * 根据图片设计：
 * - 顶部：图标 + 技能名 + 右上角关闭按钮
 * - 来源标签（user installed / builtin）
 * - 技能描述
 * - 蓝色信息提示条：「以下内容来自该技能的 SKILL.md 原文」
 * - SKILL.md 原始内容（Markdown 渲染）
 * - 右下角：黑色"使用"按钮
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  Button,
  CircularProgress,
  Alert,
  Chip,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { ICON_MAP } from '../../types/skill';
import type { Skill } from '../../types/skill';
import { getCategoryGradient, getCategoryLabel } from '../../constants/skillCategories';
import { getGrayScale } from '../../constants/theme';
import { MarkdownRenderer } from '../CrossWmsChat/MarkdownRenderer';
import { scanSkillMd, readSkillMd } from '../../services/api';

export interface SkillPreviewDialogProps {
  open: boolean;
  skill: Skill | null;
  onClose: () => void;
  /** 点击"使用"按钮后的回调（如跳转到 /chat?skill=xxx） */
  onUse: (skill: Skill) => void;
}

const SkillPreviewDialog: React.FC<SkillPreviewDialogProps> = ({
  open,
  skill,
  onClose,
  onUse,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const [skillMdContent, setSkillMdContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 解析 SKILL.md：剥离 frontmatter，保留正文
  const parsedBody = useMemo(() => {
    if (!skillMdContent) return '';
    const fmMatch = skillMdContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fmMatch) return fmMatch[2].trim();
    return skillMdContent.trim();
  }, [skillMdContent]);

  // 加载 SKILL.md 原文
  useEffect(() => {
    if (!open || !skill) {
      setSkillMdContent(null);
      setError(null);
      return;
    }

    // 内置技能：使用 promptTemplate 作为"原文"
    if (skill.source === 'builtin' || !skill.id) {
      const content = skill.promptTemplate || skill.detail || skill.desc || '';
      setSkillMdContent(content);
      return;
    }

    // 用户技能：尝试从 ~/.workbuddy/skills/ 目录读取 SKILL.md
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // 1) 先扫描所有 user skill
        const scanned = await scanSkillMd();
        const match = scanned.find((s) => s.name === skill.name || s.dirName === skill.id);
        if (!match) {
          if (!cancelled) {
            setSkillMdContent(skill.promptTemplate || skill.detail || skill.desc || '');
            setError(null);
          }
          return;
        }
        // 2) 读取完整内容
        const detail = await readSkillMd(match.dirName);
        if (!cancelled) {
          setSkillMdContent(detail.body || '');
        }
      } catch (e) {
        if (!cancelled) {
          // 失败时降级为 promptTemplate
          setSkillMdContent(skill.promptTemplate || skill.detail || skill.desc || '');
          setError(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, skill]);

  if (!skill) return null;

  const IconComponent: React.ComponentType<{ sx?: Record<string, unknown> }> =
    (ICON_MAP[skill.icon] as unknown as React.ComponentType<{ sx?: Record<string, unknown> }>) || AutoFixHighIcon;
  const sourceLabel = skill.source === 'user' ? 'user installed' : 'built-in';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '14px',
          boxShadow: '0 12px 48px rgba(0,0,0,0.12)',
          maxHeight: '90vh',
          bgcolor: gs.bgPanel,
          overflow: 'hidden',
        },
      }}
    >
      {/* 内容区：上下两段布局 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        {/* 顶部：图标 + 名称 + 关闭按钮 */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, px: 4, pt: 3.5, pb: 2 }}>
          {/* 图标卡片 */}
          <Box sx={{
            width: 48,
            height: 48,
            borderRadius: '10px',
            background: getCategoryGradient(skill.category),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: gs.bgPanel,
            '& .MuiSvgIcon-root': { fontSize: 24, color: gs.bgPanel },
          }}>
            <IconComponent />
          </Box>

          {/* 名称 + 来源 */}
          <Box sx={{ flex: 1, minWidth: 0, pt: 0.5 }}>
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: gs.textPrimary, mb: 0.5 }}>
              {skill.name}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
              {sourceLabel}
            </Typography>
          </Box>

          {/* 关闭按钮 */}
          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              color: gs.textMuted,
              '&:hover': { color: gs.textPrimary, bgcolor: gs.bgHover },
            }}
          >
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        {/* 技能描述 */}
        <Box sx={{ px: 4, pb: 2 }}>
          <Typography sx={{ fontSize: '0.875rem', color: gs.textSecondary, lineHeight: 1.6 }}>
            {skill.desc}
          </Typography>
          {skill.tags && skill.tags.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.25 }}>
              {skill.tags.slice(0, 5).map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 500,
                    bgcolor: gs.bgHover,
                    color: gs.textMuted,
                    borderRadius: '4px',
                  }}
                />
              ))}
            </Box>
          )}
        </Box>

        {/* 蓝色信息提示条 */}
        <Box sx={{ px: 4, pb: 1.5 }}>
          <Alert
            icon={<InfoOutlinedIcon sx={{ fontSize: 16, color: '#1E40AF' }} />}
            sx={{
              bgcolor: '#EFF6FF',
              color: '#1E40AF',
              border: 'none',
              borderRadius: '8px',
              py: 0.75,
              '& .MuiAlert-message': { fontSize: '0.8125rem', fontWeight: 500, py: 0 },
            }}
          >
            以下内容来自该技能的 SKILL.md 原文
          </Alert>
        </Box>

        {/* SKILL.md 原文区 */}
        <Box sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          mx: 4,
          mb: 1.5,
          border: `1px solid ${gs.border}`,
          borderRadius: '10px',
          bgcolor: gs.bgPanel,
        }}>
          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={20} />
            </Box>
          ) : !parsedBody ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted }}>
                暂无 SKILL.md 原文内容
              </Typography>
            </Box>
          ) : (
            <Box sx={{ p: 3, '& .markdown-body': { fontSize: '0.875rem', lineHeight: 1.7, color: gs.textPrimary } }}>
              <MarkdownRenderer content={parsedBody} />
            </Box>
          )}
        </Box>

        {/* 底部操作栏 */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 1,
          px: 4,
          py: 2.5,
          borderTop: `1px solid ${gs.border}`,
        }}>
          {skill.status === 'active' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 'auto' }}>
              <CheckCircleIcon sx={{ fontSize: 14, color: '#059669' }} />
              <Typography sx={{ fontSize: '0.75rem', color: '#059669', fontWeight: 500 }}>
                已启用
              </Typography>
            </Box>
          )}
          <Button
            variant="outlined"
            onClick={onClose}
            sx={{
              textTransform: 'none',
              borderRadius: '8px',
              borderColor: gs.border,
              color: gs.textSecondary,
              px: 2.5,
              '&:hover': { borderColor: gs.borderDarker, bgcolor: gs.bgHover },
            }}
          >
            关闭
          </Button>
          <Button
            variant="contained"
            onClick={() => onUse(skill)}
            sx={{
              textTransform: 'none',
              borderRadius: '8px',
              bgcolor: gs.textPrimary,
              color: gs.bgPanel,
              px: 3,
              fontWeight: 500,
              '&:hover': { bgcolor: gs.textSecondary },
            }}
          >
            使用
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default SkillPreviewDialog;
