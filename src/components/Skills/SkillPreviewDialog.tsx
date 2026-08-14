/**
 * SkillPreviewDialog — 技能预览弹窗
 *
 * 样式严格 100% 复刻参考图：
 *  - 顶部：白色圆角方形图标盒（40x40 / 浅灰描边）+ 技能 id + 右上角关闭 ✕
 *  - 来源标签（user installed / 内置）
 *  - 技能描述（中文，字号较大）
 *  - 蓝色信息提示条：ⓘ 图标 + "以下内容来自该技能的 SKILL.md 原文"
 *  - 内嵌白色大圆角卡片，内部渲染 SKILL.md Markdown 原文
 *  - 右下角：纯黑色胶囊按钮（圆角 9999），白字"使用"
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  Button,
  CircularProgress,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import { ICON_MAP } from '../../types/skill';
import type { Skill } from '../../types/skill';
import { getGrayScale } from '../../constants/theme';
import { MarkdownRenderer } from '../CrossWmsChat/MarkdownRenderer';
import { scanSkillMd, readSkillMd } from '../../services/api';

export interface SkillPreviewDialogProps {
  open: boolean;
  skill: Skill | null;
  onClose: () => void;
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

  // 解析 SKILL.md：剥离 frontmatter，保留正文
  const parsedBody = useMemo(() => {
    if (!skillMdContent) return '';
    const fmMatch = skillMdContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fmMatch) return fmMatch[2].trim();
    return skillMdContent.trim();
  }, [skillMdContent]);

  const loadContent = useCallback(async (targetSkill: Skill) => {
    // 内置/非文件技能：直接使用 promptTemplate / detail / desc
    if (targetSkill.source === 'builtin' || !targetSkill.id) {
      const content = targetSkill.promptTemplate || targetSkill.detail || targetSkill.desc || '';
      setSkillMdContent(content);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const scanned = await scanSkillMd();
      const match = scanned.find((s) => s.name === targetSkill.name || s.dirName === targetSkill.id);
      if (!match) {
        const content = targetSkill.promptTemplate || targetSkill.detail || targetSkill.desc || '';
        setSkillMdContent(content);
        return;
      }
      const detail = await readSkillMd(match.dirName);
      setSkillMdContent(detail.body || '');
    } catch {
      const content = targetSkill.promptTemplate || targetSkill.detail || targetSkill.desc || '';
      setSkillMdContent(content);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !skill) {
      setSkillMdContent(null);
      return;
    }
    loadContent(skill);
  }, [open, skill, loadContent]);

  if (!skill) return null;

  const iconNode = ICON_MAP[skill.icon] || <AutoFixHighIcon sx={{ fontSize: 22 }} />;
  const sourceLabel = skill.source === 'user' ? 'user installed' : '内置';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          boxShadow: '0 12px 48px rgba(0,0,0,0.12)',
          maxHeight: '90vh',
          bgcolor: '#F7F7F8',
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        {/* ============ 顶部：图标 + 技能 id + 关闭按钮 ============ */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3, pt: 2.5, pb: 2 }}>
          <Box sx={{
            width: 40,
            height: 40,
            borderRadius: '10px',
            bgcolor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#111827',
            boxShadow: '0 1px 2px rgba(17,24,39,0.04)',
          }}>
            {iconNode}
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
            <Typography sx={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#111827',
              fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
              letterSpacing: '-0.01em',
            }}>
              {skill.id}
            </Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: '#6B7280', mt: 0.25 }}>
              {sourceLabel}
            </Typography>
          </Box>

          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              color: '#6B7280',
              '&:hover': { color: '#111827', bgcolor: 'rgba(17,24,39,0.05)' },
            }}
          >
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        {/* ============ 技能描述 ============ */}
        <Box sx={{ px: 3, pb: 2 }}>
          <Typography sx={{
            fontSize: '1rem',
            lineHeight: 1.55,
            color: '#4B5563',
          }}>
            {skill.desc || '暂无描述'}
          </Typography>
        </Box>

        {/* ============ 对话唤起关键词提示 ============ */}
        {(() => {
          // trigger 字段可能含多个关键词（以 / 分隔），拆分后逐个展示
          const triggers = (skill.trigger || '')
            .split('/')
            .map(t => t.trim())
            .filter(Boolean);
          if (triggers.length === 0) return null;
          return (
            <Box sx={{ px: 3, pb: 2 }}>
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                flexWrap: 'wrap',
                px: 2,
                py: 1.25,
                bgcolor: '#FEF3C7',
                borderRadius: '10px',
                border: '1px solid #FDE68A',
              }}>
              <KeyboardIcon sx={{ fontSize: 18, color: '#92400E', flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.875rem', color: '#92400E', fontWeight: 500, flexShrink: 0 }}>
                在 AI 对话中输入以下关键词唤起：
              </Typography>
              {triggers.map((kw) => (
                <Box
                  key={kw}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    px: 1.25,
                    py: 0.25,
                    bgcolor: '#FFFFFF',
                    border: '1px solid #FCD34D',
                    borderRadius: '6px',
                  }}
                >
                  <Typography component="span" sx={{
                    fontSize: '0.875rem',
                    color: '#92400E',
                    fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
                    fontWeight: 600,
                  }}>
                    {`/${kw}`}
                  </Typography>
                </Box>
              ))}
              </Box>
            </Box>
          );
        })()}

        {/* ============ 蓝色信息提示条 ============ */}
        <Box sx={{ px: 3, pb: 1.5 }}>
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.25,
            bgcolor: '#EAF4FF',
            borderRadius: '10px',
          }}>
            <InfoOutlinedIcon sx={{ fontSize: 18, color: '#1E40AF', flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.9375rem', color: '#1E40AF', lineHeight: 1.2 }}>
              以下内容来自该技能的 SKILL.md 原文
            </Typography>
          </Box>
        </Box>

        {/* ============ SKILL.md 原文区（内嵌白卡）============ */}
        <Box sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          mx: 3,
          mb: 1.5,
          borderRadius: '12px',
          bgcolor: '#FFFFFF',
          border: '1px solid #E5E7EB',
        }}>
          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={20} sx={{ color: '#9CA3AF' }} />
            </Box>
          ) : !parsedBody ? (
            <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
              <Typography sx={{ fontSize: '0.95rem', color: '#9CA3AF' }}>
                暂无 SKILL.md 原文内容
              </Typography>
            </Box>
          ) : (
            <Box sx={{
              px: 3.5,
              py: 3,
              '& .markdown-body': {
                fontSize: '1rem',
                lineHeight: 1.7,
                color: '#111827',
              },
              '& .markdown-body h1': {
                fontSize: '1.875rem',
                fontWeight: 700,
                lineHeight: 1.3,
                mt: 0,
                mb: 2,
                color: '#111827',
                border: 'none',
                pb: 0,
              },
              '& .markdown-body h2': {
                fontSize: '1.5rem',
                fontWeight: 700,
                lineHeight: 1.3,
                mt: 3,
                mb: 1.25,
                color: '#111827',
                border: 'none',
                pb: 0,
              },
              '& .markdown-body h3': {
                fontSize: '1.1875rem',
                fontWeight: 600,
                lineHeight: 1.35,
                mt: 2.25,
                mb: 1,
                color: '#111827',
              },
              '& .markdown-body p': {
                my: 1.15,
              },
              '& .markdown-body ul, & .markdown-body ol': {
                pl: 4,
                my: 1.15,
              },
              '& .markdown-body li': {
                my: 0.5,
              },
              '& .markdown-body li::marker': {
                color: '#6B7280',
              },
              '& .markdown-body code': {
                fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
                fontSize: '0.875rem',
                padding: '0.2em 0.45em',
                margin: 0,
                bgcolor: '#F3F4F6',
                borderRadius: '6px',
                color: '#111827',
                border: '1px solid #E5E7EB',
              },
              '& .markdown-body pre': {
                borderRadius: '10px',
                border: '1px solid #E5E7EB',
                bgcolor: '#F9FAFB',
                p: 2,
                overflowX: 'auto',
                my: 1.5,
                '& code': {
                  bgcolor: 'transparent',
                  border: 'none',
                  padding: 0,
                  fontSize: '0.875rem',
                  color: '#111827',
                },
              },
              '& .markdown-body blockquote': {
                mx: 0,
                my: 1.5,
                px: 2,
                py: 0.25,
                bgcolor: '#F9FAFB',
                borderLeft: '4px solid #D1D5DB',
                color: '#4B5563',
                borderRadius: '6px',
              },
              '& .markdown-body a': {
                color: '#2563EB',
                textDecoration: 'none',
                borderBottom: '1px solid #BFDBFE',
                '&:hover': { color: '#1E40AF', borderBottomColor: '#2563EB' },
              },
            }}>
              <MarkdownRenderer content={parsedBody} />
            </Box>
          )}
        </Box>

        {/* ============ 底部：单粒"使用"黑色胶囊按钮 ============ */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          px: 3,
          pb: 3,
          pt: 1.5,
        }}>
          <Button
            variant="contained"
            disableElevation
            onClick={() => onUse(skill)}
            sx={{
              textTransform: 'none',
              borderRadius: '9999px',
              bgcolor: '#111827',
              color: '#FFFFFF',
              px: 3,
              py: 1,
              fontSize: '0.9375rem',
              fontWeight: 500,
              minWidth: 88,
              '&:hover': { bgcolor: '#000000' },
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
