import React, { useState } from 'react';
import {
  Box, Typography, Alert, Button, CircularProgress, useTheme,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PsychologyIcon from '@mui/icons-material/Psychology';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import LinkIcon from '@mui/icons-material/Link';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import { useModels } from '../../contexts/ModelsContext';
import { getGrayScale } from '../../constants/theme';
import ModelManager from '../shared/ModelManager';
import SettingsDialogShell, { type TabDef } from '../shared/SettingsDialogShell';
import MCPSettingsTab from './MCPSettingsTab';
import { useAiEngineSettings, type ExecutionMode, type QueueMode } from '../../contexts/AppSettingsContext';

/* ------------------------------------------------------------------ */
/*  Sidebar tabs                                                        */
/* ------------------------------------------------------------------ */
type AITab = 'mcp' | 'model' | 'chat' | 'auth';

const SIDEBAR_TABS: TabDef[] = [
  { key: 'mcp', label: 'MCP', icon: <LinkIcon sx={{ fontSize: 17 }} /> },
  { key: 'model', label: '模型', icon: <FormatListBulletedIcon sx={{ fontSize: 17 }} /> },
  { key: 'chat', label: '对话', icon: <ChatOutlinedIcon sx={{ fontSize: 17 }} /> },
  { key: 'auth', label: '外部应用授权', icon: <VpnKeyOutlinedIcon sx={{ fontSize: 17 }} /> },
];

/* ------------------------------------------------------------------ */
/*  Placeholder tab content                                             */
/* ------------------------------------------------------------------ */
const PlaceholderTab: React.FC<{ title: string; description?: string; colors: { textPrimary: string; textDisabled: string } }> = ({ title, description, colors }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: colors.textPrimary, mb: 0.5 }}>{title}</Typography>
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Typography sx={{ fontSize: '0.8rem', color: colors.textDisabled }}>
        {description || '功能开发中，敬请期待'}
      </Typography>
    </Box>
  </Box>
);

/* ------------------------------------------------------------------ */
/*  Main Dialog                                                         */
/* ------------------------------------------------------------------ */
export interface AISettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const AISettingsDialog: React.FC<AISettingsDialogProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [activeTab, setActiveTab] = useState<AITab>('model');
  const { models: modelList, defaultModelId, updateModels, isLoading, error, reload } = useModels();

  return (
    <SettingsDialogShell
      open={open}
      onClose={onClose}
      tabs={SIDEBAR_TABS}
      activeTab={activeTab}
      onTabChange={(key) => setActiveTab(key as AITab)}
    >
      {activeTab === 'model' && (
        <>
          {isLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4, gap: 1 }}>
              <CircularProgress size={20} />
              <Typography sx={{ fontSize: '0.875rem', color: gs.textMuted }}>正在加载模型配置...</Typography>
            </Box>
          )}
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2, borderRadius: 1.5 }}
              action={
                <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={() => reload()}>
                  重试
                </Button>
              }
            >
              加载模型配置失败：{error}
            </Alert>
          )}
          {!isLoading && !error && (
            <ModelManager
              models={modelList}
              defaultModelId={defaultModelId}
              variant="table"
              onChange={(models, newDefaultModelId) => updateModels(models, newDefaultModelId)}
            />
          )}
        </>
      )}
      {activeTab === 'mcp' && <MCPSettingsTab />}
      {activeTab === 'chat' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary, mb: 0.5 }}>对话引擎</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: gs.textSecondary, mb: 3 }}>
            选择 AI 工具执行的策略模式
          </Typography>
          <ExecutionModeSelector />
          <QueueModeSelector />
        </Box>
      )}
      {activeTab === 'auth' && <PlaceholderTab title="外部应用授权" description="外部应用授权管理功能开发中，敬请期待" colors={{ textPrimary: gs.textPrimary, textDisabled: gs.textDisabled }} />}
    </SettingsDialogShell>
  );
};

// ===================== Execution Mode Selector =====================

const EXECUTION_MODE_OPTIONS: { value: ExecutionMode; label: string; desc: string }[] = [
  { value: 'react', label: 'ReAct（推荐）', desc: '完整推理-行动-观察-反思循环，AI 具备真正的思考能力' },
  { value: 'agent', label: '多 Agent 编排', desc: '复杂任务自动拆分为子任务，多个专业 Agent 并行执行，结果智能合成' },
  { value: 'legacy', label: '经典（轻量）', desc: 'AI 直接调用工具并返回结果，无额外规划或反思，适合简单任务' },
];

