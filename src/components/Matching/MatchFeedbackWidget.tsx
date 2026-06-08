/**
 * MatchFeedbackWidget — 匹配反馈组件
 *
 * 简化版：
 * - 匹配后显示"匹配结果准确吗？ 👍 准确  👎 不准确"
 * - 点击👎后展开：选择期望技能 + 可选问题描述
 * - 提交反馈
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Collapse,
} from '@mui/material';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { getAllSkills } from '../../stores/skillStore';
import type { MatchFeedback } from '../../services/matchingApi';

// ===================== 类型 =====================

export interface MatchFeedbackWidgetProps {
  /** 用户输入文本 */
  userInput: string;
  /** 匹配到的技能 ID */
  matchedSkillId: string;
  /** 匹配到的技能名称 */
  matchedSkillName: string;
  /** 匹配置信度 */
  confidence: number;
  /** 提交反馈回调 */
  onSubmit: (feedback: MatchFeedback) => void;
}

// ===================== 组件 =====================

const MatchFeedbackWidget: React.FC<MatchFeedbackWidgetProps> = ({
  userInput,
  matchedSkillId,
  matchedSkillName,
  confidence,
  onSubmit,
}) => {
  const [showDetail, setShowDetail] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expectedSkillId, setExpectedSkillId] = useState('');
  const [comment, setComment] = useState('');

  // 获取可选的技能列表（排除当前匹配的技能）
  const availableSkills = getAllSkills()
    .filter(s => s.status === 'active' && s.id !== matchedSkillId)
    .slice(0, 20);

  /** 点击"准确" */
  const handlePositive = () => {
    onSubmit({
      query: userInput,
      skillId: matchedSkillId,
      matchMode: 'hybrid',
      matchScore: confidence,
      isRelevant: true,
      userFeedback: 1,
    });
    setSubmitted(true);
  };

  /** 点击"不准确"展开详细反馈 */
  const handleNegative = () => {
    setShowDetail(true);
  };

  /** 提交负面反馈 */
  const handleSubmitNegative = () => {
    onSubmit({
      query: userInput,
      skillId: matchedSkillId,
      matchMode: 'hybrid',
      matchScore: confidence,
      isRelevant: false,
      userFeedback: -1,
      expectedSkillId: expectedSkillId || undefined,
      comment: comment.trim() || undefined,
    });
    setSubmitted(true);
  };

  // 已提交后显示感谢
  if (submitted) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.5,
          py: 0.75,
          borderRadius: '6px',
          bgcolor: '#F0FDF4',
          border: '1px solid #BBF7D0',
        }}
      >
        <CheckCircleOutlineIcon sx={{ fontSize: 14, color: '#059669' }} />
        <Typography sx={{ fontSize: '0.6875rem', color: '#059669', fontWeight: 500 }}>
          感谢反馈！
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        px: 1.5,
        py: 0.75,
        borderRadius: '6px',
        bgcolor: '#FAFAFA',
        border: '1px solid #F3F4F6',
      }}
    >
      {/* 基础反馈行 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
          匹配「{matchedSkillName}」准确吗？
        </Typography>
        <Button
          size="small"
          startIcon={<ThumbUpIcon sx={{ fontSize: 12 }} />}
          onClick={handlePositive}
          sx={{
            minWidth: 'auto',
            fontSize: '0.6875rem',
            textTransform: 'none',
            color: '#059669',
            py: 0.25,
            px: 1,
            '&:hover': { bgcolor: '#F0FDF4' },
          }}
        >
          准确
        </Button>
        <Button
          size="small"
          startIcon={<ThumbDownIcon sx={{ fontSize: 12 }} />}
          onClick={handleNegative}
          sx={{
            minWidth: 'auto',
            fontSize: '0.6875rem',
            textTransform: 'none',
            color: '#DC2626',
            py: 0.25,
            px: 1,
            '&:hover': { bgcolor: '#FEF2F2' },
          }}
        >
          不准确
        </Button>
      </Box>

      {/* 展开详细反馈 */}
      <Collapse in={showDetail}>
        <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid #E5E7EB' }}>
          {/* 期望技能选择 */}
          <FormControl fullWidth size="small" sx={{ mb: 1 }}>
            <InputLabel sx={{ fontSize: '0.75rem' }}>期望匹配的技能</InputLabel>
            <Select
              value={expectedSkillId}
              label="期望匹配的技能"
              onChange={(e) => setExpectedSkillId(e.target.value)}
              sx={{ fontSize: '0.75rem' }}
            >
              <MenuItem value="" sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                不指定
              </MenuItem>
              {availableSkills.map(skill => (
                <MenuItem key={skill.id} value={skill.id} sx={{ fontSize: '0.75rem' }}>
                  {skill.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* 问题描述 */}
          <TextField
            fullWidth
            size="small"
            multiline
            rows={2}
            placeholder="描述问题（可选）"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            sx={{
              mb: 1,
              '& .MuiOutlinedInput-root': {
                fontSize: '0.75rem',
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#E5E7EB',
              },
            }}
          />

          {/* 提交按钮 */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<SendIcon sx={{ fontSize: 12 }} />}
              onClick={handleSubmitNegative}
              sx={{
                fontSize: '0.6875rem',
                textTransform: 'none',
                bgcolor: '#7C3AED',
                '&:hover': { bgcolor: '#6D28D9' },
                borderRadius: '6px',
              }}
            >
              提交反馈
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};

export default MatchFeedbackWidget;
