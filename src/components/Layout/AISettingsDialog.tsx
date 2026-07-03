import React, { useState } from 'react';
import {
  Box, Typography, Alert, Button, CircularProgress, useTheme,
  ToggleButtonGroup, ToggleButton, TextField, Slider, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, IconButton,
} from '@mui/material';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
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
import HandymanIcon from '@mui/icons-material/Handyman';
import CompressIcon from '@mui/icons-material/Compress';
import CloseIcon from '@mui/icons-material/Close';
import BranchIcon from '@mui/icons-material/CallSplit';
import SettingsIcon from '@mui/icons-material/Settings';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ExternalLinkIcon from '@mui/icons-material/OpenInNew';
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
import AgentsPage from '../../pages/AgentsPage';
import GoalsPage from '../../pages/GoalsPage';
import ContextEngineRegistryPage from '../../pages/ContextEngineRegistryPage';
import { useAiEngineSettings, type ExecutionMode, type QueueMode, type ToolProfile, type CompactionStrategy } from '../../contexts/AppSettingsContext';

type MainTab = 'basic' | 'ai' | 'tools' | 'system' | 'advanced';
type SubTab = 'model' | 'chat' | 'memory' | 'agents' | 'soul' | 'goals' | 'mcp' | 'lsp' | 'image' | 'secrets' | 'git' | 'auth' | 'context';

const MAIN_TABS: TabDef[] = [
  { key: 'basic', label: '基础配置', icon: <SettingsIcon sx={{ fontSize: 17 }} /> },
  { key: 'ai', label: 'AI 配置', icon: <AutoFixHighIcon sx={{ fontSize: 17 }} /> },
  { key: 'tools', label: '工具管理', icon: <HandymanIcon sx={{ fontSize: 17 }} /> },
  { key: 'system', label: '系统集成', icon: <ExternalLinkIcon sx={{ fontSize: 17 }} /> },
  { key: 'advanced', label: '高级', icon: <AccountTreeIcon sx={{ fontSize: 17 }} /> },
];

const SUB_TABS: Record<MainTab, { key: SubTab; label: string }[]> = {
  basic: [
    { key: 'model', label: '模型' },
    { key: 'chat', label: '对话' },
    { key: 'memory', label: '记忆' },
  ],
  ai: [
    { key: 'agents', label: 'Agent' },
    { key: 'soul', label: '规则' },
    { key: 'goals', label: '目标' },
  ],
  tools: [
    { key: 'mcp', label: 'MCP' },
    { key: 'lsp', label: 'LSP' },
    { key: 'image', label: '图片生成' },
    { key: 'secrets', label: '密钥管理' },
  ],
  system: [
    { key: 'git', label: 'Git' },
    { key: 'auth', label: '外部应用授权' },
  ],
  advanced: [
    { key: 'context', label: '上下文引擎' },
  ],
};

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

