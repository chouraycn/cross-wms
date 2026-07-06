/**
 * TalkSettingsPanel — 语音对话配置面板
 *
 * 功能：
 * - 语音 locale 选择
 * - 静默超时配置
 * - 语音打断开关
 * - 咨询思考级别
 * - 快速模式开关
 * - 当前活动 provider 显示
 *
 * 从后端 /api/talk/config 读取配置，PUT 更新。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Switch,
  TextField,
  Button,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import { getGrayScale } from '../../constants/theme';
import { useToast } from '../../contexts/ToastContext';
import { fetchTalkConfig, updateTalkConfig, resetTalkConfig } from '../../services/talk/api';
import type { TalkConfigResponse, TalkConfig } from '../../services/talk/types';

const LOCALE_OPTIONS = [
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'zh-TW', label: '中文（繁體）' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
];

const THINKING_LEVELS = [
  { value: 'off', label: '关闭' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

const TalkSettingsPanel: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<TalkConfigResponse | null>(null);

  // 本地草稿（编辑中的值）
  const [draft, setDraft] = useState<TalkConfig>({});

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTalkConfig();
      setConfig(data);
      setDraft({
        speechLocale: data.speechLocale,
        interruptOnSpeech: data.interruptOnSpeech,
        consultThinkingLevel: data.consultThinkingLevel,
        consultFastMode: data.consultFastMode,
        silenceTimeoutMs: data.silenceTimeoutMs,
        provider: data.provider,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await updateTalkConfig(draft);
      setConfig(updated);
      showToast('语音配置已保存', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }, [draft, showToast]);

  const handleReset = useCallback(async () => {
    setSaving(true);
    try {
      const reset = await resetTalkConfig();
      setConfig(reset);
      setDraft({
        speechLocale: reset.speechLocale,
        interruptOnSpeech: reset.interruptOnSpeech,
        consultThinkingLevel: reset.consultThinkingLevel,
        consultFastMode: reset.consultFastMode,
        silenceTimeoutMs: reset.silenceTimeoutMs,
        provider: reset.provider,
      });
      showToast('已重置为默认值', 'info');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '重置失败', 'error');
    } finally {
      setSaving(false);
    }
  }, [showToast]);

  const inputSx = {
    fontSize: '0.75rem',
    '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.75 },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: gs.border },
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} sx={{ color: gs.textMuted }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Alert severity="error" sx={{ fontSize: '0.75rem' }}>{error}</Alert>
        <Button size="small" startIcon={<RefreshIcon />} onClick={loadConfig} sx={{ alignSelf: 'flex-start', fontSize: '0.75rem', color: gs.textMuted }}>
          重试
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 当前活动 Provider */}
      {config?.provider && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: '8px', backgroundColor: gs.bgHover }}>
          <RecordVoiceOverIcon sx={{ fontSize: 18, color: gs.textMuted }} />
          <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
            当前 Provider: <strong style={{ color: gs.textPrimary }}>{config.provider}</strong>
          </Typography>
        </Box>
      )}

      {/* 语音 Locale */}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textSecondary, mb: 0.75 }}>语音 Locale</Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {LOCALE_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              size="small"
              variant={draft.speechLocale === opt.value ? 'contained' : 'outlined'}
              onClick={() => setDraft(prev => ({ ...prev, speechLocale: opt.value }))}
              sx={{
                fontSize: '0.7rem', minWidth: 0, px: 1.2, py: 0.3,
                ...(draft.speechLocale === opt.value
                  ? { backgroundColor: gs.textPrimary, '&:hover': { backgroundColor: gs.textSecondary } }
                  : { borderColor: gs.border, color: gs.textMuted, '&:hover': { borderColor: gs.borderDarker } }),
              }}
            >
              {opt.label}
            </Button>
          ))}
        </Box>
      </Box>

      {/* 静默超时 */}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textSecondary, mb: 0.75 }}>
          静默超时（毫秒）
        </Typography>
        <TextField
          type="number"
          size="small"
          fullWidth
          value={draft.silenceTimeoutMs ?? ''}
          onChange={e => setDraft(prev => ({ ...prev, silenceTimeoutMs: parseInt(e.target.value, 10) || undefined }))}
          sx={inputSx}
          placeholder="700"
          helperText="macOS/Android 默认 700ms，iOS 默认 900ms"
          FormHelperTextProps={{ sx: { fontSize: '0.65rem', color: gs.textMuted, mt: 0.3 } }}
        />
      </Box>

      {/* 咨询思考级别 */}
      <Box>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textSecondary, mb: 0.75 }}>咨询思考级别</Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {THINKING_LEVELS.map(opt => (
            <Button
              key={opt.value}
              size="small"
              variant={draft.consultThinkingLevel === opt.value ? 'contained' : 'outlined'}
              onClick={() => setDraft(prev => ({ ...prev, consultThinkingLevel: opt.value }))}
              sx={{
                fontSize: '0.7rem', minWidth: 0, px: 1.2, py: 0.3, flex: 1,
                ...(draft.consultThinkingLevel === opt.value
                  ? { backgroundColor: gs.textPrimary, '&:hover': { backgroundColor: gs.textSecondary } }
                  : { borderColor: gs.border, color: gs.textMuted, '&:hover': { borderColor: gs.borderDarker } }),
              }}
            >
              {opt.label}
            </Button>
          ))}
        </Box>
      </Box>

      {/* 开关组 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
          <Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: gs.textPrimary }}>语音打断</Typography>
            <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>允许用户语音打断当前回复</Typography>
          </Box>
          <Switch
            size="small"
            checked={draft.interruptOnSpeech ?? false}
            onChange={e => setDraft(prev => ({ ...prev, interruptOnSpeech: e.target.checked }))}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
          <Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: gs.textPrimary }}>快速模式</Typography>
            <Typography sx={{ fontSize: '0.65rem', color: gs.textMuted }}>降低延迟，跳过部分思考步骤</Typography>
          </Box>
          <Switch
            size="small"
            checked={draft.consultFastMode ?? false}
            onChange={e => setDraft(prev => ({ ...prev, consultFastMode: e.target.checked }))}
          />
        </Box>
      </Box>

      {/* 操作按钮 */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={saving ? <CircularProgress size={14} /> : <RefreshIcon />}
          onClick={handleReset}
          disabled={saving}
          sx={{ borderColor: gs.border, color: gs.textMuted, fontSize: '0.75rem', '&:hover': { borderColor: gs.textDisabled } }}
        >
          重置
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
          sx={{ backgroundColor: gs.textPrimary, '&:hover': { backgroundColor: gs.textSecondary }, fontSize: '0.75rem' }}
        >
          保存
        </Button>
      </Box>
    </Box>
  );
};

export default TalkSettingsPanel;
