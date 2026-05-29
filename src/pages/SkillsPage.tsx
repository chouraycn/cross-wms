import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Switch,
  FormControlLabel,
  Chip,
  Card,
  CardContent,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';

// ===================== Skill 数据定义 =====================

interface SkillDef {
  id: string;
  name: string;
  description: string;
  category: string;
  keywords: string[];
}

const ALL_SKILLS: SkillDef[] = [
  {
    id: 'cross-border-tax',
    name: '跨境进口关税计算',
    description: '根据 HS 编码自动计算进口关税、增值税、消费税，支持多币种转换和完税价格计算',
    category: '财务',
    keywords: ['关税', '增值税', '消费税', 'HS编码', '完税价格', '进口'],
  },
  {
    id: 'data-analysis',
    name: '数据分析与报表',
    description: '对仓库运营数据进行分析，生成趋势报告、库存分析、出库效率等统计报表',
    category: '数据',
    keywords: ['分析', '报表', '统计', '趋势', '效率'],
  },
  {
    id: 'inventory-forecast',
    name: '库存预测',
    description: '基于历史出库数据和季节性因素，预测未来库存需求，辅助采购决策',
    category: '智能',
    keywords: ['预测', '库存', '采购', '需求', '季节性'],
  },
  {
    id: 'doc-processor',
    name: '文档处理',
    description: '解析和提取腾讯文档、Excel 等行业文件中的仓库数据，自动结构化入库',
    category: '工具',
    keywords: ['文档', '解析', '提取', 'Excel', '结构化'],
  },
  {
    id: 'alert-rules',
    name: '智能预警规则',
    description: '自定义多条件预警规则，支持库存水位、库龄、在途异常等多维度告警',
    category: '监控',
    keywords: ['预警', '规则', '告警', '异常', '水位'],
  },
  {
    id: 'auto-replenish',
    name: '自动补货建议',
    description: '结合安全库存、在途货物、历史消耗速度，自动生成补货建议清单',
    category: '智能',
    keywords: ['补货', '安全库存', '在途', '消耗', '建议'],
  },
  {
    id: 'rate-converter',
    name: '汇率转换与价格比对',
    description: '实时汇率转换，支持多渠道价格口径一致性比对，辅助跨境定价决策',
    category: '财务',
    keywords: ['汇率', '转换', '价格', '比对', '定价', '跨境'],
  },
  {
    id: 'compliance-check',
    name: '合规检查清单',
    description: '根据目的国法规自动生成进出口合规检查清单，降低通关风险',
    category: '合规',
    keywords: ['合规', '检查', '进出口', '通关', '法规'],
  },
];

// ===================== localStorage 持久化 =====================

const STORAGE_KEY = 'crosswms-skills-enabled';

function loadEnabled(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  // 默认全部启用
  return new Set(ALL_SKILLS.map((s) => s.id));
}

function saveEnabled(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

// ===================== 分类颜色映射 =====================

const CATEGORY_COLORS: Record<string, string> = {
  财务: '#27A17C',
  数据: '#3B82F6',
  智能: '#8B5CF6',
  工具: '#F59E0B',
  监控: '#EF4444',
  合规: '#06B6D4',
};

// ===================== 技能卡片 =====================

interface SkillCardProps {
  skill: SkillDef;
  enabled: boolean;
  onToggle: (id: string, enable: boolean) => void;
}

const SkillCard: React.FC<SkillCardProps> = ({ skill, enabled, onToggle }) => {
  const color = CATEGORY_COLORS[skill.category] || '#6B7280';

  return (
    <Card
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: enabled ? '#E5E7EB' : '#F3F4F6',
        borderRadius: 2,
        opacity: enabled ? 1 : 0.5,
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: '#D1D5DB',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        },
      }}
    >
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          {/* 左侧装饰线条 */}
          <Box
            sx={{
              width: 3,
              height: 40,
              borderRadius: 1.5,
              backgroundColor: color,
              flexShrink: 0,
              mt: 0.5,
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* 名称 + 分类标签 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                {skill.name}
              </Typography>
              <Chip
                label={skill.category}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.6rem',
                  backgroundColor: `${color}18`,
                  color,
                  fontWeight: 600,
                }}
              />
            </Box>
            {/* 描述 */}
            <Typography
              sx={{ fontSize: '0.75rem', color: '#6B7280', lineHeight: 1.5, mb: 1 }}
            >
              {skill.description}
            </Typography>
            {/* 关键词 */}
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {skill.keywords.slice(0, 4).map((kw) => (
                <Chip
                  key={kw}
                  label={kw}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.55rem',
                    backgroundColor: '#F3F4F6',
                    color: '#9CA3AF',
                  }}
                />
              ))}
            </Box>
          </Box>
          {/* 开关 */}
          <Switch
            checked={enabled}
            onChange={(e) => onToggle(skill.id, e.target.checked)}
            size="small"
            sx={{
              flexShrink: 0,
              mt: 0.5,
              '& .MuiSwitch-switchBase.Mui-checked': { color: color },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: color },
            }}
          />
        </Box>
      </CardContent>
    </Card>
  );
};

