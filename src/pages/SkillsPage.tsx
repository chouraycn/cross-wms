import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography,
  Button, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
  useTheme, Menu, MenuItem, Divider, CircularProgress,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import TuneIcon from '@mui/icons-material/Tune';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import ExtensionIcon from '@mui/icons-material/Extension';
import LinkIcon from '@mui/icons-material/Link';
import GavelIcon from '@mui/icons-material/Gavel';
import ReplayIcon from '@mui/icons-material/Replay';
import CloseIcon from '@mui/icons-material/Close';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import InsightsIcon from '@mui/icons-material/Insights';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SkillRecommendationsPanel from '../components/Skills/SkillRecommendationsPanel';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { isMacOSApp, isPyWebView } from '../utils/env';
import type { TaskType, AutomationExecution } from '../services/automation';
import type { Automation } from '../services/automation/types';
import { fetchAutomations, triggerAutomationApi, fetchExecutions } from '../services/automation/api';
import { getAllSkills, onSkillsChange, setSkillStatus, loadAllUsageStats, refreshFromRemote, getUsageStats, loadAuditStatuses, refreshAuditForSkill } from '../stores/skillStore';
import type { Skill, SkillWatchEvent, UsageStats } from '../types/skill';
import type { DependencyCheckResult } from '../utils/dependencyChecker';
import { CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_COLORS } from '../constants/skillCategories';
import { findAllConflicts } from '../utils/skillConflict';
import * as api from '../services/api';
import type { OpenClawSkillEntry, OpenClawFilterOptions } from '../services/api';
import SkillCard from '../components/Skills/SkillCard';
import AddSkillDialog from '../components/Skills/AddSkillDialog';
import SkillPreviewDialog from '../components/Skills/SkillPreviewDialog';
import SkillUploadDialog from '../components/Skills/SkillUploadDialog';
import InstalledSkillList from '../components/Skills/InstalledSkillList';
import ChainList from '../components/SkillChain/ChainList';
import ChainBuilder from '../components/SkillChain/ChainBuilder';
import ChainExecutionPanel from '../components/SkillChain/ChainExecutionPanel';
import { chainStore } from '../stores/chainStore';
import { getAuditStatus } from '../stores/skillStore';
import { useToast } from '../contexts/ToastContext';
import { usePageFadeIn } from '../hooks/usePageFadeIn';
import SearchInput from '../components/Common/SearchInput';
import type { SkillChain } from '../types/skill';
// T05: 匹配引擎设置
import MatchConfigPanel from '../components/Matching/MatchConfigPanel';
import KeywordTriggerStatsPanel from '../components/Keywords/KeywordTriggerStatsPanel';
import { getGrayScale } from '../constants/theme';
// 插件管理整合
import { getPlugins, onPluginsChange, enablePluginAction, disablePluginAction, refreshFromApi, installPluginAction, uninstallPluginAction } from '../stores/pluginStore';
import type { PluginInfo } from '../services/plugins/api';
import WorkshopPanel from '../components/Skills/WorkshopPanel';
import SkillHotReloadPanel from '../components/Skills/SkillHotReloadPanel';

// ===================== 技能页面 =====================

// 主题色常量：提取自原硬编码值，便于统一调整
const COLORS = {
  darkBg: '#1F2937',
  white: '#FFFFFF',
  purple: '#7C3AED',
  gradientBg: 'linear-gradient(135deg, #EEF2FF 0%, #E0EBFF 100%)',
};

// 检测是否为原生 App / pywebview 桌面模式
const isNativeApp = (): boolean => {
  if (isMacOSApp()) return true;
  // @ts-ignore
  if (typeof window !== 'undefined' && window.cdfAppNative && window.cdfAppNative.isNative) return true;
  return isPyWebView();
};

