import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, TextField, InputAdornment,
  Button, Snackbar, Alert,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { loadAutomations, automationEngine } from '../services/automation';
import type { TaskType, AutomationExecution, EngineStateEvent } from '../services/automation';
import { getAllSkills, onSkillsChange, setSkillStatus } from '../stores/skillStore';
import type { Skill } from '../types/skill';
import { CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_COLORS } from '../constants/skillCategories';
import SkillCard from '../components/Skills/SkillCard';
import AddSkillDialog from '../components/Skills/AddSkillDialog';

// ===================== 技能页面 =====================

const SkillsPage: React.FC = () => {
  useAppSettings();
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

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'market' | 'installed'>('market');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  // 添加技能 Dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // ---- 响应式自动化状态 ----
  const [automationVersion, setAutomationVersion] = useState(0);
  const [runningTaskTypes, setRunningTaskTypes] = useState<Set<TaskType>>(new Set());
  const [latestExecByType, setLatestExecByType] = useState<Record<string, AutomationExecution | null>>({});
  const [triggeringTypes, setTriggeringTypes] = useState<Set<TaskType>>(new Set());
  const [toast, setToast] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' | 'info' }>({ open: false, msg: '', severity: 'info' });

  // 构建 automationMap
  const automationMap = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _v = automationVersion;
    const autos = loadAutomations();
    const map: Record<string, { active: boolean; id: string; name: string }> = {};
    for (const auto of autos) {
      map[auto.taskType] = {
        active: auto.status === 'ACTIVE',
        id: auto.id,
        name: auto.name,
      };
    }
    return map;
  }, [automationVersion]);

  // 初始化 + 监听引擎状态变更
  useEffect(() => {
    refreshLatestExec();

    const unsubscribe = automationEngine.onStateChange((event: EngineStateEvent) => {
      setAutomationVersion((v) => v + 1);

      if (event.type === 'execution-start') {
        const auto = loadAutomations().find((a) => a.id === event.automationId);
        if (auto) {
          setRunningTaskTypes((prev) => new Set(prev).add(auto.taskType));
        }
      } else {
        const auto = loadAutomations().find((a) => a.id === event.automationId);
        if (auto) {
          setRunningTaskTypes((prev) => {
            const next = new Set(prev);
            next.delete(auto.taskType);
            return next;
          });
          setTriggeringTypes((prev) => {
            const next = new Set(prev);
            next.delete(auto.taskType);
            return next;
          });
        }
        refreshLatestExec();
      }
    });

    return unsubscribe;
  }, []);

  const refreshLatestExec = useCallback(() => {
    const autos = loadAutomations();
    const map: Record<string, AutomationExecution | null> = {};
    for (const auto of autos) {
      const logs = automationEngine.getExecutionLog(auto.id);
      map[auto.taskType] = logs.length > 0 ? logs[0] : null;
    }
    setLatestExecByType(map);
  }, []);

  // 一键触发自动化
  const handleTriggerAutomation = async (skill: Skill, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!skill.automationTaskType) return;
    const autoInfo = automationMap[skill.automationTaskType];
    if (!autoInfo) return;

    setTriggeringTypes((prev) => new Set(prev).add(skill.automationTaskType as TaskType));
    try {
      const result = await automationEngine.triggerNow(autoInfo.id);
      setToast({ open: true, msg: `${skill.name} 执行${result.status === 'success' ? '成功' : '失败'}`, severity: result.status === 'success' ? 'success' : 'error' });
    } catch (err) {
      setToast({ open: true, msg: `${skill.name} 执行出错: ${err}`, severity: 'error' });
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
    setToast({ open: true, msg: '技能已启用', severity: 'success' });
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
      const matchesTab = activeTab === 'market' || skill.source === 'user';
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

  // 按 category 分组（全部 Tab 下）
  const grouped = useMemo(() => {
    const result: [string, Skill[]][] = [];
    for (const cat of CATEGORY_ORDER) {
      const items = filteredSkills.filter(s => s.category === cat);
      if (items.length > 0) result.push([cat, items]);
    }
    return result;
  }, [filteredSkills]);

  // 统计数据
  const stats = useMemo(() => {
    const active = skills.filter(s => s.status === 'active').length;
    const installed = skills.filter(s => s.source === 'user').length;
    const automated = skills.filter(s => s.automationTaskType && automationMap[s.automationTaskType]).length;
    const running = runningTaskTypes.size;
    return { active, installed, automated, running };
  }, [skills, automationMap, runningTaskTypes]);

  // 渲染技能卡片（委托给 SkillCard 组件）
  const renderSkillCard = (skill: Skill) => {
    const autoInfo = skill.automationTaskType ? automationMap[skill.automationTaskType] : undefined;
    const isRunning = skill.automationTaskType ? runningTaskTypes.has(skill.automationTaskType as TaskType) : false;
    const isTriggering = skill.automationTaskType ? triggeringTypes.has(skill.automationTaskType as TaskType) : false;
    const latestExec = skill.automationTaskType ? latestExecByType[skill.automationTaskType] : null;

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
            赋予 CrossWMS 更强大的能力
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box sx={{ position: 'relative' }}>
            <TextField
              size="small"
              placeholder="搜索技能"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSuggestionsOpen(true);
              }}
              onFocus={() => { if (searchQuery) setSuggestionsOpen(true); }}
              onBlur={() => { setTimeout(() => setSuggestionsOpen(false), 200); }}
              sx={{
                width: 200,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '8px',
                  backgroundColor: '#F0F0F0',
                  fontSize: '0.8125rem',
                  '& fieldset': { border: 'none' },
                  '&:hover': { backgroundColor: '#E8E8E8' },
                  '&.Mui-focused': { backgroundColor: '#fff', '& fieldset': { border: '1px solid #1A1A1A' } },
                },
                '& .MuiInputBase-input': { py: 0.75, fontSize: '0.8125rem', color: '#666' },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 16, color: '#999' }} />
                  </InputAdornment>
                ),
              }}
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
        </Box>
      </Box>

      {/* Main Tabs: 全部技能 / 已安装 */}
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
      </Box>

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

      {/* 分类标签行 */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
        {['all', ...CATEGORY_ORDER].map((key) => {
          const isActive = selectedCategory === key;
          const label = key === 'all' ? '全部' : CATEGORY_LABELS[key];
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
                backgroundColor: CATEGORY_COLORS[category].color,
              }} />
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: '#1A1A1A' }}>
                {CATEGORY_LABELS[category]}
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

      {/* 无结果提示 */}
      {filteredSkills.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <AutoFixHighIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 2 }} />
          <Typography sx={{ fontSize: '0.95rem', color: '#6B7280', mb: 0.5 }}>
            未找到匹配的技能
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
            尝试调整搜索关键词或筛选条件
          </Typography>
        </Box>
      )}

      {/* 添加技能对话框 */}
      <AddSkillDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdded={(name) => {
          setToast({ open: true, msg: `技能已添加: ${name}`, severity: 'success' });
          setSkillVersion((v) => v + 1);
        }}
      />

      {/* Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          severity={toast.severity}
          sx={{ fontSize: '0.8rem', borderRadius: 2 }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>

      {/* 脉冲动画 */}
      <style>{`
        @keyframes pulse-dot {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </Box>
  );
};

export default SkillsPage;