// ===================== 主页面 =====================

const SkillsPage: React.FC = () => {
  const [enabled, setEnabled] = useState<Set<string>>(() => loadEnabled());
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // 持久化
  useEffect(() => {
    saveEnabled(enabled);
  }, [enabled]);

  const handleToggle = useCallback((id: string, enable: boolean) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (enable) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // 去重提取分类
  const categories = useMemo(() => {
    const keys = new Set(ALL_SKILLS.map((s) => s.category));
    return [...keys];
  }, []);

  // 过滤 + 搜索
  const filtered = useMemo(() => {
    let list = ALL_SKILLS;
    if (categoryFilter) {
      list = list.filter((s) => s.category === categoryFilter);
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.keywords.some((kw) => kw.toLowerCase().includes(q))
      );
    }
    return list;
  }, [searchText, categoryFilter]);

  const enabledCount = enabled.size;
  const totalCount = ALL_SKILLS.length;

  return (
    <Box className="page-fade-in">
      {/* 页面标题 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.5,
            backgroundColor: '#F3F4F6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AutoFixHighIcon sx={{ fontSize: 20, color: '#111827' }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
            技能
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
            {enabledCount}/{totalCount} 个技能已启用
          </Typography>
        </Box>
      </Box>

      {/* 搜索 + 分类筛选 */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5 }}>
        <TextField
          placeholder="搜索技能名称、描述或关键词…"
          size="small"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          sx={{
            minWidth: 280,
            '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />
              </InputAdornment>
            ),
          }}
        />
        {categories.map((cat) => {
          const active = categoryFilter === cat;
          const color = CATEGORY_COLORS[cat] || '#6B7280';
          return (
            <Chip
              key={cat}
              label={cat}
              onClick={() => setCategoryFilter(active ? null : cat)}
              sx={{
                height: 32,
                fontSize: '0.75rem',
                backgroundColor: active ? color : '#F3F4F6',
                color: active ? '#FFFFFF' : '#6B7280',
                fontWeight: active ? 600 : 400,
                '&:hover': {
                  backgroundColor: active ? color : '#E5E7EB',
                },
                transition: 'all 0.15s ease',
              }}
            />
          );
        })}
        {categoryFilter && (
          <Chip
            label="清除筛选"
            onDelete={() => setCategoryFilter(null)}
            size="small"
            sx={{ height: 32, fontSize: '0.75rem' }}
          />
        )}
      </Box>

      {filtered.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 6,
            border: '1px dashed #E5E7EB',
            borderRadius: 2,
          }}
        >
          <AutoFixHighIcon sx={{ fontSize: 40, color: '#D1D5DB', mb: 1 }} />
          <Typography sx={{ color: '#9CA3AF', fontSize: '0.875rem' }}>
            {searchText ? '没有匹配的技能' : '暂无技能数据'}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              enabled={enabled.has(skill.id)}
              onToggle={handleToggle}
            />
          ))}
        </Box>
      )}

      {/* 底部说明 */}
      <Divider sx={{ my: 3 }} />
      <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', lineHeight: 1.6 }}>
        💡 技能开关仅控制当前系统功能模块的可见性和可用性。关闭某项技能后，对应的功能入口和数据处理将暂停。
      </Typography>
    </Box>
  );
};

export default SkillsPage;