const SkillsPage: React.FC<{ initialTab?: string }> = ({ initialTab }) => {
  useAppSettings();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const nativeApp = isNativeApp();

  // v1.7.87: DMG 下侧边栏收起状态，用于顶部避让红黄绿按钮
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    const onSidebarState = ((e: CustomEvent) => {
      setLeftSidebarCollapsed(e.detail?.collapsed ?? false);
    }) as EventListener;
    window.addEventListener('cdf-sidebar-state', onSidebarState);
    return () => window.removeEventListener('cdf-sidebar-state', onSidebarState);
  }, []);

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

  // T03: 延迟加载使用统计（非关键数据，延迟 0.3s 加载）
  useEffect(() => {
    const timer = setTimeout(() => {
      loadAllUsageStats().then(() => {
        setSkillVersion((v) => v + 1);
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // 延迟加载安全审查状态（非关键数据，延迟 0.5s 加载）
  useEffect(() => {
    const timer = setTimeout(() => {
      loadAuditStatuses().then(() => {
        setSkillVersion((v) => v + 1);
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const [installProgress, setInstallProgress] = useState<{
    installId: string;
    phase: string;
    message: string;
    percent: number;
    error?: string;
  } | null>(null);

  // T03: SSE 连接（延迟 0.8s 建立，避免影响初始化性能）
  const evtRef = useRef<import('../services/api').SSEConnection | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const sse = api.connectSkillEvents((rawData) => {
        try {
          const data: SkillWatchEvent = JSON.parse(rawData);
          if (data.type === 'skill-install-progress') {
            setInstallProgress({
              installId: data.installId!,
              phase: data.phase!,
              message: data.message!,
              percent: data.percent ?? 0,
              error: data.error,
            });
            if (data.phase === 'complete') {
              setTimeout(() => setInstallProgress(null), 3000);
              refreshFromRemote().then(() => setSkillVersion((v) => v + 1)).catch(() => {});
            } else if (data.phase === 'error') {
              showToast(data.message || '安装失败', 'error');
            }
          } else {
            refreshFromRemote().then(() => {
              setSkillVersion((v) => v + 1);
              showToast('技能列表已更新', 'info');
            }).catch(() => {});
          }
        } catch (e) {}
      });
      evtRef.current = sse;
    }, 800);

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
  const [activeTab, setActiveTab] = useState<'market' | 'builtin' | 'installed' | 'manage' | 'openclaw'>(initialTab as any || 'market');
  const [manageSubTab, setManageSubTab] = useState<'plugins' | 'chains' | 'workshop' | 'hotreload'>('plugins');
  const [sortBy, setSortBy] = useState<'popular' | 'latest'>('popular');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [dependencyMap, setDependencyMap] = useState<Record<string, DependencyCheckResult>>({});

  const [openclawSkills, setOpenclawSkills] = useState<OpenClawSkillEntry[]>([]);
  const [openclawCategories, setOpenclawCategories] = useState<string[]>([]);
  const [openclawTags, setOpenclawTags] = useState<string[]>([]);
  const [openclawSearchQuery, setOpenclawSearchQuery] = useState('');
  const [openclawSelectedCategory, setOpenclawSelectedCategory] = useState<string>('all');
  const [openclawSelectedTags, setOpenclawSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    if (activeTab !== 'openclaw') return;
    api.listOpenClawSkills().then((res) => {
      setOpenclawSkills(res.entries);
    }).catch(() => {});
    api.getOpenClawCategories().then((cats) => {
      setOpenclawCategories(cats);
    }).catch(() => {});
    api.getOpenClawTags().then((tags) => {
      setOpenclawTags(tags);
    }).catch(() => {});
  }, [activeTab]);

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
    if (activeTab === 'manage' && manageSubTab === 'chains') {
      chainStore.loadChains().then(() => {
        setChains(chainStore.getChains());
      }).catch((e) => {
        // console.error('[SkillsPage] loadChains failed:', e);
      });
    }
  }, [activeTab, manageSubTab, chainVersion]);

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
  // 上传技能 Dialog
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  // 添加按钮下拉菜单
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null);

  // v1.7.87: 技能预览弹窗
  const [previewSkill, setPreviewSkill] = useState<Skill | null>(null);
  const handlePreviewSkill = useCallback((id: string) => {
    const target = getAllSkills().find((s) => s.id === id);
    if (target) setPreviewSkill(target);
  }, []);
  const handleClosePreview = useCallback(() => setPreviewSkill(null), []);
  const handleUseSkill = useCallback((target: Skill) => {
    setPreviewSkill(null);
    navigate(`/chat?skill=${encodeURIComponent(target.id)}`);
  }, [navigate]);

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

  // 延迟加载自动化数据（非关键数据，延迟 0.6s 加载）
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
    }, 600);
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

  // 已安装标签：开关切换技能状态
  const handleToggleSkill = (skill: Skill, active: boolean) => {
    setSkillStatus(skill.id, active ? 'active' : 'available');
    setSkillVersion((v) => v + 1);
    showToast(`技能已${active ? '启用' : '禁用'}`, active ? 'success' : 'info');
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
      const matchesTab =
        activeTab === 'market' ? skill.source === 'builtin' :
        activeTab === 'builtin' ? skill.source === 'builtin' :
        activeTab === 'installed' ? skill.source === 'user' :
        true;
      return matchesSearch && matchesCategory && matchesTab;
    }).sort((a, b) => {
      if (activeTab !== 'manage') {
        if (sortBy === 'popular') {
          const aCount = a.marketplaceMetadata?.downloadCount ?? a.usageStats?.totalUses ?? 0;
          const bCount = b.marketplaceMetadata?.downloadCount ?? b.usageStats?.totalUses ?? 0;
          return bCount - aCount;
        }
        if (sortBy === 'latest') {
          const aTime = a.installedAt ?? 0;
          const bTime = b.installedAt ?? 0;
          return bTime - aTime;
        }
      }
      return 0;
    });
  }, [debouncedSearchQuery, selectedCategory, skills, activeTab, sortBy]);

  const [filteredOpenclawSkills, setFilteredOpenclawSkills] = useState<OpenClawSkillEntry[]>([]);
  const [openclawInstalledSkills, setOpenclawInstalledSkills] = useState<Set<string>>(new Set());
  const [openclawInstalling, setOpenclawInstalling] = useState<Set<string>>(new Set());
  const [openclawPreviewSkill, setOpenclawPreviewSkill] = useState<OpenClawSkillEntry | null>(null);
  const [openclawShowAllTags, setOpenclawShowAllTags] = useState(false);
  const [openclawSortBy, setOpenclawSortBy] = useState<'name' | 'category' | 'version'>('name');
  const [keywordStatsOpen, setKeywordStatsOpen] = useState(false);

  useEffect(() => {
    if (activeTab !== 'openclaw') {
      setFilteredOpenclawSkills([]);
      return;
    }
    api.listOpenClawLifecycle().then(res => {
      setOpenclawInstalledSkills(new Set(res.installed));
    }).catch(() => {});
    const options: OpenClawFilterOptions = {};
    if (openclawSearchQuery) options.search = openclawSearchQuery;
    if (openclawSelectedCategory !== 'all') options.category = openclawSelectedCategory;
    if (openclawSelectedTags.length > 0) options.tags = openclawSelectedTags;
    api.filterOpenClawSkills(options).then(res => {
      setFilteredOpenclawSkills(sortOpenClawSkills(res.entries, openclawSortBy));
    }).catch(() => {
      setFilteredOpenclawSkills(sortOpenClawSkills(openclawSkills, openclawSortBy));
    });
  }, [activeTab, openclawSearchQuery, openclawSelectedCategory, openclawSelectedTags, openclawSkills, openclawSortBy]);

  const sortOpenClawSkills = (skills: OpenClawSkillEntry[], sortBy: string): OpenClawSkillEntry[] => {
    const sorted = [...skills];
    switch (sortBy) {
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      case 'category':
        return sorted.sort((a, b) => {
          const catCompare = (a.category || '').localeCompare(b.category || '', 'zh-CN');
          if (catCompare !== 0) return catCompare;
          return a.name.localeCompare(b.name, 'zh-CN');
        });
      case 'version':
        return sorted.sort((a, b) => {
          const va = a.version || '0.0.0';
          const vb = b.version || '0.0.0';
          const pa = va.split('.').map(Number);
          const pb = vb.split('.').map(Number);
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] || 0;
            const nb = pb[i] || 0;
            if (na !== nb) return nb - na;
          }
          return 0;
        });
      default:
        return sorted;
    }
  };

  const handleOpenClawInstall = async (skill: OpenClawSkillEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (openclawInstalling.has(skill.id)) return;
    setOpenclawInstalling(prev => new Set(prev).add(skill.id));
    try {
      const result = await api.installOpenClawSkill({ sourceDir: skill.sourcePath, overwrite: true });
      if (result.success) {
        showToast(`${skill.name} 安装成功`, 'success');
        setOpenclawInstalledSkills(prev => new Set(prev).add(skill.id));
      } else {
        showToast(`安装失败: ${result.error || '未知错误'}`, 'error');
      }
    } catch (err) {
      showToast(`安装失败: ${err}`, 'error');
    } finally {
      setOpenclawInstalling(prev => {
        const next = new Set(prev);
        next.delete(skill.id);
        return next;
      });
    }
  };

  const handleOpenClawUninstall = async (skill: OpenClawSkillEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`确定要卸载技能 "${skill.name}" 吗？`)) return;
    try {
      const result = await api.uninstallOpenClawSkill(skill.id);
      if (result.success) {
        showToast(`${skill.name} 已卸载`, 'success');
        setOpenclawInstalledSkills(prev => {
          const next = new Set(prev);
          next.delete(skill.id);
          return next;
        });
      } else {
        showToast(`卸载失败: ${result.error || '未知错误'}`, 'error');
      }
    } catch (err) {
      showToast(`卸载失败: ${err}`, 'error');
    }
  };

  // 批量检测当前列表技能的环境依赖
  useEffect(() => {
    if (activeTab === 'manage') return;
    const ids = filteredSkills.map((s) => s.id);
    if (ids.length === 0) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      api.checkSkillDependencies(ids).then((data) => {
        if (!cancelled) setDependencyMap(data);
      }).catch(() => {});
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filteredSkills, activeTab]);

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

  // 推荐技能（仅市场/内置 Tab）
  const featuredSkills = useMemo(() => {
    return skills.filter(s => s.featured && s.status === 'active' && s.source === 'builtin');
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
    // 安装状态
    const installStatus = (() => {
      if (skill.source === 'builtin') return activeTab === 'market' ? 'market' : 'builtin';
      if (skill.installedAt) return 'installed';
      return 'custom';
    })();

    return (
      <SkillCard
        key={skill.id}
        skill={skill}
        automationInfo={autoInfo}
        isRunning={isRunning}
        isTriggering={isTriggering}
        latestExec={latestExec}
        onNavigate={handlePreviewSkill}
        onTrigger={handleTriggerAutomation}
        onActivate={handleActivateSkill}
        usageStats={usageStats}
        hasConflict={conflictInfo?.hasConflict ?? false}
        conflictCount={conflictInfo?.conflictCount}
        auditLevel={audit?.level ?? null}
        auditScore={audit?.score ?? null}
        version={skill.version || skill.standardFields?.version}
        installStatus={installStatus}
        dependencyResult={dependencyMap[skill.id]}
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

  const fadeCls = usePageFadeIn();

  return (
    <Box className={fadeCls} sx={{
      px: 1,
      // v1.7.87: DMG 下侧边栏收起时顶部避让红黄绿按钮，展开时保持正常间距
      pt: nativeApp && leftSidebarCollapsed ? 'calc(var(--pw-top, 0px) + 4px)' : '8px',
    }}>
      {/* Header: 标题 + 搜索 + 添加按钮 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, color: gs.textPrimary, mb: 0.25 }}>
            技能
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>
            安装与管理技能，在对话中扩展 CDFKnow的能力。
          </Typography>
          {installProgress && (
            <Box sx={{ mt: 2, p: 2, bgcolor: gs.bgHover, borderRadius: '8px', border: `1px solid ${gs.border}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <CircularProgress size={16} sx={{ color: gs.textSecondary }} />
                <Typography sx={{ fontSize: '0.75rem', color: gs.textSecondary }}>
                  {installProgress.message}
                </Typography>
              </Box>
              <Box sx={{ height: 4, bgcolor: gs.border, borderRadius: '2px', overflow: 'hidden' }}>
                <Box
                  sx={{
                    height: '100%',
                    bgcolor: gs.bgChatUser,
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                    width: `${installProgress.percent}%`,
                  }}
                />
              </Box>
              <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted, mt: 0.5 }}>
                {installProgress.percent}%
              </Typography>
            </Box>
          )}
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
            <Tooltip title="查看关键词触发统计">
              <IconButton
                size="small"
                onClick={() => setKeywordStatsOpen(true)}
                sx={{
                  ml: 0.5,
                  color: gs.textSecondary,
                  border: `1px solid ${gs.border}`,
                  borderRadius: '6px',
                }}
              >
                <AutoFixHighIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
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
          {activeTab !== 'manage' && (
            <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 16 }} />}
            onClick={(e) => setAddMenuAnchor(e.currentTarget)}
            sx={{
              textTransform: 'none',
              borderRadius: '6px',
              fontSize: '0.8125rem',
              py: 0.625,
              px: 2,
              backgroundColor: COLORS.darkBg,
              color: COLORS.white,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              '&:hover': { backgroundColor: '#374151', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' },
            }}
          >
            添加
          </Button>
          )}
          <Menu
            anchorEl={addMenuAnchor}
            open={Boolean(addMenuAnchor)}
            onClose={() => setAddMenuAnchor(null)}
            PaperProps={{ sx: { borderRadius: '10px', mt: 0.5, minWidth: 160 } }}
          >
            <MenuItem
              onClick={() => { setAddMenuAnchor(null); setAddDialogOpen(true); }}
              sx={{ fontSize: '0.8125rem', gap: 1 }}
            >
              <CreateNewFolderIcon sx={{ fontSize: 18, color: gs.textMuted }} />
              创建技能
            </MenuItem>
            <MenuItem
              onClick={() => { setAddMenuAnchor(null); setUploadDialogOpen(true); }}
              sx={{ fontSize: '0.8125rem', gap: 1 }}
            >
              <UploadFileIcon sx={{ fontSize: 18, color: gs.textMuted }} />
              上传技能
            </MenuItem>
          </Menu>
          <Tooltip title="匹配引擎设置">
            <IconButton
              onClick={() => setMatchConfigOpen(true)}
              sx={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                border: `1px solid ${gs.border}`,
                color: gs.textMuted,
                '&:hover': { borderColor: COLORS.purple, color: COLORS.purple, bgcolor: '#FAF5FF' },
              }}
            >
              <TuneIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          {/* 依赖图谱入口 */}
          <Tooltip title="依赖图谱">
            <IconButton
              onClick={() => navigate('/skills/dependency-graph')}
              sx={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                border: `1px solid ${gs.border}`,
                color: gs.textMuted,
                '&:hover': { borderColor: COLORS.purple, color: COLORS.purple, bgcolor: '#FAF5FF' },
              }}
            >
              <AccountTreeIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          {/* 使用分析入口 */}
          <Tooltip title="使用分析">
            <IconButton
              onClick={() => navigate('/skills/usage-analytics')}
              sx={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                border: `1px solid ${gs.border}`,
                color: gs.textMuted,
                '&:hover': { borderColor: COLORS.purple, color: COLORS.purple, bgcolor: '#FAF5FF' },
              }}
            >
              <InsightsIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          {/* 健康度仪表盘入口 */}
          <Tooltip title="健康度检查">
            <IconButton
              onClick={() => navigate('/skills/health')}
              sx={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                border: `1px solid ${gs.border}`,
                color: gs.textMuted,
                '&:hover': { borderColor: '#10B981', color: '#10B981', bgcolor: '#ECFDF5' },
              }}
            >
              <HealthAndSafetyIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          {/* 文档质量检查入口 */}
          <Tooltip title="文档质量检查">
            <IconButton
              onClick={() => navigate('/skills/doc-quality')}
              sx={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                border: `1px solid ${gs.border}`,
                color: gs.textMuted,
                '&:hover': { borderColor: '#0284C7', color: '#0284C7', bgcolor: '#F0F9FF' },
              }}
            >
              <MenuBookIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Banner: 精选职场技能 */}
      {activeTab === 'market' && (
        <Box sx={{
          mb: 4,
          px: 4,
          py: 3,
          borderRadius: '12px',
          background: COLORS.gradientBg,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <Box sx={{ position: 'relative', zIndex: 1 }}>
            <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#1E3A8A', mb: 0.5 }}>
              为你精选的职场技能
            </Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: '#4B5563', lineHeight: 1.5 }}>
              涵盖写作、效率、设计、数据分析等多种场景，一键安装。
            </Typography>
          </Box>
          <Box sx={{
            position: 'absolute',
            right: -20,
            top: -20,
            width: 140,
            height: 140,
            background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
            borderRadius: '50%',
          }} />
        </Box>
      )}

      {/* Main Tabs: 市场 / 内置 / 已安装 / 管理 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${gs.border}`, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 3 }}>
          {[
            { key: 'market', label: '市场' },
            { key: 'builtin', label: '内置' },
            { key: 'installed', label: '已安装', count: stats.installed },
            { key: 'openclaw', label: 'OpenClaw', count: openclawSkills.length },
            { key: 'manage', label: '管理' },
          ].map((tab) => (
            <Box
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              sx={{
                py: 1.5,
                fontSize: '0.9375rem',
                color: activeTab === tab.key ? gs.textPrimary : gs.textMuted,
                cursor: 'pointer',
                position: 'relative',
                fontWeight: activeTab === tab.key ? 600 : 400,
                transition: 'color 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                '&:hover': { color: gs.textSecondary },
                '&::after': activeTab === tab.key ? {
                  content: '""',
                  position: 'absolute',
                  bottom: -1,
                  left: 0,
                  right: 0,
                  height: 2,
                  backgroundColor: gs.textPrimary,
                  borderRadius: '1px',
                } : {},
              }}
            >
              {tab.label}
              {tab.count !== undefined && (
                <Box sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 18,
                  height: 18,
                  px: 0.5,
                  backgroundColor: gs.bgHover,
                  borderRadius: '9px',
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                  color: gs.textMuted,
                }}>
                  {tab.count}
                </Box>
              )}
            </Box>
          ))}
        </Box>
        {(activeTab === 'market' || activeTab === 'builtin') && (
          <Box sx={{ display: 'flex', gap: 0.5, bgcolor: gs.bgHover, borderRadius: '6px', p: 0.25 }}>
            {(['popular', 'latest'] as const).map((key) => (
              <Box
                key={key}
                onClick={() => setSortBy(key)}
                sx={{
                  px: 2,
                  py: 0.5,
                  fontSize: '0.75rem',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  color: sortBy === key ? gs.textPrimary : gs.textMuted,
                  backgroundColor: sortBy === key ? gs.bgPanel : 'transparent',
                  fontWeight: sortBy === key ? 500 : 400,
                  transition: 'all 0.2s',
                  boxShadow: sortBy === key ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                {key === 'popular' ? '热门' : '最新'}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {activeTab === 'openclaw' ? (
        /* ========== OpenClaw 技能视图 ========== */
        <Box sx={{ px: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
            <Box>
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: gs.textPrimary }}>
                OpenClaw 技能
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: gs.textMuted }}>
                来自 OpenClaw 社区的通用技能，共 {openclawSkills.length} 个
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Box sx={{ display: 'flex', gap: 0.5, bgcolor: gs.bgHover, borderRadius: '6px', p: 0.25 }}>
                {(['name', 'category', 'version'] as const).map((key) => (
                  <Box
                    key={key}
                    onClick={() => setOpenclawSortBy(key)}
                    sx={{
                      px: 1.5,
                      py: 0.5,
                      fontSize: '0.75rem',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      color: openclawSortBy === key ? gs.textPrimary : gs.textMuted,
                      backgroundColor: openclawSortBy === key ? gs.bgPanel : 'transparent',
                      fontWeight: openclawSortBy === key ? 500 : 400,
                      transition: 'all 0.2s',
                      boxShadow: openclawSortBy === key ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    }}
                  >
                    {key === 'name' ? '名称' : key === 'category' ? '分类' : '版本'}
                  </Box>
                ))}
              </Box>
              <SearchInput
                value={openclawSearchQuery}
                onChange={(value) => setOpenclawSearchQuery(value)}
                placeholder="搜索 OpenClaw 技能"
                width={200}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
            {['all', ...openclawCategories].map((key) => {
              const isActive = openclawSelectedCategory === key;
              return (
                <Box
                  key={key}
                  onClick={() => setOpenclawSelectedCategory(key)}
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
                  {key === 'all' ? '全部' : key}
                </Box>
              );
            })}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3, alignItems: 'center' }}>
            {(openclawShowAllTags ? openclawTags : openclawTags.slice(0, 20)).map((tag) => {
              const isSelected = openclawSelectedTags.includes(tag);
              return (
                <Box
                  key={tag}
                  onClick={() => {
                    setOpenclawSelectedTags((prev) =>
                      isSelected ? prev.filter((t) => t !== tag) : [...prev, tag]
                    );
                  }}
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    fontSize: '0.75rem',
                    color: isSelected ? gs.textPrimary : gs.textMuted,
                    backgroundColor: isSelected ? '#E0E7FF' : gs.bgHover,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: isSelected ? 500 : 400,
                    transition: 'all 0.2s',
                    '&:hover': { backgroundColor: isSelected ? '#C7D2FE' : gs.border },
                  }}
                >
                  #{tag}
                </Box>
              );
            })}
            {openclawTags.length > 20 && (
              <Box
                onClick={() => setOpenclawShowAllTags(!openclawShowAllTags)}
                sx={{
                  px: 1.5,
                  py: 0.5,
                  fontSize: '0.75rem',
                  color: gs.textSecondary,
                  backgroundColor: 'transparent',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 400,
                  transition: 'all 0.2s',
                  '&:hover': { backgroundColor: gs.bgHover },
                }}
              >
                {openclawShowAllTags ? '收起' : `+${openclawTags.length - 20} 更多`}
              </Box>
            )}
          </Box>

          <Box sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 2,
          }}>
            {filteredOpenclawSkills.map((skill) => (
              <Box
                key={skill.id}
                sx={{
                  backgroundColor: gs.bgPanel,
                  border: `1px solid ${gs.border}`,
                  borderRadius: '12px',
                  p: 2.5,
                  transition: 'all 0.2s',
                  '&:hover': { borderColor: gs.borderDarker, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
                  cursor: 'pointer',
                }}
                onClick={() => {
                  navigate(`/chat?skill=${encodeURIComponent(skill.id)}`);
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: gs.textPrimary }}>
                      {skill.name}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted }}>
                      {skill.category} · v{skill.version || '1.0.0'}
                    </Typography>
                    {skill.author && (
                      <Typography sx={{ fontSize: '0.6875rem', color: gs.textDisabled }}>
                        作者: {skill.author}
                      </Typography>
                    )}
                  </Box>
                  <ExtensionIcon sx={{ fontSize: 20, color: gs.borderDarker }} />
                </Box>
                <Typography sx={{ fontSize: '0.8125rem', color: gs.textSecondary, mb: 1.5, lineHeight: 1.4 }}>
                  {skill.description || '暂无描述'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {(skill.tags || []).slice(0, 3).map((tag) => (
                    <Box
                      key={tag}
                      sx={{
                        px: 1,
                        py: 0.25,
                        fontSize: '0.6875rem',
                        backgroundColor: gs.bgHover,
                        borderRadius: '3px',
                        color: gs.textMuted,
                      }}
                    >
                      {tag}
                    </Box>
                  ))}
                  {skill.trigger && (
                    <Box
                      sx={{
                        px: 1,
                        py: 0.25,
                        fontSize: '0.6875rem',
                        backgroundColor: '#FEF3C7',
                        borderRadius: '3px',
                        color: '#D97706',
                        fontWeight: 500,
                      }}
                    >
                      🔑 {skill.trigger}
                    </Box>
                  )}
                </Box>
                {skill.os && skill.os.length > 0 && (
                  <Box sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
                    {skill.os.map((os) => (
                      <Box
                        key={os}
                        sx={{
                          px: 1,
                          py: 0.25,
                          fontSize: '0.625rem',
                          backgroundColor: os === 'darwin' ? '#EFF6FF' : os === 'linux' ? '#ECFDF5' : gs.bgHover,
                          borderRadius: '3px',
                          color: os === 'darwin' ? '#2563EB' : os === 'linux' ? '#059669' : gs.textMuted,
                        }}
                      >
                        {os === 'darwin' ? 'macOS' : os === 'linux' ? 'Linux' : os}
                      </Box>
                    ))}
                  </Box>
                )}
                <Box sx={{ mt: 1.5, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenclawPreviewSkill(skill);
                    }}
                    sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                  >
                    预览
                  </Button>
                  {openclawInstalledSkills.has(skill.id) ? (
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={(e) => handleOpenClawUninstall(skill, e)}
                      sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                    >
                      卸载
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={(e) => handleOpenClawInstall(skill, e)}
                      disabled={openclawInstalling.has(skill.id)}
                      sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                    >
                      {openclawInstalling.has(skill.id) ? (
                        <>
                          <CircularProgress size={14} sx={{ mr: 1 }} />
                          安装中
                        </>
                      ) : (
                        '安装'
                      )}
                    </Button>
                  )}
                </Box>
              </Box>
            ))}
          </Box>

          {filteredOpenclawSkills.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <ExtensionIcon sx={{ fontSize: 48, color: gs.borderDarker, mb: 2 }} />
              <Typography sx={{ fontSize: '0.95rem', color: gs.textMuted, mb: 0.5 }}>
                未找到匹配的技能
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: gs.textDisabled }}>
                尝试调整搜索关键词或筛选条件
              </Typography>
            </Box>
          )}
        </Box>
      ) : activeTab === 'manage' ? (
        /* ========== 管理视图 ========== */
        <Box sx={{ px: 1 }}>
          <Box sx={{ display: 'flex', gap: 3, borderBottom: `1px solid ${gs.border}`, mb: 3 }}>
            {[
              { key: 'plugins', label: '插件', icon: ExtensionIcon, count: plugins.length },
              { key: 'chains', label: '技能链', icon: LinkIcon, count: chains.length },
              { key: 'workshop', label: '提案工作坊', icon: GavelIcon },
              { key: 'hotreload', label: '热重载', icon: ReplayIcon },
            ].map((tab) => (
              <Box
                key={tab.key}
                onClick={() => setManageSubTab(tab.key as any)}
                sx={{
                  py: 1.25,
                  fontSize: '0.875rem',
                  color: manageSubTab === tab.key ? gs.textPrimary : gs.textMuted,
                  cursor: 'pointer',
                  position: 'relative',
                  fontWeight: manageSubTab === tab.key ? 500 : 400,
                  transition: 'color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  '&:hover': { color: gs.textSecondary },
                  '&::after': manageSubTab === tab.key ? {
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
                <tab.icon sx={{ fontSize: 16 }} />
                {tab.label}
                {tab.count !== undefined && (
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
                    {tab.count}
                  </Box>
                )}
              </Box>
            ))}
          </Box>

          {manageSubTab === 'plugins' ? (
            <>
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
                      backgroundColor: COLORS.purple,
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
                            backgroundColor: plugin.status === 'enabled' ? gs.bgHover : COLORS.purple,
                            color: plugin.status === 'enabled' ? gs.textSecondary : COLORS.white,
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
            </>
          ) : manageSubTab === 'chains' ? (
            <Box sx={{ display: 'flex', gap: 3, height: 'calc(100vh - 220px)' }}>
              <Box sx={{ width: 240, flexShrink: 0, borderRight: `1px solid ${gs.border}`, pr: 2, overflow: 'auto' }}>
                <ChainList
                  chains={chains}
                  selectedId={selectedChainId}
                  onSelect={handleSelectChain}
                  onCreate={handleCreateChain}
                />
              </Box>
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
          ) : manageSubTab === 'workshop' ? (
            <Box sx={{ height: 'calc(100vh - 220px)', overflow: 'auto' }}>
              <WorkshopPanel gs={gs} isDark={isDark} />
            </Box>
          ) : (
            <SkillHotReloadPanel gs={gs} isDark={isDark} />
          )}
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

      {/* 智能推荐（基于协同过滤） */}
      {activeTab === 'market' && searchQuery === '' && selectedCategory === 'all' && (
        <Box sx={{ mb: 4, p: 2.5, borderRadius: '12px', border: `1px solid ${gs.border}`, backgroundColor: gs.bgPanel }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: gs.textPrimary, mb: 1.5 }}>
            智能推荐
          </Typography>
          <SkillRecommendationsPanel isDark={isDark} />
        </Box>
      )}

      {/* 分类标签行 — T05: 动态适配新增分类值（已安装标签使用分组列表，不显示分类筛选） */}
      {activeTab !== 'installed' && (
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
      )}

      {/* 技能卡片网格 */}
      {activeTab === 'installed' ? (
        <InstalledSkillList
          skills={filteredSkills}
          onToggle={handleToggleSkill}
          onNavigate={handlePreviewSkill}
        />
      ) : activeTab === 'market' && selectedCategory === 'all' ? (
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

      {/* 上传技能对话框 */}
      <SkillUploadDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
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
      {/* 关键词触发统计对话框 */}
      <Dialog
        open={keywordStatsOpen}
        onClose={() => setKeywordStatsOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { borderRadius: '12px', maxHeight: '90vh' },
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${gs.border}` }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>关键词触发统计</Typography>
          <IconButton size="small" onClick={() => setKeywordStatsOpen(false)}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 4 }}>
          <KeywordTriggerStatsPanel />
        </DialogContent>
      </Dialog>
      {/* v1.7.87: 技能预览弹窗 */}
      <SkillPreviewDialog
        open={!!previewSkill}
        skill={previewSkill}
        onClose={handleClosePreview}
        onUse={handleUseSkill}
      />
      {/* OpenClaw 技能预览弹窗 */}
      {openclawPreviewSkill && (
        <Dialog
          open={!!openclawPreviewSkill}
          onClose={() => setOpenclawPreviewSkill(null)}
          maxWidth="md"
          fullWidth
          sx={{ borderRadius: '12px' }}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${gs.border}` }}>
            <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>{openclawPreviewSkill.name}</Typography>
            <IconButton size="small" onClick={() => setOpenclawPreviewSkill(null)}>
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ p: 4, maxHeight: '70vh', overflowY: 'auto' }}>
            <Box sx={{ mb: 3 }}>
              <Typography sx={{ fontSize: '0.875rem', color: gs.textSecondary, lineHeight: 1.6 }}>
                {openclawPreviewSkill.description || '暂无描述'}
              </Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, mb: 3 }}>
              <Box>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mb: 0.5 }}>分类</Typography>
                <Typography sx={{ fontSize: '0.875rem', color: gs.textPrimary }}>{openclawPreviewSkill.category}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mb: 0.5 }}>版本</Typography>
                <Typography sx={{ fontSize: '0.875rem', color: gs.textPrimary }}>v{openclawPreviewSkill.version || '1.0.0'}</Typography>
              </Box>
              {openclawPreviewSkill.author && (
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mb: 0.5 }}>作者</Typography>
                  <Typography sx={{ fontSize: '0.875rem', color: gs.textPrimary }}>{openclawPreviewSkill.author}</Typography>
                </Box>
              )}
              {openclawPreviewSkill.os && openclawPreviewSkill.os.length > 0 && (
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mb: 0.5 }}>支持系统</Typography>
                  <Typography sx={{ fontSize: '0.875rem', color: gs.textPrimary }}>
                    {openclawPreviewSkill.os.map(os => os === 'darwin' ? 'macOS' : os === 'linux' ? 'Linux' : os).join(', ')}
                  </Typography>
                </Box>
              )}
            </Box>
            {openclawPreviewSkill.trigger && (
              <Box sx={{ mb: 3, p: 2, backgroundColor: '#FEF3C7', borderRadius: '8px' }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 500 }}>
                  🔑 触发关键词: {openclawPreviewSkill.trigger}
                </Typography>
              </Box>
            )}
            {openclawPreviewSkill.tags && openclawPreviewSkill.tags.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mb: 1 }}>标签</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {openclawPreviewSkill.tags.map(tag => (
                    <Box
                      key={tag}
                      sx={{
                        px: 1.5,
                        py: 0.5,
                        fontSize: '0.75rem',
                        backgroundColor: gs.bgHover,
                        borderRadius: '4px',
                        color: gs.textSecondary,
                      }}
                    >
                      {tag}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
            {openclawPreviewSkill.requires && openclawPreviewSkill.requires.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography sx={{ fontSize: '0.75rem', color: gs.textMuted, mb: 1 }}>依赖</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {openclawPreviewSkill.requires.map(req => (
                    <Box
                      key={req}
                      sx={{
                        px: 1.5,
                        py: 0.5,
                        fontSize: '0.75rem',
                        backgroundColor: '#EFF6FF',
                        borderRadius: '4px',
                        color: '#2563EB',
                      }}
                    >
                      {req}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 4, pb: 4, borderTop: `1px solid ${gs.border}` }}>
            <Button onClick={() => setOpenclawPreviewSkill(null)} sx={{ textTransform: 'none' }}>关闭</Button>
            <Button
              variant="contained"
              onClick={() => {
                setOpenclawPreviewSkill(null);
                navigate(`/chat?skill=${encodeURIComponent(openclawPreviewSkill.id)}`);
              }}
              sx={{ textTransform: 'none' }}
            >
              使用技能
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default SkillsPage;
