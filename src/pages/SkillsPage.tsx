import React, { useState, useMemo } from 'react';
import { Box, Typography, Divider, TextField, InputAdornment, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Button, CircularProgress, Alert } from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DescriptionIcon from '@mui/icons-material/Description';
import BarChartIcon from '@mui/icons-material/BarChart';
import ChatIcon from '@mui/icons-material/Chat';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useAppSettings } from '../contexts/AppSettingsContext';

interface Skill {
  name: string;
  desc: string;
  icon: React.ReactNode;
  category: 'warehouse' | 'logistics' | 'analysis';
  action?: () => void;
}

const skills: Skill[] = [
  { name: '仓库管理', desc: '仓储规划、库位优化、库存调配', icon: <WarehouseIcon sx={{ fontSize: 24 }} />, category: 'warehouse' },
  { name: '在途跟踪', desc: '物流追踪、时效分析、异常预警', icon: <LocalShippingIcon sx={{ fontSize: 24 }} />, category: 'logistics' },
  { name: '库龄分析', desc: '库龄预警、滞销处理、周转优化', icon: <InventoryIcon sx={{ fontSize: 24 }} />, category: 'analysis' },
  { name: '容积率优化', desc: '容积计算、预警设置、满仓方案', icon: <AssessmentIcon sx={{ fontSize: 24 }} />, category: 'warehouse' },
  { name: '报关助手', desc: 'HS编码查询、关税计算、单证生成', icon: <DescriptionIcon sx={{ fontSize: 24 }} />, category: 'logistics' },
  { name: '报表生成', desc: '自定义报表、数据导出、定时推送', icon: <BarChartIcon sx={{ fontSize: 24 }} />, category: 'analysis' },
  { name: '智能客服', desc: 'FAQ自动回复、工单分类、满意度分析', icon: <ChatIcon sx={{ fontSize: 24 }} />, category: 'analysis' },
  { name: '数据分析', desc: '趋势预测、异常检测、决策建议', icon: <AnalyticsIcon sx={{ fontSize: 24 }} />, category: 'analysis' },
];

const categoryLabels: Record<string, string> = {
  warehouse: '仓库管理',
  logistics: '物流追踪',
  analysis: '数据分析',
};

const categoryColors: Record<string, { bg: string; color: string }> = {
  warehouse: { bg: '#EFF6FF', color: '#2563EB' },
  logistics: { bg: '#F0FDF4', color: '#16A34A' },
  analysis: { bg: '#FAF5FF', color: '#7C3AED' },
};