export interface AISettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const AISettingsDialog: React.FC<AISettingsDialogProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('basic');
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('model');
  const { models: modelList, defaultModelId, updateModels, isLoading, error, reload } = useModels();
  const [soulEditorOpen, setSoulEditorOpen] = useState(false);
  const [soulEditorFileType, setSoulEditorFileType] = useState<'soul' | 'user'>('soul');

  const handleEditSoul = (fileType: 'soul' | 'user') => {
    setSoulEditorFileType(fileType);
    setSoulEditorOpen(true);
  };

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

  const handleMainTabChange = (key: string) => {
    const mainTab = key as MainTab;
    setActiveMainTab(mainTab);
    const firstSubTab = SUB_TABS[mainTab][0].key;
    setActiveSubTab(firstSubTab);
  };

  const handleSubTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveSubTab(newValue as SubTab);
  };

  return (
    <>
      <SettingsDialogShell
        open={open}
        onClose={onClose}
        tabs={MAIN_TABS}
        activeTab={activeMainTab}
        onTabChange={handleMainTabChange}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary, mb: 1 }}>
            {activeMainTab === 'basic' && '基础配置'}
            {activeMainTab === 'ai' && 'AI 配置'}
            {activeMainTab === 'tools' && '工具管理'}
            {activeMainTab === 'system' && '系统集成'}
            {activeMainTab === 'advanced' && '高级设置'}
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: gs.textSecondary, mb: 2 }}>
            {activeMainTab === 'basic' && '配置 AI 模型、对话引擎和记忆系统'}
            {activeMainTab === 'ai' && '配置 Agent 身份、行为规则和目标管理'}
            {activeMainTab === 'tools' && '管理 MCP、LSP、图片生成和密钥'}
            {activeMainTab === 'system' && '配置 Git 和外部应用授权'}
            {activeMainTab === 'advanced' && '高级系统配置'}
          </Typography>

          {SUB_TABS[activeMainTab].length > 1 && (
            <Tabs
              value={activeSubTab}
              onChange={handleSubTabChange}
              sx={{
                mb: 2,
                '& .MuiTab-root': { fontSize: '0.8rem', fontWeight: 500 },
                '& .Mui-selected': { color: gs.textPrimary },
                '& .MuiTabs-indicator': { backgroundColor: '#10b981' },
              }}
            >
              {SUB_TABS[activeMainTab].map(sub => (
                <Tab key={sub.key} value={sub.key} label={sub.label} />
              ))}
            </Tabs>
          )}

          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {activeSubTab === 'model' && (
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

            {activeSubTab === 'chat' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: gs.textPrimary, mb: 0.5 }}>对话引擎</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: gs.textSecondary, mb: 3 }}>
                  选择 AI 工具执行的策略模式
                </Typography>
                <ExecutionModeSelector />
                <QueueModeSelector />
                <ToolProfileSelector />
                <MaxHistoryTurnsSelector />
                <CompactionSettings />
              </Box>
            )}

            {activeSubTab === 'memory' && (
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

            {activeSubTab === 'agents' && <AgentsPage />}
            {activeSubTab === 'goals' && <GoalsPage />}
            {activeSubTab === 'soul' && <SoulDebugPanel onEdit={handleEditSoul} />}
            {activeSubTab === 'mcp' && <MCPSettingsTab />}
            {activeSubTab === 'lsp' && <LspPanel />}
            {activeSubTab === 'image' && <ImageGenerationSettingsTab />}
            {activeSubTab === 'secrets' && <SettingsSecrets />}
            {activeSubTab === 'git' && <GitSettingsTab />}
            {activeSubTab === 'auth' && <PlaceholderTab title="外部应用授权" description="外部应用授权管理功能开发中，敬请期待" colors={{ textPrimary: gs.textPrimary, textDisabled: gs.textDisabled }} />}
            {activeSubTab === 'context' && <ContextEngineRegistryPage />}
          </Box>
        </Box>
      </SettingsDialogShell>

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

const TOOL_PROFILE_OPTIONS: { value: ToolProfile; label: string; desc: string; icon: string }[] = [
  { value: 'full', label: '完整', desc: '所有可用工具全部开放，适合复杂任务和深度探索', icon: '🔧' },
  { value: 'coding', label: '编程', desc: '仅开放代码相关工具（文件读写、终端、Git等），专注编码任务', icon: '💻' },
  { value: 'messaging', label: '消息', desc: '仅开放消息和搜索类工具，适合信息查询和文档整理', icon: '💬' },
  { value: 'minimal', label: '极简', desc: '最少工具集，仅保留最核心的功能，最大限度减少 token 消耗', icon: '⚡' },
];

function ToolProfileSelector() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { settings: aiEngine, updateSettings } = useAiEngineSettings();

  const handleChange = (_: React.MouseEvent<HTMLElement>, newProfile: string | null) => {
    if (newProfile && newProfile !== aiEngine.toolProfile) {
      updateSettings({ aiEngine: { ...aiEngine, toolProfile: newProfile as ToolProfile } });
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <HandymanIcon sx={{ fontSize: 18, color: gs.textSecondary }} />
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
          工具集 Profile
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.78rem', color: gs.textSecondary, mb: 2, lineHeight: 1.5 }}>
        控制 AI 可使用的工具范围，减少不必要的工具调用以节省 token 和加快响应
      </Typography>
      <ToggleButtonGroup
        value={aiEngine.toolProfile}
        exclusive
        onChange={handleChange}
        size="small"
        sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}
      >
        {TOOL_PROFILE_OPTIONS.map(opt => (
          <ToggleButton key={opt.value} value={opt.value} sx={{
            px: 2, py: 0.75, borderRadius: 1.5, border: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            textTransform: 'none', fontSize: '0.78rem',
            '&.Mui-selected': { backgroundColor: isDark ? 'rgba(249,115,22,0.2)' : 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.5)' },
          }}>
            {opt.icon} {opt.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {TOOL_PROFILE_OPTIONS.map(opt => (
        <Box key={opt.value} sx={{
          mb: 1.5, p: 1.5, borderRadius: 2, border: '1px solid',
          borderColor: aiEngine.toolProfile === opt.value ? 'rgba(249,115,22,0.4)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
          backgroundColor: aiEngine.toolProfile === opt.value ? (isDark ? 'rgba(249,115,22,0.06)' : 'rgba(249,115,22,0.03)') : 'transparent',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: aiEngine.toolProfile === opt.value ? gs.textPrimary : gs.textSecondary }}>
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

const COMPACTION_STRATEGY_OPTIONS: { value: CompactionStrategy; label: string; desc: string }[] = [
  { value: 'semantic', label: '语义摘要', desc: '使用 AI 对历史对话进行语义理解和摘要，保留核心信息，质量最高但需消耗 token' },
  { value: 'extractive', label: '提取式', desc: '从历史消息中提取关键句子和关键词，保留原文片段，速度快无需额外 token' },
  { value: 'truncation', label: '截断', desc: '直接截断较早的历史消息，仅保留最近对话，最简单但可能丢失重要上下文' },
];

function CompactionSettings() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const { settings: aiEngine, updateSettings } = useAiEngineSettings();

  const handleEnabledChange = (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    updateSettings({
      aiEngine: {
        ...aiEngine,
        compaction: { ...aiEngine.compaction, enabled: checked },
      },
    });
  };

  const handleStrategyChange = (_: React.MouseEvent<HTMLElement>, newStrategy: string | null) => {
    if (newStrategy && newStrategy !== aiEngine.compaction.strategy) {
      updateSettings({
        aiEngine: {
          ...aiEngine,
          compaction: { ...aiEngine.compaction, strategy: newStrategy as CompactionStrategy },
        },
      });
    }
  };

  const handleThresholdChange = (_: Event, newValue: number | number[]) => {
    const value = newValue as number;
    updateSettings({
      aiEngine: {
        ...aiEngine,
        compaction: { ...aiEngine.compaction, thresholdRatio: value / 100 },
      },
    });
  };

  const handlePreserveChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 0 && value <= 50) {
      updateSettings({
        aiEngine: {
          ...aiEngine,
          compaction: { ...aiEngine.compaction, preserveRecent: value },
        },
      });
    }
  };

  const thresholdPercent = Math.round(aiEngine.compaction.thresholdRatio * 100);

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <CompressIcon sx={{ fontSize: 18, color: gs.textSecondary }} />
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: gs.textPrimary }}>
          上下文自动压缩
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.78rem', color: gs.textSecondary, mb: 2, lineHeight: 1.5 }}>
        当上下文窗口占用过高时自动压缩历史对话，节省 token 并避免超出模型上下文限制
      </Typography>

      <FormControlLabel
        control={
          <Switch
            checked={aiEngine.compaction.enabled}
            onChange={handleEnabledChange}
            size="small"
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: '#10b981' },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#10b981' },
            }}
          />
        }
        label={
          <Typography sx={{ fontSize: '0.8rem', color: gs.textPrimary }}>
            启用自动压缩
          </Typography>
        }
        sx={{ mb: 2 }}
      />

      {aiEngine.compaction.enabled && (
        <>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: gs.textPrimary, mb: 1.5 }}>
            压缩策略
          </Typography>
          <ToggleButtonGroup
            value={aiEngine.compaction.strategy}
            exclusive
            onChange={handleStrategyChange}
            size="small"
            sx={{ mb: 3, flexWrap: 'wrap', gap: 0.5 }}
          >
            {COMPACTION_STRATEGY_OPTIONS.map(opt => (
              <ToggleButton key={opt.value} value={opt.value} sx={{
                px: 2, py: 0.75, borderRadius: 1.5, border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                textTransform: 'none', fontSize: '0.78rem',
                '&.Mui-selected': { backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.5)' },
              }}>
                {opt.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {COMPACTION_STRATEGY_OPTIONS.map(opt => (
            <Box key={opt.value} sx={{
              mb: 1.5, p: 1.5, borderRadius: 2, border: '1px solid',
              borderColor: aiEngine.compaction.strategy === opt.value ? 'rgba(16,185,129,0.4)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
              backgroundColor: aiEngine.compaction.strategy === opt.value ? (isDark ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.03)') : 'transparent',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: aiEngine.compaction.strategy === opt.value ? gs.textPrimary : gs.textSecondary }}>
                  {opt.label}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: gs.textDisabled, fontFamily: 'monospace' }}>
                  {opt.value}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.73rem', color: gs.textSecondary, lineHeight: 1.5 }}>
                {opt.desc}
              </Typography>
            </Box>
          ))}

          <Box sx={{ mt: 3 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: gs.textPrimary, mb: 1 }}>
              触发阈值：{thresholdPercent}%
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary, mb: 2 }}>
              当上下文窗口占用达到此比例时触发自动压缩
            </Typography>
            <Box sx={{ px: 1, mb: 2 }}>
              <Slider
                value={thresholdPercent}
                onChange={handleThresholdChange}
                step={5}
                min={30}
                max={95}
                marks={[
                  { value: 30, label: '30%' },
                  { value: 50, label: '50%' },
                  { value: 75, label: '75%' },
                  { value: 90, label: '90%' },
                ]}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value}%`}
                sx={{
                  color: isDark ? 'rgba(16,185,129,0.8)' : 'rgba(16,185,129,1)',
                  '& .MuiSlider-markLabel': {
                    fontSize: '0.65rem',
                    color: gs.textDisabled,
                  },
                }}
              />
            </Box>
          </Box>

          <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              type="number"
              size="small"
              label="保留最近轮数"
              value={aiEngine.compaction.preserveRecent}
              onChange={handlePreserveChange}
              InputProps={{ inputProps: { min: 0, max: 50 } }}
              sx={{ width: 140 }}
            />
            <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
              压缩时保留最近 {aiEngine.compaction.preserveRecent} 轮对话不被压缩，确保上下文连贯性
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}

export default AISettingsDialog;