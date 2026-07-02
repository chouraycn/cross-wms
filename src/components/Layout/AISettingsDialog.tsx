import React, { useState } from 'react';
import {
  Box, Typography, Alert, Button, CircularProgress, useTheme,
  ToggleButtonGroup, ToggleButton, TextField, Slider,
  Dialog, DialogTitle, DialogContent, IconButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PsychologyIcon from '@mui/icons-material/Psychology';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import LinkIcon from '@mui/icons-material/Link';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import HistoryIcon from '@mui/icons-material/History';
import CodeIcon from '@mui/icons-material/Code';
import DescriptionIcon from '@mui/icons-material/Description';
import CloseIcon from '@mui/icons-material/Close';
import BranchIcon from '@mui/icons-material/CallSplit';
import { useModels } from '../../contexts/ModelsContext';
import { getGrayScale } from '../../constants/theme';
import ModelManager from '../shared/ModelManager';
import SettingsDialogShell, { type TabDef } from '../shared/SettingsDialogShell';
import MCPSettingsTab from './MCPSettingsTab';
import ImageGenerationSettingsTab from './ImageGenerationSettingsTab';
import GitSettingsTab from './GitSettingsTab';
import SettingsSecrets from './SettingsSecrets';
import LspPanel from '../LSP/LspPanel';
import SoulDebugPanel from '../Soul/SoulDebugPanel';
import SoulEditor from '../Soul/SoulEditor';
import MemoryPanel from '../Memory/MemoryPanel';
import { useAiEngineSettings, type ExecutionMode, type QueueMode } from '../../contexts/AppSettingsContext';

/* ------------------------------------------------------------------ */
/*  Sidebar tabs                                                        */
/* ------------------------------------------------------------------ */
type AITab = 'mcp' | 'model' | 'chat' | 'memory' | 'auth' | 'image' | 'secrets' | 'lsp' | 'soul' | 'git';

const SIDEBAR_TABS: TabDef[] = [
  { key: 'mcp', label: 'MCP', icon: <LinkIcon sx={{ fontSize: 17 }} /> },
  { key: 'model', label: '模型', icon: <FormatListBulletedIcon sx={{ fontSize: 17 }} /> },
  { key: 'image', label: '图片生成', icon: <ImageOutlinedIcon sx={{ fontSize: 17 }} /> },
  { key: 'chat', label: '对话', icon: <ChatOutlinedIcon sx={{ fontSize: 17 }} /> },
  { key: 'memory', label: '记忆', icon: <PsychologyIcon sx={{ fontSize: 17 }} /> },
  { key: 'git', label: 'Git', icon: <BranchIcon sx={{ fontSize: 17 }} /> },
  { key: 'soul', label: '规则', icon: <DescriptionIcon sx={{ fontSize: 17 }} /> },
  { key: 'secrets', label: '密钥管理', icon: <LockOutlinedIcon sx={{ fontSize: 17 }} /> },
  { key: 'lsp', label: 'LSP', icon: <CodeIcon sx={{ fontSize: 17 }} /> },
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
  const [soulEditorOpen, setSoulEditorOpen] = useState(false);
  const [soulEditorFileType, setSoulEditorFileType] = useState<'soul' | 'user'>('soul');

  // 处理编辑规则
  const handleEditSoul = (fileType: 'soul' | 'user') => {
    setSoulEditorFileType(fileType);
    setSoulEditorOpen(true);
  };

  // 保存规则文件
  const handleSaveSoul = async (content: string) => {
    const response = await fetch('/api/soul/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileType: soulEditorFileType, content }),
    });
    if (!response.ok) {
      throw new Error('保存失败');
    }
  };

  return (
    <>
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
        {activeTab === 'lsp' && <LspPanel />}
        {activeTab === 'image' && <ImageGenerationSettingsTab />}
        {activeTab === 'chat' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary, mb: 0.5 }}>对话引擎</Typography>
            <Typography sx={{ fontSize: '0.8rem', color: gs.textSecondary, mb: 3 }}>
              选择 AI 工具执行的策略模式
            </Typography>
            <ExecutionModeSelector />
            <QueueModeSelector />
            <MaxHistoryTurnsSelector />
          </Box>
        )}
        {activeTab === 'memory' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary, mb: 0.5 }}>记忆管理</Typography>
            <Typography sx={{ fontSize: '0.8rem', color: gs.textSecondary, mb: 2 }}>
              管理向量记忆库
            </Typography>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <MemoryPanel />
            </Box>
          </Box>
        )}
        {activeTab === 'git' && <GitSettingsTab />}
        {activeTab === 'soul' && (
          <SoulDebugPanel onEdit={handleEditSoul} />
        )}
        {activeTab === 'secrets' && <SettingsSecrets />}
        {activeTab === 'auth' && <PlaceholderTab title="外部应用授权" description="外部应用授权管理功能开发中，敬请期待" colors={{ textPrimary: gs.textPrimary, textDisabled: gs.textDisabled }} />}
      </SettingsDialogShell>

      {/* Soul Editor Dialog */}
      <Dialog
        open={soulEditorOpen}
        onClose={() => setSoulEditorOpen(false)}
        maxWidth="md"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            height: '80vh',
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>
            {soulEditorFileType === 'soul' ? '编辑 SOUL.md' : '编辑 USER.md'}
          </Typography>
          <IconButton size="small" onClick={() => setSoulEditorOpen(false)}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <SoulEditor
            fileType={soulEditorFileType}
            onSave={handleSaveSoul}
            onClose={() => setSoulEditorOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
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
      updateSettings({ aiEngine: { ...aiEngine, defaultExecutionMode: newMode as ExecutionMode } });
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
      updateSettings({ aiEngine: { ...aiEngine, defaultQueueMode: newMode as QueueMode } });
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

// ===================== v1.7.19: Max History Turns Selector =====================

const MAX_TURNS_OPTIONS = [
  { value: 0, label: '不限制' },
  { value: 5, label: '5 轮' },
  { value: 10, label: '10 轮' },
  { value: 20, label: '20 轮' },
  { value: 30, label: '30 轮' },
  { value: 50, label: '50 轮' },
];

function MaxHistoryTurnsSelector() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { settings: aiEngine, updateSettings } = useAiEngineSettings();

  const handleSliderChange = (_: Event, newValue: number | number[]) => {
    const value = newValue as number;
    updateSettings({
      aiEngine: {
        ...aiEngine,
        maxHistoryTurns: value,
      },
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      updateSettings({
        aiEngine: {
          ...aiEngine,
          maxHistoryTurns: value,
        },
      });
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <HistoryIcon sx={{ fontSize: 18, color: gs.textSecondary }} />
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
          上下文轮次限制
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.78rem', color: gs.textSecondary, mb: 2, lineHeight: 1.5 }}>
        限制发送给模型的历史对话轮次，减少 token 消耗并加快响应速度。设置为 0 表示不限制。
      </Typography>

      <Box sx={{ px: 1, mb: 2 }}>
        <Slider
          value={aiEngine.maxHistoryTurns}
          onChange={handleSliderChange}
          step={5}
          min={0}
          max={50}
          marks={MAX_TURNS_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
          valueLabelDisplay="auto"
          valueLabelFormat={(value) => value === 0 ? '不限制' : `${value} 轮`}
          sx={{
            color: isDark ? 'rgba(99,102,241,0.8)' : 'rgba(99,102,241,1)',
            '& .MuiSlider-markLabel': {
              fontSize: '0.65rem',
              color: gs.textDisabled,
            },
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <TextField
          type="number"
          size="small"
          label="自定义轮次"
          value={aiEngine.maxHistoryTurns}
          onChange={handleInputChange}
          InputProps={{ inputProps: { min: 0, max: 100 } }}
          sx={{ width: 140 }}
        />
        <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
          {aiEngine.maxHistoryTurns === 0
            ? '当前：不限制历史轮次，完整上下文将被发送给模型'
            : `当前：仅保留最近 ${aiEngine.maxHistoryTurns} 轮对话作为上下文`}
        </Typography>
      </Box>
    </Box>
  );
}

export default AISettingsDialog;
