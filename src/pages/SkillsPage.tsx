import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography,
  Button, IconButton, Dialog, DialogTitle, DialogContent, Tooltip,
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

// ===================== 技能页面 =====================

const SkillsPage: React.FC = () => {
  useAppSettings();
  const { showToast } = useToast();
  const navigate = useNavigate();

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

  // T03: 初始化时加载使用统计
  useEffect(() => {
    loadAllUsageStats().then(() => {
      setSkillVersion((v) => v + 1);
    }).catch((e) => {
      console.error('[SkillsPage] loadAllUsageStats failed:', e);
    });
  }, []);

  // 初始化时加载安全审查状态
  useEffect(() => {
    loadAuditStatuses().then(() => {
      setSkillVersion((v) => v + 1);
    }).catch((e) => {
      console.error('[SkillsPage] loadAuditStatuses failed:', e);
    });
  }, []);

  // T03: SSE 连接
  const evtRef = useRef<EventSource | null>(null);
  useEffect(() => {
    evtRef.current = api.connectSkillEvents();
    const es = evtRef.current;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data: SkillWatchEvent = JSON.parse(event.data);
        console.log('[SkillsPage] SSE event:', data);
        refreshFromRemote().then(() => {
          setSkillVersion((v) => v + 1);
          showToast('技能列表已更新', 'info');
        }).catch((e) => {
          console.error('[SkillsPage] refreshFromRemote failed:', e);
        });
      } catch (e) {
        console.error('[SkillsPage] SSE parse error:', e);
      }
    };

    es.addEventListener('message', handleMessage);

    return () => {
      es.removeEventListener('message', handleMessage);
      es.close();
    };
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'market' | 'installed' | 'chains'>('market');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
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
        console.error('[SkillsPage] loadChains failed:', e);
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

  // 初始化加载自动化数据
  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchAutomations();
        setAutomations(data);
        // 加载最新执行状态
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
      } catch (err) {
        console.error('Failed to load automations', err);
      }
    };
    load();
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

  // 过滤技能
  const filteredSkills = useMemo(() => {
    return skills.filter(skill => {
      const matchesSearch = searchQuery === '' ||
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (skill.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (skill.trigger || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
      const matchesTab = activeTab === 'market' || (activeTab === 'installed' && skill.source === 'user');
      return matchesSearch && matchesCategory && matchesTab;
    });
  }, [searchQuery, selectedCategory, skills, activeTab]);

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
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: '#1A1A1A', mb: 0.25 }}>
            技能
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#999' }}>
            赋予 CDF Know 更强大的能力
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box sx={{ position: 'relative' }}>
            <SearchInput
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
                setSuggestionsOpen(true);
              }}
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
                backgroundColor: '#fff',
                border: '1px solid #E5E7EB',
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
                      color: '#374151',
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: '#F9FAFB' },
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
                borderColor: '#E0E0E0',
                color: '#333',
                '&:hover': { borderColor: '#D0D0D0', backgroundColor: '#F9F9F9' },
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
                borderColor: '#E0E0E0',
                color: '#6B7280',
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
                border: '1px solid #E0E0E0',
                color: '#6B7280',
                '&:hover': { borderColor: '#7C3AED', color: '#7C3AED', bgcolor: '#FAF5FF' },
              }}
            >
              <TuneIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Main Tabs: 全部技能 / 已安装 / 技能链 */}
      <Box sx={{ display: 'flex', gap: 3, borderBottom: '1px solid #E8E8E8', mb: 3 }}>
        <Box
          onClick={() => setActiveTab('market')}
          sx={{
            py: 1.5,
            fontSize: '0.875rem',
            color: activeTab === 'market' ? '#1A1A1A' : '#666',
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'market' ? 500 : 400,
            transition: 'color 0.2s',
            '&:hover': { color: '#333' },
            '&::after': activeTab === 'market' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: '#1A1A1A',
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
            color: activeTab === 'installed' ? '#1A1A1A' : '#666',
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'installed' ? 500 : 400,
            transition: 'color 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            '&:hover': { color: '#333' },
            '&::after': activeTab === 'installed' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: '#1A1A1A',
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
            backgroundColor: '#F0F0F0',
            borderRadius: '9px',
            fontSize: '0.6875rem',
            color: '#666',
          }}>
            {stats.installed}
          </Box>
        </Box>
        <Box
          onClick={() => setActiveTab('chains')}
          sx={{
            py: 1.5,
            fontSize: '0.875rem',
            color: activeTab === 'chains' ? '#1A1A1A' : '#666',
            cursor: 'pointer',
            position: 'relative',
            fontWeight: activeTab === 'chains' ? 500 : 400,
            transition: 'color 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            '&:hover': { color: '#333' },
            '&::after': activeTab === 'chains' ? {
              content: '""',
              position: 'absolute',
              bottom: -1,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: '#1A1A1A',
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
            backgroundColor: '#F0F0F0',
            borderRadius: '9px',
            fontSize: '0.6875rem',
            color: '#666',
          }}>
            {chains.length}
          </Box>
        </Box>
      </Box>

      {activeTab === 'chains' ? (
        /* ========== 技能链视图 ========== */
        <Box sx={{ display: 'flex', gap: 3, height: 'calc(100vh - 220px)' }}>
          {/* 左侧：链列表 */}
          <Box sx={{ width: 240, flexShrink: 0, borderRight: '1px solid #F0F0F0', pr: 2, overflow: 'auto' }}>
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
                <AutoFixHighIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 2 }} />
                <Typography sx={{ fontSize: '0.95rem', color: '#6B7280', mb: 0.5 }}>
                  选择一个技能链或创建新的
                </Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
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
            <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: '#1A1A1A' }}>
              为你推荐
            </Typography>
            <Button
              size="small"
              startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
              sx={{ textTransform: 'none', fontSize: '0.8125rem', color: '#666', '&:hover': { color: '#333' } }}
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
                color: isActive ? '#1A1A1A' : '#666',
                backgroundColor: isActive ? '#F0F0F0' : 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: isActive ? 500 : 400,
                transition: 'all 0.2s',
                '&:hover': { backgroundColor: isActive ? '#F0F0F0' : '#F0F0F0' },
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
                backgroundColor: (CATEGORY_COLORS[category] ?? { color: '#6B7280' }).color,
              }} />
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: '#1A1A1A' }}>
                {CATEGORY_LABELS[category] || category}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#D1D5DB' }}>
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
          <AutoFixHighIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 2 }} />
          {selectedCategory !== 'all' && searchQuery === '' ? (
            <>
              <Typography sx={{ fontSize: '0.95rem', color: '#6B7280', mb: 0.5 }}>
                该分类下暂无技能
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
                尝试选择其他分类或查看全部技能
              </Typography>
            </>
          ) : (
            <>
              <Typography sx={{ fontSize: '0.95rem', color: '#6B7280', mb: 0.5 }}>
                未找到匹配的技能
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
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

      {/* 脉冲动画 */}
      <style>{`
        @keyframes pulse-dot {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

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
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F3F4F6' }}>
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