function ExecutionModeSelector() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { settings: aiEngine, updateSettings } = useAiEngineSettings();

  const handleChange = (_: React.MouseEvent<HTMLElement>, newMode: string | null) => {
    if (newMode && newMode !== aiEngine.defaultExecutionMode) {
      updateSettings({ aiEngine: { defaultExecutionMode: newMode as ExecutionMode, defaultQueueMode: aiEngine.defaultQueueMode } });
    }
  };

  return (
    <Box>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, mb: 1.5 }}>
        默认执行模式
      </Typography>
      <ToggleButtonGroup
        value={aiEngine.defaultExecutionMode}
        exclusive
        onChange={handleChange}
        size="small"
        sx={{ mb: 3, flexWrap: 'wrap', gap: 0.5 }}
      >
        {EXECUTION_MODE_OPTIONS.map(opt => (
          <ToggleButton key={opt.value} value={opt.value} sx={{
            px: 2, py: 0.75, borderRadius: 1.5, border: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            textTransform: 'none', fontSize: '0.78rem',
            '&.Mui-selected': { backgroundColor: isDark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.5)' },
          }}>
            {opt.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {EXECUTION_MODE_OPTIONS.map(opt => (
        <Box key={opt.value} sx={{
          mb: 2, p: 2, borderRadius: 2, border: '1px solid',
          borderColor: aiEngine.defaultExecutionMode === opt.value ? 'rgba(99,102,241,0.4)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
          backgroundColor: aiEngine.defaultExecutionMode === opt.value ? (isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.03)') : 'transparent',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            {opt.value === 'react' && <PsychologyIcon sx={{ fontSize: 18, color: aiEngine.defaultExecutionMode === opt.value ? 'rgba(99,102,241,1)' : gs.textSecondary }} />}
            {opt.value === 'agent' && <AccountTreeIcon sx={{ fontSize: 18, color: aiEngine.defaultExecutionMode === opt.value ? 'rgba(99,102,241,1)' : gs.textSecondary }} />}
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: aiEngine.defaultExecutionMode === opt.value ? gs.textPrimary : gs.textSecondary }}>
              {opt.label}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: gs.textDisabled, fontFamily: 'monospace' }}>
              {opt.value}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.78rem', color: gs.textSecondary, lineHeight: 1.5 }}>
            {opt.desc}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

// ===================== v7.0: Queue Mode Selector =====================

const QUEUE_MODE_OPTIONS: { value: QueueMode; label: string; desc: string; icon: string }[] = [
  { value: 'followup', label: '追加', desc: '当前执行完成后串行追加，保证消息顺序和上下文连续', icon: '📋' },
  { value: 'collect', label: '合并', desc: '短时间窗口内的消息合并为单个 Prompt，减少重复请求', icon: '📦' },
  { value: 'steer', label: '转向', desc: '中断当前执行并注入新指令，实时改变 AI 执行方向', icon: '🧭' },
];

function QueueModeSelector() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { settings: aiEngine, updateSettings } = useAiEngineSettings();

  const handleChange = (_: React.MouseEvent<HTMLElement>, newMode: string | null) => {
    if (newMode && newMode !== aiEngine.defaultQueueMode) {
      updateSettings({ aiEngine: { defaultQueueMode: newMode as QueueMode, defaultExecutionMode: aiEngine.defaultExecutionMode } });
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary, mb: 1.5 }}>
        消息队列模式
      </Typography>
      <Typography sx={{ fontSize: '0.78rem', color: gs.textSecondary, mb: 2, lineHeight: 1.5 }}>
        高频交互时的消息竞争控制策略，解决多条消息同时发送时的上下文混乱问题
      </Typography>
      <ToggleButtonGroup
        value={aiEngine.defaultQueueMode}
        exclusive
        onChange={handleChange}
        size="small"
        sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}
      >
        {QUEUE_MODE_OPTIONS.map(opt => (
          <ToggleButton key={opt.value} value={opt.value} sx={{
            px: 2, py: 0.75, borderRadius: 1.5, border: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            textTransform: 'none', fontSize: '0.78rem',
            '&.Mui-selected': { backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.5)' },
          }}>
            {opt.icon} {opt.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {QUEUE_MODE_OPTIONS.map(opt => (
        <Box key={opt.value} sx={{
          mb: 1.5, p: 1.5, borderRadius: 2, border: '1px solid',
          borderColor: aiEngine.defaultQueueMode === opt.value ? 'rgba(16,185,129,0.4)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
          backgroundColor: aiEngine.defaultQueueMode === opt.value ? (isDark ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.03)') : 'transparent',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: aiEngine.defaultQueueMode === opt.value ? gs.textPrimary : gs.textSecondary }}>
              {opt.icon} {opt.label}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: gs.textDisabled, fontFamily: 'monospace' }}>
              {opt.value}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary, lineHeight: 1.5 }}>
            {opt.desc}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export default AISettingsDialog;
