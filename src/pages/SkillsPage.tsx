import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography,
  Button, IconButton, Dialog, DialogTitle, DialogContent, Tooltip,
  useTheme,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import TuneIcon from '@mui/icons-material/Tune';
import DownloadIcon from '@mui/icons-material/Download';
import { useAppSettings } from '../contexts/AppSettingsContext';
import type { TaskType, AutomationExecution } from '../services/automation';
import type { Automation } from '../services/automation/types';
import { fetchAutomations, triggerAutomationApi, fetchExecutions } from '../services/automation/api';
import { getAllSkills, onSkillsChange, setSkillStatus, loadAllUsageStats, refreshFromRemote, getUsageStats, loadAuditStatuses, refreshAuditForSkill } from '../stores/skillStore';
import type { Skill, SkillWatchEvent, UsageStats } from '../types/skill';
import { CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_COLORS } from '../constants/skillCategories';
import { findAllConflicts } from '../utils/skillConflict';
import * as api from '../services/api';
import SkillCard from '../components/Skills/SkillCard';
import AddSkillDialog from '../components/Skills/AddSkillDialog';
import StandardSkillInstaller from '../components/Skills/StandardSkillInstaller';
import ChainList from '../components/SkillChain/ChainList';
import ChainBuilder from '../components/SkillChain/ChainBuilder';
import ChainExecutionPanel from '../components/SkillChain/ChainExecutionPanel';
import { chainStore } from '../stores/chainStore';
import { getAuditStatus } from '../stores/skillStore';
import { useToast } from '../contexts/ToastContext';
import SearchInput from '../components/Common/SearchInput';
import type { SkillChain } from '../types/skill';
// T05: 匹配引擎设置
import MatchConfigPanel from '../components/Matching/MatchConfigPanel';
import { getGrayScale } from '../constants/theme';
// 插件管理整合
import { getPlugins, onPluginsChange, enablePluginAction, disablePluginAction, refreshFromApi, installPluginAction, uninstallPluginAction } from '../stores/pluginStore';
import type { PluginInfo } from '../services/plugins/api';
import ExtensionIcon from '@mui/icons-material/Extension';

// ===================== 技能页面 =====================

