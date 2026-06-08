/**
 * SKILL.md 内容预览组件
 *
 * 展示解析后的 SKILL.md 信息卡片，包括名称、描述、版本、作者、
 * 类别、触发词、标签、依赖、权限和指令块预览。
 *
 * @module SkillMdPreview
 */

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Chip,
  Box,
  Paper,
  IconButton,
  Collapse,
  Grid,
  Divider,
  Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DescriptionIcon from '@mui/icons-material/Description';
import { ParsedSkillMd } from '../../services/skill/skillMdParser';
import { getCategoryLabel } from '../../constants/skillCategories';
import { MarkdownRenderer } from '../CrossWmsChat/MarkdownRenderer';

/**
 * SkillMdPreview 组件属性
 */
interface SkillMdPreviewProps {
  /** 解析后的 SKILL.md 数据 */
  parsed: ParsedSkillMd;
  /** 文件名（可选） */
  fileName?: string;
}

/**
 * SKILL.md 内容预览组件
 *
 * @param props - 组件属性
 * @returns React 组件
 */
const SkillMdPreview: React.FC<SkillMdPreviewProps> = ({ parsed, fileName }) => {
  const [expanded, setExpanded] = useState(false);

  const handleToggleExpand = () => {
    setExpanded(!expanded);
  };

  /**
   * 渲染 Chip 数组
   */
  const renderChips = (items: string[] | undefined, color: 'primary' | 'secondary' | 'default' = 'primary'): React.ReactNode => {
    if (!items || items.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          -
        </Typography>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {items.map((item, index) => (
          <Chip
            key={index}
            label={item}
            size="small"
            color={color}
            variant="outlined"
          />
        ))}
      </Box>
    );
  };

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardHeader
        avatar={<DescriptionIcon color="primary" />}
        title="技能预览"
        subheader={fileName ? `文件名: ${fileName}` : undefined}
        sx={{ pb: 0 }}
      />
      <CardContent>
        <Grid container spacing={2}>
          {/* 名称 */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              名称
            </Typography>
            <Typography variant="body1" fontWeight={500}>
              {parsed.name || <span style={{ color: '#9e9e9e', fontStyle: 'italic' }}>未指定</span>}
            </Typography>
          </Grid>

          {/* 描述 */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              描述
            </Typography>
            <Typography variant="body2" color="text.primary">
              {parsed.description || parsed.inferredDescription || (
                <span style={{ color: '#9e9e9e', fontStyle: 'italic' }}>未指定</span>
              )}
            </Typography>
            {parsed.inferredDescription && !parsed.description && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                (自动推断)
              </Typography>
            )}
          </Grid>

          {/* 版本和作者 */}
          <Grid item xs={6} sm={3}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              版本
            </Typography>
            <Typography variant="body2">
              {parsed.version || '-'}
            </Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              作者
            </Typography>
            <Typography variant="body2">
              {parsed.author || '-'}
            </Typography>
          </Grid>

          {/* 类别 */}
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              类别
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              <Chip
                label={getCategoryLabel(parsed.category || '')}
                size="small"
                color="primary"
              />
            </Box>
          </Grid>

          {/* 触发词 */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              触发词
            </Typography>
            {renderChips(parsed.trigger || parsed.inferredTrigger, 'primary')}
            {parsed.inferredTrigger && !parsed.trigger && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                (自动推断)
              </Typography>
            )}
          </Grid>

          {/* 标签 */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              标签
            </Typography>
            {renderChips(parsed.tags, 'default')}
          </Grid>

          {/* 依赖 */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              依赖
            </Typography>
            {renderChips(parsed.dependencies, 'secondary')}
          </Grid>

          {/* 权限 */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              权限
            </Typography>
            {renderChips(parsed.permissions, 'default')}
          </Grid>

          <Grid item xs={12}>
            <Divider sx={{ my: 1 }} />
          </Grid>

          {/* 指令块预览 */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                指令块
              </Typography>
              {parsed.instructionBlocks && parsed.instructionBlocks.length > 0 && (
                <Tooltip title={expanded ? '收起' : '展开全部'}>
                  <IconButton size="small" onClick={handleToggleExpand}>
                    {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                bgcolor: 'grey.50',
                maxHeight: expanded ? 'none' : 150,
                overflow: expanded ? 'auto' : 'hidden',
              }}
            >
              {parsed.instructionBlocks && parsed.instructionBlocks.length > 0 ? (
                <MarkdownRenderer content={parsed.instructionBlocks.join('\n\n---\n\n')} />
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  无指令块
                </Typography>
              )}
            </Paper>
            {!expanded && parsed.instructionBlocks && parsed.instructionBlocks.join('').length > 200 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                点击展开查看完整内容
              </Typography>
            )}
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default SkillMdPreview;
