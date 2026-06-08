/**
 * 类别自动映射组件
 *
 * 展示自动类别映射结果，允许用户手动修改类别选择。
 * 使用 CATEGORY_LABELS 中的类别作为可选项。
 *
 * @module CategoryMapper
 */

import React, { useEffect } from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  Stack,
} from '@mui/material';
import CategoryIcon from '@mui/icons-material/Category';
import { CATEGORY_LABELS, getCategoryLabel } from '../../constants/skillCategories';
import { mapCategory } from '../../services/skill/standardSkillAdapter';

/**
 * CategoryMapper 组件属性
 */
interface CategoryMapperProps {
  /** 原始标准类别（来自 SKILL.md） */
  originalCategory?: string;
  /** 映射后的 CDF Know Clow 类别（受控） */
  mappedCategory: string;
  /** 用户修改类别的回调 */
  onCategoryChange: (category: string) => void;
}

/**
 * 类别自动映射组件
 *
 * @param props - 组件属性
 * @returns React 组件
 */
const CategoryMapper: React.FC<CategoryMapperProps> = ({
  originalCategory,
  mappedCategory,
  onCategoryChange,
}) => {
  /**
   * 当 originalCategory 变化时，自动映射
   */
  useEffect(() => {
    if (originalCategory && !mappedCategory) {
      const mapped = mapCategory(originalCategory);
      onCategoryChange(mapped);
    }
  }, [originalCategory, mappedCategory, onCategoryChange]);

  /**
   * 处理类别选择变化
   */
  const handleCategoryChange = (event: any) => {
    onCategoryChange(event.target.value);
  };

  /**
   * 获取所有可选类别
   */
  const getCategoryOptions = () => {
    return Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
      value: key,
      label,
    }));
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        <CategoryIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
        类别映射
      </Typography>

      {/* 原始类别显示 */}
      {originalCategory && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            原始类别：
          </Typography>
          <Chip
            label={originalCategory}
            size="small"
            sx={{ ml: 1 }}
            variant="outlined"
          />
        </Box>
      )}

      {!originalCategory && (
        <Alert severity="info" sx={{ mb: 1 }}>
          原始类别为空，将自动推断
        </Alert>
      )}

      {/* 映射结果 / 手动选择 */}
      <Stack direction="row" spacing={2} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>CDF Know Clow 类别</InputLabel>
          <Select
            value={mappedCategory || 'tool'}
            label="CDF Know Clow 类别"
            onChange={handleCategoryChange}
          >
            {getCategoryOptions().map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Chip
          label={getCategoryLabel(mappedCategory)}
          color="primary"
          size="small"
        />
      </Stack>

      {/* 映射说明 */}
      {originalCategory && mappedCategory && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          映射：{originalCategory} → {getCategoryLabel(mappedCategory)}
        </Typography>
      )}
    </Box>
  );
};

export default CategoryMapper;
