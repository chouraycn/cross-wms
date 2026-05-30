import React from 'react';
import { Box, Typography, Divider } from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DescriptionIcon from '@mui/icons-material/Description';
import BarChartIcon from '@mui/icons-material/BarChart';
import ChatIcon from '@mui/icons-material/Chat';
import AnalyticsIcon from '@mui/icons-material/Analytics';

interface Skill {
  name: string;
  desc: string;
  icon: React.ReactNode;
  category: 'warehouse' | 'logistics' | 'analysis';
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

const SkillsPage: React.FC = () => {
  // 按类别分组
  const grouped = skills.reduce<Record<string, Skill[]>>((acc, skill) => {
    if (!acc[skill.category]) acc[skill.category] = [];
    acc[skill.category].push(skill);
    return acc;
  }, {});

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

      {/* 技能卡片网格 */}
      {Object.entries(grouped).map(([category, items]) => (
        <Box key={category} sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5 }}>
            {categoryLabels[category]}
          </Typography>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
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
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1.5,
                    backgroundColor: '#F3F4F6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: '#111827',
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
    </Box>
  );
};

export default SkillsPage;
