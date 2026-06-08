/**
 * ModelEditDialog — 统一编辑弹窗
 *
 * 包含：
 * - 基础字段：ID、名称、提供商、API 端点、API Key（含可见性切换 F1）、描述
 * - 高级字段：上下文窗口、最大输出、temperature 滑块（F2）、topP 滑块（F2）
 * - 启用开关
 * - 测试连接按钮（F4）
 * - 保存/取消按钮
 */

import React from 'react';
import {
  Box, Typography, Button, TextField, FormControl, InputLabel,
  Select, MenuItem, Switch, FormControlLabel, IconButton, Dialog,
  Slider, InputAdornment, Chip,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { providerLabel, providerIcon, ALL_PROVIDERS } from '../../../utils/providerIcons';
import { CAPABILITY_LABELS, CAPABILITY_COLORS, type ModelCapability } from '../../../types/models';
import { textFieldSx, COLORS, sliderLabelSx, sliderValueSx, primaryButtonSx } from './styles';
import type { ModelEditDialogProps } from './types';
import type { ModelProvider } from '../../../types/models';

const ModelEditDialog: React.FC<ModelEditDialogProps> = ({ state, actions }) => {
  const { modelForm, modelFormErrors, modelDialogMode, testStatus, testMessage, showApiKey } = state;
  const { closeModelDialog, setModelForm, handleSaveModel, handleTestApi, toggleApiKeyVisibility } = actions;

  if (!modelDialogMode) return null;

  return (
    <Dialog
      open
      onClose={closeModelDialog}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* 标题 */}
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: COLORS.textPrimary }}>
          {modelDialogMode === 'add' ? '添加模型' : '编辑模型'}
        </Typography>

        {/* 模型 ID */}
        <TextField
          label="模型 ID"
          value={modelForm.id}
          onChange={e => setModelForm(p => ({ ...p, id: e.target.value }))}
          error={!!modelFormErrors['model.id']}
          helperText={modelFormErrors['model.id']}
          disabled={modelDialogMode === 'edit'}
          fullWidth
          size="small"
          sx={textFieldSx}
        />

        {/* 模型名称 */}
        <TextField
          label="模型名称"
          value={modelForm.name}
          onChange={e => setModelForm(p => ({ ...p, name: e.target.value }))}
          error={!!modelFormErrors['model.name']}
          helperText={modelFormErrors['model.name']}
          fullWidth
          size="small"
          sx={textFieldSx}
        />

        {/* 提供商下拉 */}
        <FormControl fullWidth size="small">
          <InputLabel sx={{ fontSize: '0.8125rem' }}>提供商</InputLabel>
          <Select
            value={modelForm.provider}
            label="提供商"
            onChange={e => setModelForm(p => ({ ...p, provider: e.target.value as ModelProvider }))}
            renderValue={(value) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {providerIcon(value as string, 18)}
                <Typography sx={{ fontSize: '0.8125rem' }}>{providerLabel(value as string)}</Typography>
              </Box>
            )}
          >
            {ALL_PROVIDERS.map(p => (
              <MenuItem key={p} value={p}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {providerIcon(p, 18)}
                  <Typography sx={{ fontSize: '0.8125rem' }}>{providerLabel(p)}</Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* API 端点（仅 custom 时显示） */}
        {modelForm.provider === 'custom' && (
          <TextField
            label="API 端点"
            value={modelForm.apiEndpoint}
            onChange={e => setModelForm(p => ({ ...p, apiEndpoint: e.target.value }))}
            fullWidth
            size="small"
            placeholder="https://api.example.com/v1"
            sx={textFieldSx}
          />
        )}

        {/* API Key（含可见性切换 — F1） */}
        <TextField
          label="API Key（可选）"
          value={modelForm.apiKey}
          onChange={e => setModelForm(p => ({ ...p, apiKey: e.target.value }))}
          fullWidth
          size="small"
          type={showApiKey ? 'text' : 'password'}
          sx={textFieldSx}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={toggleApiKeyVisibility}
                  edge="end"
                  sx={{ color: COLORS.textMuted }}
                  aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                >
                  {showApiKey ? <VisibilityOffIcon sx={{ fontSize: 18 }} /> : <VisibilityIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        {/* 描述 */}
        <TextField
          label="描述"
          value={modelForm.description}
          onChange={e => setModelForm(p => ({ ...p, description: e.target.value }))}
          fullWidth
          size="small"
          multiline
          rows={2}
          sx={textFieldSx}
        />

        {/* 能力标签 */}
        <Box>
          <Typography sx={{ fontSize: '0.8125rem', color: COLORS.textSecondary, mb: 0.75 }}>
            能力标签
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {(['code', 'longContext', 'reasoning', 'multimodal', 'fast', 'costEffective', 'general'] as ModelCapability[]).map(cap => {
              const selected = modelForm.capabilities?.includes(cap);
              return (
                <Chip
                  key={cap}
                  label={CAPABILITY_LABELS[cap]}
                  size="small"
                  onClick={() => {
                    setModelForm(p => ({
                      ...p,
                      capabilities: selected
                        ? (p.capabilities || []).filter(c => c !== cap)
                        : [...(p.capabilities || []), cap],
                    }));
                  }}
                  sx={{
                    fontSize: '0.75rem',
                    height: 28,
                    cursor: 'pointer',
                    backgroundColor: selected ? `${CAPABILITY_COLORS[cap]}20` : '#F3F4F6',
                    color: selected ? CAPABILITY_COLORS[cap] : COLORS.textMuted,
                    border: selected ? `1px solid ${CAPABILITY_COLORS[cap]}50` : '1px solid transparent',
                    fontWeight: selected ? 600 : 400,
                    '&:hover': {
                      backgroundColor: selected ? `${CAPABILITY_COLORS[cap]}30` : '#E5E7EB',
                    },
                  }}
                />
              );
            })}
          </Box>
        </Box>

        {/* 上下文窗口 & 最大输出 */}
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField
            label="上下文窗口"
            value={modelForm.contextWindow}
            onChange={e => setModelForm(p => ({ ...p, contextWindow: e.target.value }))}
            error={!!modelFormErrors['model.contextWindow']}
            helperText={modelFormErrors['model.contextWindow']}
            size="small"
            type="number"
            sx={{ ...textFieldSx, flex: 1 }}
          />
          <TextField
            label="最大输出"
            value={modelForm.maxTokens}
            onChange={e => setModelForm(p => ({ ...p, maxTokens: e.target.value }))}
            error={!!modelFormErrors['model.maxTokens']}
            helperText={modelFormErrors['model.maxTokens']}
            size="small"
            type="number"
            sx={{ ...textFieldSx, flex: 1 }}
          />
        </Box>

        {/* Temperature 滑块（F2） */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
            <Typography sx={sliderLabelSx}>Temperature</Typography>
            <Typography sx={sliderValueSx}>{modelForm.temperature || '1'}</Typography>
          </Box>
          <Slider
            value={Number(modelForm.temperature) || 1}
            onChange={(_e, value) => setModelForm(p => ({ ...p, temperature: String(value) }))}
            min={0}
            max={2}
            step={0.1}
            size="small"
            valueLabelDisplay="auto"
            valueLabelFormat={v => Number(v).toFixed(1)}
            sx={{
              color: COLORS.textPrimary,
              '& .MuiSlider-thumb': { width: 14, height: 14 },
              '& .MuiSlider-valueLabel': { fontSize: '0.7rem' },
            }}
          />
          {modelFormErrors['model.temperature'] && (
            <Typography sx={{ fontSize: '0.7rem', color: COLORS.error, mt: -0.5 }}>
              {modelFormErrors['model.temperature']}
            </Typography>
          )}
        </Box>

        {/* Top P 滑块（F2） */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
            <Typography sx={sliderLabelSx}>Top P</Typography>
            <Typography sx={sliderValueSx}>{modelForm.topP || '1'}</Typography>
          </Box>
          <Slider
            value={Number(modelForm.topP) || 1}
            onChange={(_e, value) => setModelForm(p => ({ ...p, topP: String(value) }))}
            min={0}
            max={1}
            step={0.05}
            size="small"
            valueLabelDisplay="auto"
            valueLabelFormat={v => Number(v).toFixed(2)}
            sx={{
              color: COLORS.textPrimary,
              '& .MuiSlider-thumb': { width: 14, height: 14 },
              '& .MuiSlider-valueLabel': { fontSize: '0.7rem' },
            }}
          />
          {modelFormErrors['model.topP'] && (
            <Typography sx={{ fontSize: '0.7rem', color: COLORS.error, mt: -0.5 }}>
              {modelFormErrors['model.topP']}
            </Typography>
          )}
        </Box>

        {/* 启用开关 */}
        <FormControlLabel
          control={
            <Switch
              checked={modelForm.enabled}
              onChange={e => setModelForm(p => ({ ...p, enabled: e.target.checked }))}
              size="small"
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.textPrimary },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: COLORS.textPrimary },
              }}
            />
          }
          label={<Typography sx={{ fontSize: '0.8rem' }}>启用此模型</Typography>}
        />

        {/* 测试结果消息 */}
        {testMessage && (
          <Typography sx={{
            fontSize: '0.75rem',
            color: testStatus === 'success' ? COLORS.successHover : COLORS.error,
            px: 0.5,
          }}>
            {testMessage}
          </Typography>
        )}

        {/* 操作按钮 */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
          {/* 测试连接按钮（F4） */}
          <Button
            variant="outlined"
            size="small"
            onClick={handleTestApi}
            disabled={testStatus === 'testing'}
            sx={{
              fontSize: '0.8rem',
              mr: 'auto',
              borderColor: '#D1D5DB',
              color: COLORS.textMuted,
              '&:hover': { borderColor: '#9CA3AF' },
            }}
          >
            {testStatus === 'testing' ? '测试中...' : '测试 API'}
          </Button>
          <Button variant="outlined" onClick={closeModelDialog} size="small" sx={{ fontSize: '0.8rem' }}>
            取消
          </Button>
          <Button variant="contained" onClick={handleSaveModel} size="small" sx={primaryButtonSx}>
            保存
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default ModelEditDialog;