const SkillsPage: React.FC = () => {
  const { settings } = useAppSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [executingSkill, setExecutingSkill] = useState<Skill | null>(null);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // 过滤技能
  const filteredSkills = useMemo(() => {
    return skills.filter(skill => {
      const matchesSearch = searchQuery === '' ||
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.desc.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  // 按类别分组
  const grouped = filteredSkills.reduce<Record<string, Skill[]>>((acc, skill) => {
    if (!acc[skill.category]) acc[skill.category] = [];
    acc[skill.category].push(skill);
    return acc;
  }, {});

  // 执行技能
  const handleExecute = async (skill: Skill) => {
    setExecutingSkill(skill);
    setExecutionResult(null);
    setIsExecuting(true);

    // 模拟执行
    setTimeout(() => {
      setIsExecuting(false);
      setExecutionResult({
        success: true,
        message: `「${skill.name}」技能执行完成。在实际应用中，这里会调用相应的服务完成具体任务。`,
      });
    }, 1500);
  };

  // 关闭对话框
  const handleCloseDialog = () => {
    setExecutingSkill(null);
    setExecutionResult(null);
    setIsExecuting(false);
  };

  return (
    <Box className="page-fade-in">
      {/* 页面标题 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>
          技能中心
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6B7280' }}>
          选择技能快速执行常见任务
        </Typography>
      </Box>

      {/* 搜索和筛选栏 */}
      <Box sx={{
        display: 'flex',
        gap: 2,
        mb: 3,
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
      }}>
        {/* 搜索框 */}
        <TextField
          size="small"
          placeholder="搜索技能..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{
            flex: 1,
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              backgroundColor: '#F9FAFB',
              '& fieldset': { borderColor: '#E5E7EB' },
              '&:hover fieldset': { borderColor: '#D1D5DB' },
              '&.Mui-focused fieldset': { borderColor: '#111827' },
            },
            '& .MuiInputBase-input': { fontSize: '0.875rem' },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: '#9CA3AF' }} />
              </InputAdornment>
            ),
          }}
        />

        {/* 分类筛选 */}
        <Box sx={{
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
        }}>
          <Chip
            label="全部"
            onClick={() => setSelectedCategory('all')}
            sx={{
              borderRadius: '6px',
              fontSize: '0.75rem',
              height: 32,
              backgroundColor: selectedCategory === 'all' ? '#111827' : '#F3F4F6',
              color: selectedCategory === 'all' ? '#fff' : '#374151',
              '&:hover': {
                backgroundColor: selectedCategory === 'all' ? '#111827' : '#E5E7EB',
              },
              transition: 'all 0.15s ease',
            }}
          />
          {Object.entries(categoryLabels).map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              onClick={() => setSelectedCategory(key)}
              sx={{
                borderRadius: '6px',
                fontSize: '0.75rem',
                height: 32,
                backgroundColor: selectedCategory === key ? categoryColors[key].bg : '#F3F4F6',
                color: selectedCategory === key ? categoryColors[key].color : '#374151',
                '&:hover': {
                  backgroundColor: selectedCategory === key ? categoryColors[key].bg : '#E5E7EB',
                },
                transition: 'all 0.15s ease',
              }}
            />
          ))}
        </Box>
      </Box>

      {/* 技能卡片网格 */}
      {Object.entries(grouped).map(([category, items]) => (
        <Box key={category} sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5 }}>
            {categoryLabels[category]}
          </Typography>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(auto-fill, minmax(260px, 1fr))',
              md: 'repeat(auto-fill, minmax(280px, 1fr))',
            },
            gap: 2,
          }}>
            {items.map((skill, index) => (
              <Box
                key={index}
                sx={{
                  border: '1px solid #E5E7EB',
                  borderRadius: 2,
                  p: 2.5,
                  backgroundColor: '#fff',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  '&:hover': {
                    borderColor: '#111827',
                    backgroundColor: '#FAFAFA',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    transform: 'translateY(-2px)',
                  }
                }}
                onClick={() => handleExecute(skill)}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1.5,
                    backgroundColor: categoryColors[skill.category].bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: categoryColors[skill.category].color,
                  }}>
                    {skill.icon}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem', mb: 0.5 }}>
                      {skill.name}
                    </Typography>
                    <Typography sx={{ color: '#6B7280', fontSize: '0.75rem', lineHeight: 1.6 }}>
                      {skill.desc}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
          <Divider sx={{ mt: 3 }} />
        </Box>
      ))}

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

      {/* 执行技能对话框 */}
      <Dialog
        open={executingSkill !== null}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {executingSkill && (
              <Box sx={{
                width: 40,
                height: 40,
                borderRadius: 1.5,
                backgroundColor: categoryColors[executingSkill.category].bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: categoryColors[executingSkill.category].color,
              }}>
                {executingSkill.icon}
              </Box>
            )}
            <Box>
              <Typography sx={{ fontWeight: 600, color: '#111827', fontSize: '1rem' }}>
                {executingSkill?.name}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                技能执行
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {isExecuting ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3 }}>
              <CircularProgress size={24} sx={{ color: '#111827' }} />
              <Typography sx={{ color: '#6B7280', fontSize: '0.875rem' }}>
                正在执行技能，请稍候...
              </Typography>
            </Box>
          ) : executionResult ? (
            <Alert
              severity={executionResult.success ? 'success' : 'error'}
              icon={executionResult.success ? <CheckCircleOutlineIcon fontSize="inherit" /> : undefined}
              sx={{
                borderRadius: '8px',
                '& .MuiAlert-message': { fontSize: '0.875rem' },
              }}
            >
              {executionResult.message}
            </Alert>
          ) : (
            <Typography sx={{ color: '#6B7280', fontSize: '0.875rem', py: 2 }}>
              {executingSkill?.desc}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {executionResult ? (
            <Button
              onClick={handleCloseDialog}
              variant="contained"
              sx={{
                backgroundColor: '#111827',
                '&:hover': { backgroundColor: '#1F2937' },
                textTransform: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
              }}
            >
              关闭
            </Button>
          ) : (
            <Button
              onClick={handleCloseDialog}
              sx={{
                color: '#6B7280',
                textTransform: 'none',
                fontSize: '0.875rem',
              }}
            >
              取消
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SkillsPage;