const SkillsPage: React.FC = () => {
  useAppSettings();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  // 技能列表（响应式，随 skillStore 变更刷新）
  const [skillVersion, setSkillVersion] = useState(0);
  const skills = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _v = skillVersion;
    return getAllSkills();
  }, [skillVersion]);

  // 监听 skillStore 变更
  useEffect(() => {
    const unsubscribe = onSkillsChange(() => {
      setSkillVersion((v) => v + 1);
    });
    return unsubscribe;
  }, []);

  // T03: 延迟加载使用统计（非关键数据，延迟 1.5s 加载）
  useEffect(() => {
    const timer = setTimeout(() => {
      loadAllUsageStats().then(() => {
        setSkillVersion((v) => v + 1);
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // 延迟加载安全审查状态（非关键数据，延迟 2s 加载）
  useEffect(() => {
    const timer = setTimeout(() => {
      loadAuditStatuses().then(() => {
        setSkillVersion((v) => v + 1);
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // T03: SSE 连接（延迟 3s 建立，避免影响初始化性能）
  const evtRef = useRef<import('../services/api').SSEConnection | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const sse = api.connectSkillEvents((rawData) => {
        try {
          const data: SkillWatchEvent = JSON.parse(rawData);
          refreshFromRemote().then(() => {
            setSkillVersion((v) => v + 1);
            showToast('技能列表已更新', 'info');
          }).catch(() => {});
        } catch (e) {}
      });
      evtRef.current = sse;
    }, 3000);

    return () => {
      clearTimeout(timer);
      if (evtRef.current) {
        evtRef.current.close();
      }
    };
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'market' | 'installed' | 'plugins' | 'chains'>('market');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setSuggestionsOpen(true);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(value);
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // 插件管理状态
  const [pluginVersion, setPluginVersion] = useState(0);
  const plugins = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _v = pluginVersion;
    return getPlugins();
  }, [pluginVersion]);

  useEffect(() => {
    const unsubscribe = onPluginsChange(() => {
      setPluginVersion((v) => v + 1);
    });
    return unsubscribe;
  }, []);
  // T05: 匹配引擎设置对话框
  const [matchConfigOpen, setMatchConfigOpen] = useState(false);

  // ---- 技能链状态 ----
  const [chains, setChains] = useState<SkillChain[]>([]);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [editingChain, setEditingChain] = useState<SkillChain | null>(null);
  const [execPanelOpen, setExecPanelOpen] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [chainVersion, setChainVersion] = useState(0);

  // ---- 技能链：加载 + 监听 ----
  useEffect(() => {
    if (activeTab === 'chains') {
      chainStore.loadChains().then(() => {
        setChains(chainStore.getChains());
      }).catch((e) => {
        // console.error('[SkillsPage] loadChains failed:', e);
      });
    }
  }, [activeTab, chainVersion]);

  useEffect(() => {
    const unsubscribe = chainStore.subscribe(() => {
      setChains(chainStore.getChains());
    });
    return unsubscribe;
  }, []);

  // ---- 技能链：操作函数 ----
  const handleCreateChain = useCallback(() => {
    const newChain: SkillChain = {
      id: '',
      name: '新技能链',
      description: '',
      nodes: [],
      failStrategy: 'stop',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingChain(newChain);
    setSelectedChainId(null);
  }, []);

  const handleSelectChain = useCallback((id: string) => {
    setSelectedChainId(id);
    const chain = chainStore.getChain(id);
    if (chain) {
      setEditingChain({ ...chain });
    }
  }, []);

  const handleSaveChain = useCallback(async () => {
    if (!editingChain) return;
    try {
      if (editingChain.id) {
        await chainStore.updateChain(editingChain.id, editingChain);
      } else {
        const created = await chainStore.createChain(editingChain);
        setEditingChain(created);
        setSelectedChainId(created.id);
      }
      setChainVersion((v) => v + 1);
      showToast('技能链已保存', 'success');
    } catch (e) {
      showToast('保存失败', 'error');
    }
  }, [editingChain]);

  const handleExecuteChain = useCallback(async () => {
    if (!editingChain?.id) return;
    try {
      const result = await api.executeSkillChain(editingChain.id);
      setExecutionId(result.executionId);
      setExecPanelOpen(true);
    } catch (e) {
      showToast('执行失败', 'error');
    }
  }, [editingChain]);

  const handleDeleteChain = useCallback(async () => {
    if (!selectedChainId) return;
    try {
      await chainStore.deleteChain(selectedChainId);
      setEditingChain(null);
      setSelectedChainId(null);
      setChainVersion((v) => v + 1);
      showToast('技能链已删除', 'success');
    } catch (e) {
      showToast('删除失败', 'error');
    }
  }, [selectedChainId]);

  const handleDuplicateChain = useCallback(async () => {
    if (!selectedChainId) return;
    try {
      const dup = await chainStore.duplicateChain(selectedChainId);
      setSelectedChainId(dup.id);
      setEditingChain({ ...dup });
      setChainVersion((v) => v + 1);
      showToast('技能链已复制', 'success');
    } catch (e) {
      showToast('复制失败', 'error');
    }
  }, [selectedChainId]);

  const handleAbortExecution = useCallback((_execId: string) => {
    setExecPanelOpen(false);
    setExecutionId(null);
    showToast('执行已终止', 'info');
  }, []);

  // 插件管理操作
  const handleTogglePlugin = useCallback(async (plugin: PluginInfo) => {
    try {
      if (plugin.status === 'enabled') {
        await disablePluginAction(plugin.id);
      } else {
        await enablePluginAction(plugin.id);
      }
      setPluginVersion((v) => v + 1);
      showToast(`${plugin.name} ${plugin.status === 'enabled' ? '已禁用' : '已启用'}`, 'success');
    } catch (e) {
      showToast(`${plugin.name} ${plugin.status === 'enabled' ? '禁用' : '启用'}失败`, 'error');
    }
  }, []);

  const handleRefreshPlugins = useCallback(async () => {
    try {
      await refreshFromApi();
      setPluginVersion((v) => v + 1);
      showToast('插件列表已刷新', 'success');
    } catch (e) {
      showToast('刷新插件列表失败', 'error');
    }
  }, []);

  const handleDeletePlugin = useCallback(async (plugin: PluginInfo) => {
    if (!window.confirm(`确定要删除插件 "${plugin.name}" 吗？`)) return;
    try {
      await uninstallPluginAction(plugin.id);
      setPluginVersion((v) => v + 1);
      showToast(`${plugin.name} 已删除`, 'success');
    } catch (e) {
      showToast(`${plugin.name} 删除失败`, 'error');
    }
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleUploadPlugin = useCallback(async () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await installPluginAction(file);
      setPluginVersion((v) => v + 1);
      showToast(`插件 "${file.name}" 上传成功`, 'success');
    } catch (e) {
      showToast(`插件上传失败: ${e}`, 'error');
    }
    e.target.value = '';
  }, []);

  // T04: 冲突信息 — 前端纯计算，skillId → { hasConflict, conflictCount }
  const conflictMap = useMemo(() => {
    const map = new Map<string, { hasConflict: boolean; conflictCount: number }>();
    const all = getAllSkills();
    for (const skill of all) {
      const conflicts = findAllConflicts(skill, all, 0.4);
      const count = conflicts.length;
      map.set(skill.id, { hasConflict: count > 0, conflictCount: count });
    }
    return map;
  }, [skillVersion]);

  // T04: 动态分类列表 — 包含 CATEGORY_ORDER 中的分类 + 用户技能新增的分类
  const dynamicCategories = useMemo(() => {
    const userCategories = new Set<string>();
    for (const skill of skills) {
      if (skill.category && !CATEGORY_ORDER.includes(skill.category)) {
        userCategories.add(skill.category);
      }
    }
    return [...CATEGORY_ORDER, ...Array.from(userCategories).sort()];
  }, [skills]);

  // 添加技能 Dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // 标准技能安装器 Dialog
  const [installerOpen, setInstallerOpen] = useState(false);

  // ---- 响应式自动化状态 ----
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [runningTaskTypes, setRunningTaskTypes] = useState<Set<TaskType>>(new Set());
  const [latestExecByType, setLatestExecByType] = useState<Record<string, AutomationExecution | null>>({});
  const [triggeringTypes, setTriggeringTypes] = useState<Set<TaskType>>(new Set());  // 构建 automationMap
  const automationMap = useMemo(() => {
    const map: Record<string, { active: boolean; id: string; name: string }> = {};
    for (const auto of automations) {
      if (auto.taskType) {
        map[auto.taskType] = {
          active: auto.status === 'ACTIVE',
          id: auto.id,
          name: auto.name,
        };
      }
    }
    return map;
  }, [automations]);

  // 延迟加载自动化数据（非关键数据，延迟 2.5s 加载）
  useEffect(() => {
    const timer = setTimeout(() => {
      const load = async () => {
        try {
          const data = await fetchAutomations();
          setAutomations(data);
          const map: Record<string, AutomationExecution | null> = {};
          for (const auto of data) {
            try {
              const result = await fetchExecutions(auto.id, 1);
              map[auto.taskType || ''] = result.data[0] || null;
            } catch {
              map[auto.taskType || ''] = null;
            }
          }
          setLatestExecByType(map);
        } catch {
          // ignore errors
        }
      };
      load();
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const refreshLatestExec = useCallback(async () => {
    const map: Record<string, AutomationExecution | null> = {};
    for (const auto of automations) {
      try {
        const result = await fetchExecutions(auto.id, 1);
        map[auto.taskType || ''] = result.data[0] || null;
      } catch {
        map[auto.taskType || ''] = null;
      }
    }
    setLatestExecByType(map);
  }, [automations]);

  // 一键触发自动化
  const handleTriggerAutomation = async (skill: Skill, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!skill.automationTaskType) return;
    const autoInfo = automationMap[skill.automationTaskType];
    if (!autoInfo) return;

    setTriggeringTypes((prev) => new Set(prev).add(skill.automationTaskType as TaskType));
    try {
      const result = await triggerAutomationApi(autoInfo.id);
      showToast(`${skill.name} 执行${result.result.success ? '成功' : '失败'}`, result.result.success ? 'success' : 'error');
      // 触发后刷新
      const data = await fetchAutomations();
      setAutomations(data);
      await refreshLatestExec();
    } catch (err) {
      showToast(`${skill.name} 执行出错: ${err}`, 'error');
    } finally {
      setTriggeringTypes((prev) => {
        const next = new Set(prev);
        next.delete(skill.automationTaskType as TaskType);
        return next;
      });
    }
  };

  // 启用技能
  const handleActivateSkill = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSkillStatus(id, 'active');
    setSkillVersion((v) => v + 1);
    showToast('技能已启用', 'success');
  };

  // 过滤技能（使用防抖后的查询，减少频繁过滤）
  const filteredSkills = useMemo(() => {
    return skills.filter(skill => {
      const matchesSearch = debouncedSearchQuery === '' ||
        skill.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        skill.desc.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        (skill.tags || []).some(t => t.toLowerCase().includes(debouncedSearchQuery.toLowerCase())) ||
        (skill.trigger || '').toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
      const matchesTab = activeTab === 'market' || (activeTab === 'installed' && skill.source === 'user');
      return matchesSearch && matchesCategory && matchesTab;
    });
  }, [debouncedSearchQuery, selectedCategory, skills, activeTab]);

  // 搜索联想建议（从技能名称、标签、触发词中提取）
  const searchSuggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 1) return [];
    const q = searchQuery.toLowerCase();
    const suggestions = new Set<string>();
    for (const skill of skills) {
      if (skill.name.toLowerCase().includes(q) && skill.name.toLowerCase() !== q) {
        suggestions.add(skill.name);
      }
      for (const tag of skill.tags || []) {
        if (tag.toLowerCase().includes(q) && !suggestions.has(tag)) {
          suggestions.add(tag);
        }
      }
      if (skill.trigger && skill.trigger.toLowerCase().includes(q)) {
        suggestions.add(skill.trigger);
      }
    }
    return Array.from(suggestions).slice(0, 6);
  }, [searchQuery, skills]);

  // 推荐技能
  const featuredSkills = useMemo(() => {
    return skills.filter(s => s.featured && s.status === 'active');
  }, [skills]);

  // 按 category 分组（全部 Tab 下） — 使用动态分类列表
  const grouped = useMemo(() => {
    const result: [string, Skill[]][] = [];
    for (const cat of dynamicCategories) {
      const items = filteredSkills.filter(s => s.category === cat);
      if (items.length > 0) result.push([cat, items]);
    }
    return result;
  }, [filteredSkills, dynamicCategories]);

  // 统计数据
  const stats = useMemo(() => {
    const active = skills.filter(s => s.status === 'active').length;
    const installed = skills.filter(s => s.source === 'user').length;
    const automated = skills.filter(s => s.automationTaskType && automationMap[s.automationTaskType]).length;
    const running = runningTaskTypes.size;
    return { active, installed, automated, running };
  }, [skills, automationMap, runningTaskTypes]);

  // T03: 获取技能使用统计的辅助函数
  const getSkillUsageStats = useCallback((skillId: string): UsageStats | undefined => {
    return getUsageStats(skillId);
  }, []);

  // 渲染技能卡片（委托给 SkillCard 组件）
  const renderSkillCard = (skill: Skill) => {
    const autoInfo = skill.automationTaskType ? automationMap[skill.automationTaskType] : undefined;
    const isRunning = skill.automationTaskType ? runningTaskTypes.has(skill.automationTaskType as TaskType) : false;
    const isTriggering = skill.automationTaskType ? triggeringTypes.has(skill.automationTaskType as TaskType) : false;
    const latestExec = skill.automationTaskType ? latestExecByType[skill.automationTaskType] : null;
    const usageStats = getSkillUsageStats(skill.id);
    // T04: 从 conflictMap 获取冲突信息
    const conflictInfo = conflictMap.get(skill.id);
    // T03: 从审计缓存获取审查信息
    const audit = getAuditStatus(skill.id);

    return (
      <SkillCard
        key={skill.id}
        skill={skill}
        automationInfo={autoInfo}
        isRunning={isRunning}
        isTriggering={isTriggering}
        latestExec={latestExec}
        onNavigate={(id) => navigate(`/skills/${id}`)}
        onTrigger={handleTriggerAutomation}
        onActivate={handleActivateSkill}
        usageStats={usageStats}
        hasConflict={conflictInfo?.hasConflict ?? false}
        conflictCount={conflictInfo?.conflictCount}
        auditLevel={audit?.level ?? null}
        auditScore={audit?.score ?? null}
        onAuditClick={async () => {
          if (skill.source === 'builtin') {
            // 内置技能无需外部审查，直接跳转查看审计结果
            navigate(`/skills/${skill.id}/audit`);
            return;
          }
          try {
            await refreshAuditForSkill(skill.id);
            setSkillVersion((v) => v + 1);
            showToast(`「${skill.name}」安全审查已完成`, 'success');
          } catch {
            showToast(`「${skill.name}」安全审查失败`, 'error');
          }
        }}
      />
    );
  };

  // ===================== 渲染 =====================

  return (
    <Box className="page-fade-in" sx={{ px: 1 }}>
      {/* Header: 标题 + 搜索 + 添加按钮 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: gs.textPrimary, mb: 0.25 }}>
            技能
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>
            赋予 CDF Know 更强大的能力
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box sx={{ position: 'relative' }}>
            <SearchInput
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="搜索技能"
              width={200}
              onFocus={() => { if (searchQuery) setSuggestionsOpen(true); }}
              onBlur={() => { setTimeout(() => setSuggestionsOpen(false), 200); }}
            />
            {/* 搜索联想下拉 */}
            {suggestionsOpen && searchSuggestions.length > 0 && (
              <Box sx={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                mt: 0.5,
                backgroundColor: gs.bgPanel,
                border: `1px solid ${gs.border}`,
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                zIndex: 100,
                overflow: 'hidden',
              }}>
                {searchSuggestions.map((suggestion) => (
                  <Box
                    key={suggestion}
                    onMouseDown={() => {
                      setSearchQuery(suggestion);
                      setSuggestionsOpen(false);
                    }}
                    sx={{
                      px: 2,
                      py: 1,
                      fontSize: '0.8125rem',
                      color: gs.textSecondary,
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: gs.bgHover },
                    }}
                  >
                    {suggestion}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          {activeTab !== 'chains' && (
            <>
            <Button
              variant="outlined"
              startIcon={<AddIcon sx={{ fontSize: 14 }} />}
              onClick={() => setAddDialogOpen(true)}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                py: 0.75,
                px: 2,
                borderColor: gs.border,
                color: gs.textSecondary,
                '&:hover': { borderColor: gs.borderDarker, backgroundColor: gs.bgHover },
              }}
            >
              添加技能
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
              onClick={() => setInstallerOpen(true)}
              sx={{
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                py: 0.75,
                px: 2,
                borderColor: gs.border,
                color: gs.textMuted,
                '&:hover': { borderColor: '#7C3AED', color: '#7C3AED', backgroundColor: '#FAF5FF' },
              }}
            >
              标准安装
            </Button>
            </>
          )}
          {/* T05: 匹配引擎设置入口 */}
          <Tooltip title="匹配引擎设置">
            <IconButton
              onClick={() => setMatchConfigOpen(true)}
              sx={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                border: `1px solid ${gs.border}`,
                color: gs.textMuted,
                '&:hover': { borderColor: '#7C3AED', color: '#7C3AED', bgcolor: '#FAF5FF' },
              }}
            >
              <TuneIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Main Tabs: 全部技能 / 已安装 / 技能链 */}
      <Box sx={{ display: 'flex', gap: 3, borderBottom: `1px solid ${gs.border}`, mb: 3 }}>
        <Box
          onClick={() => setActiveTab('market')}
          sx={{
            py: 1.5,
            fontSize: '0.875rem',
            color: activeTab === 'market' ? gs.textPrimary : gs.textMuted,
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'market' ? 500 : 400,
            transition: 'color 0.2s',
            '&:hover': { color: gs.textSecondary },
            '&::after': activeTab === 'market' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: gs.textPrimary,
            } : {},
          }}
        >
          全部技能
        </Box>
        <Box
          onClick={() => setActiveTab('installed')}
          sx={{
            py: 1.5,
            fontSize: '0.875rem',
            color: activeTab === 'installed' ? gs.textPrimary : gs.textMuted,
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'installed' ? 500 : 400,
            transition: 'color 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            '&:hover': { color: gs.textSecondary },
            '&::after': activeTab === 'installed' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: gs.textPrimary,
            } : {},
          }}
        >
          已安装
          <Box sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 18,
            height: 18,
            px: 0.625,
            backgroundColor: gs.bgHover,
            borderRadius: '9px',
            fontSize: '0.6875rem',
            color: gs.textMuted,
          }}>
            {stats.installed}
          </Box>
        </Box>
        <Box
          onClick={() => setActiveTab('plugins')}
          sx={{
            py: 1.5,
            fontSize: '0.875rem',
            color: activeTab === 'plugins' ? gs.textPrimary : gs.textMuted,
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'plugins' ? 500 : 400,
            transition: 'color 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            '&:hover': { color: gs.textSecondary },
            '&::after': activeTab === 'plugins' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: gs.textPrimary,
            } : {},
          }}
        >
          插件
          <Box sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 18,
            height: 18,
            px: 0.625,
            backgroundColor: gs.bgHover,
            borderRadius: '9px',
            fontSize: '0.6875rem',
            color: gs.textMuted,
          }}>
            {plugins.length}
          </Box>
        </Box>
        <Box
          onClick={() => setActiveTab('chains')}
          sx={{
            py: 1.5,
            fontSize: '0.875rem',
            color: activeTab === 'chains' ? gs.textPrimary : gs.textMuted,
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'chains' ? 500 : 400,
            transition: 'color 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            '&:hover': { color: gs.textSecondary },
            '&::after': activeTab === 'chains' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: gs.textPrimary,
            } : {},
          }}
        >
          技能链
          <Box sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 18,
            height: 18,
            px: 0.625,
            backgroundColor: gs.bgHover,
            borderRadius: '9px',
            fontSize: '0.6875rem',
            color: gs.textMuted,
          }}>
            {chains.length}
          </Box>
        </Box>
      </Box>

      {activeTab === 'plugins' ? (
        /* ========== 插件管理视图 ========== */
        <Box sx={{ px: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: gs.textPrimary }}>
              插件管理
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
                onClick={handleRefreshPlugins}
                sx={{
                  textTransform: 'none',
                  borderRadius: '8px',
                  fontSize: '0.8125rem',
                  py: 0.75,
                  px: 2,
                  borderColor: gs.border,
                  color: gs.textSecondary,
                  '&:hover': { borderColor: gs.borderDarker, backgroundColor: gs.bgHover },
                }}
              >
                刷新
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                onClick={handleUploadPlugin}
                sx={{
                  textTransform: 'none',
                  borderRadius: '8px',
                  fontSize: '0.8125rem',
                  py: 0.75,
                  px: 2,
                  backgroundColor: '#7C3AED',
                  '&:hover': { backgroundColor: '#6D28D9' },
                }}
              >
                上传插件
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".py,.zip"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </Box>
          </Box>
          {plugins.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <ExtensionIcon sx={{ fontSize: 48, color: gs.borderDarker, mb: 2 }} />
              <Typography sx={{ fontSize: '0.95rem', color: gs.textMuted, mb: 0.5 }}>
                暂无插件
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: gs.textDisabled }}>
                点击上方按钮上传插件文件（.py 或 .zip）
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              {plugins.map((plugin) => (
                <Box
                  key={plugin.id}
                  sx={{
                    backgroundColor: gs.bgPanel,
                    border: `1px solid ${gs.border}`,
                    borderRadius: '12px',
                    p: 2.5,
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: gs.borderDarker, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                    <Box>
                      <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: gs.textPrimary }}>
                        {plugin.name}
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                        {plugin.version || '未知版本'}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        px: 1.25,
                        py: 0.375,
                        borderRadius: '4px',
                        fontSize: '0.6875rem',
                        fontWeight: 500,
                        backgroundColor: plugin.status === 'enabled' ? '#DCFCE7' : '#FEF2F2',
                        color: plugin.status === 'enabled' ? '#16A34A' : '#DC2626',
                      }}
                    >
                      {plugin.status === 'enabled' ? '已启用' : '已禁用'}
                    </Box>
                  </Box>
                  <Typography sx={{ fontSize: '0.8125rem', color: gs.textSecondary, mb: 2 }}>
                    {plugin.description || '暂无描述'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      onClick={() => handleTogglePlugin(plugin)}
                      sx={{
                        textTransform: 'none',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        flex: 1,
                        backgroundColor: plugin.status === 'enabled' ? gs.bgHover : '#7C3AED',
                        color: plugin.status === 'enabled' ? gs.textSecondary : '#FFFFFF',
                        '&:hover': { backgroundColor: plugin.status === 'enabled' ? gs.border : '#6D28D9' },
                      }}
                    >
                      {plugin.status === 'enabled' ? '禁用' : '启用'}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => handleDeletePlugin(plugin)}
                      sx={{
                        textTransform: 'none',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        color: '#EF4444',
                        '&:hover': { backgroundColor: '#FEF2F2' },
                      }}
                    >
                      删除
                    </Button>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      ) : activeTab === 'chains' ? (
        /* ========== 技能链视图 ========== */
        <Box sx={{ display: 'flex', gap: 3, height: 'calc(100vh - 220px)' }}>
          {/* 左侧：链列表 */}
          <Box sx={{ width: 240, flexShrink: 0, borderRight: `1px solid ${gs.border}`, pr: 2, overflow: 'auto' }}>
            <ChainList
              chains={chains}
              selectedId={selectedChainId}
              onSelect={handleSelectChain}
              onCreate={handleCreateChain}
            />
          </Box>
          {/* 右侧：链构建器 */}
          <Box sx={{ flex: 1, overflow: 'auto', pr: 1 }}>
            {editingChain ? (
              <ChainBuilder
                chain={editingChain}
                onChange={setEditingChain}
                onSave={handleSaveChain}
                onExecute={handleExecuteChain}
                onDelete={handleDeleteChain}
                onDuplicate={handleDuplicateChain}
              />
            ) : (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <AutoFixHighIcon sx={{ fontSize: 48, color: gs.borderDarker, mb: 2 }} />
                <Typography sx={{ fontSize: '0.95rem', color: gs.textMuted, mb: 0.5 }}>
                  选择一个技能链或创建新的
                </Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: gs.textDisabled }}>
                  技能链可以将多个技能串联执行，自动传递数据
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      ) : (
        /* ========== 技能卡片视图 ========== */
        <>

      {/* 推荐区（仅在"全部技能"Tab下，且无搜索/分类过滤时显示） */}
      {activeTab === 'market' && searchQuery === '' && selectedCategory === 'all' && featuredSkills.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: gs.textPrimary }}>
              为你推荐
            </Typography>
            <Button
              size="small"
              startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
              sx={{ textTransform: 'none', fontSize: '0.8125rem', color: gs.textMuted, '&:hover': { color: gs.textSecondary } }}
            >
              换一换
            </Button>
          </Box>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 2,
          }}>
            {featuredSkills.slice(0, 6).map(renderSkillCard)}
          </Box>
        </Box>
      )}

      {/* 分类标签行 — T05: 动态适配新增分类值 */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
        {['all', ...dynamicCategories].map((key) => {
          const isActive = selectedCategory === key;
          const label = key === 'all' ? '全部' : CATEGORY_LABELS[key] || key;
          return (
            <Box
              key={key}
              onClick={() => setSelectedCategory(key)}
              sx={{
                px: 1.75,
                py: 0.75,
                fontSize: '0.8125rem',
                color: isActive ? gs.textPrimary : gs.textMuted,
                backgroundColor: isActive ? gs.bgHover : 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: isActive ? 500 : 400,
                transition: 'all 0.2s',
                '&:hover': { backgroundColor: gs.bgHover },
              }}
            >
              {label}
            </Box>
          );
        })}
      </Box>

      {/* 技能卡片网格 */}
      {activeTab === 'market' && selectedCategory === 'all' ? (
        grouped.map(([category, items]) => (
          <Box key={category} sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Box sx={{
                width: 3,
                height: 14,
                borderRadius: 0.5,
                backgroundColor: (CATEGORY_COLORS[category] ?? { color: gs.textMuted }).color,
              }} />
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: gs.textPrimary }}>
                {CATEGORY_LABELS[category] || category}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: gs.borderDarker }}>
                {items.length}
              </Typography>
            </Box>
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 2,
            }}>
              {items.map(renderSkillCard)}
            </Box>
          </Box>
        ))
      ) : (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 2,
        }}>
          {filteredSkills.map(renderSkillCard)}
        </Box>
      )}

      {/* T05: 无结果提示 — 区分「分类下无技能」和「搜索无结果」 */}
      {filteredSkills.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <AutoFixHighIcon sx={{ fontSize: 48, color: gs.borderDarker, mb: 2 }} />
          {selectedCategory !== 'all' && searchQuery === '' ? (
            <>
              <Typography sx={{ fontSize: '0.95rem', color: gs.textMuted, mb: 0.5 }}>
                该分类下暂无技能
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: gs.textDisabled }}>
                尝试选择其他分类或查看全部技能
              </Typography>
            </>
          ) : (
            <>
              <Typography sx={{ fontSize: '0.95rem', color: gs.textMuted, mb: 0.5 }}>
                未找到匹配的技能
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: gs.textDisabled }}>
                尝试调整搜索关键词或筛选条件
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* 添加技能对话框 */}
      <AddSkillDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdded={(name) => {
          showToast(`技能已添加: ${name}`, 'success');
          setSkillVersion((v) => v + 1);
        }}
      />

      {/* 标准技能安装器 */}
      <StandardSkillInstaller
        open={installerOpen}
        onClose={() => setInstallerOpen(false)}
        onInstalled={(skillId) => {
          showToast(`技能已安装: ${skillId}`, 'success');
          setSkillVersion((v) => v + 1);
        }}
      />
      </>
    )}

      {/* 执行进度面板 */}
      {editingChain && (
        <ChainExecutionPanel
          open={execPanelOpen}
          executionId={executionId}
          chainName={editingChain.name}
          onClose={() => { setExecPanelOpen(false); setExecutionId(null); }}
          onAbort={handleAbortExecution}
        />
      )}

      {/* T05: 匹配引擎设置对话框 */}
      <Dialog
        open={matchConfigOpen}
        onClose={() => setMatchConfigOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: '12px', maxHeight: '80vh' },
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${gs.border}` }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>匹配引擎设置</Typography>
          <IconButton size="small" onClick={() => setMatchConfigOpen(false)}>
            <TuneIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <MatchConfigPanel onConfigSaved={() => {}} />
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default SkillsPage;
