import React from 'react';
import { Box, Typography, Button, useTheme } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';

// ===================== Styles (projects.html inspired) =====================

const CARD_STYLE = {
  border: '1px solid',
  borderColor: '#E5E5E5',
  borderRadius: '12px',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  cursor: 'pointer',
  '&:hover': {
    borderColor: '#CCCCCC',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
};

const SECTION_TITLE_STYLE = { fontSize: '18px', fontWeight: 700, color: 'text.primary' };

// ===================== Data =====================

interface FixedRepo {
  key: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  progress?: number;
  meta?: string;
}

interface TemplateCard {
  key: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  path?: string;
}

const FIXED_REPOS: FixedRepo[] = [
  {
    key: 'warehouse',
    name: '仓库管理',
    description: '跨境仓库数据管理，包含仓库、在途、库存、报表',
    icon: <WarehouseOutlinedIcon sx={{ fontSize: 22, color: '#666' }} />,
    path: '/warehouses',
    progress: undefined,
    meta: '仪表盘 · 仓库列表 · 在途跟踪 · 库存查询',
  },
];

const TEMPLATES: TemplateCard[] = [
  {
    key: 'dashboard',
    name: '仪表盘',
    description: '仓库总览、容积率、在途统计',
    icon: <DashboardOutlinedIcon sx={{ fontSize: 22, color: '#666' }} />,
    path: '/dashboard',
  },
  {
    key: 'inventory',
    name: '库存管理',
    description: '库存查询、出入库记录、库存流水',
    icon: <InventoryOutlinedIcon sx={{ fontSize: 22, color: '#666' }} />,
    path: '/inventory',
  },
  {
    key: 'skills',
    name: '技能系统',
    description: 'AI 技能管理、导入导出、安全审查',
    icon: <AutoFixHighIcon sx={{ fontSize: 22, color: '#666' }} />,
    path: '/skills',
  },
  {
    key: 'automation',
    name: '自动化引擎',
    description: '定时任务、Webhook 触发、事件驱动',
    icon: <ScheduleIcon sx={{ fontSize: 22, color: '#666' }} />,
    path: '/automation',
  },
  {
    key: 'agent',
    name: 'Agent 应用',
    description: '智能体管理与配置',
    icon: <SmartToyOutlinedIcon sx={{ fontSize: 22, color: '#666' }} />,
    path: '/agent',
  },
  {
    key: 'docs',
    name: '腾讯文档',
    description: '在线文档授权与管理',
    icon: <DescriptionOutlinedIcon sx={{ fontSize: 22, color: '#666' }} />,
    path: '/tencent-docs',
  },
  {
    key: 'reports',
    name: '统计报表',
    description: '数据报表与导出',
    icon: <AssessmentOutlinedIcon sx={{ fontSize: 22, color: '#666' }} />,
    path: '/reports',
  },
  {
    key: 'chat',
    name: 'AI 对话',
    description: '智能助手、历史对话、上下文引用',
    icon: <ChatBubbleOutlineIcon sx={{ fontSize: 22, color: '#666' }} />,
    path: '/chat',
  },
  {
    key: 'settings',
    name: '系统设置',
    description: '外观主题、模型配置、仪表盘参数',
    icon: <SettingsOutlinedIcon sx={{ fontSize: 22, color: '#666' }} />,
    path: '/settings',
  },
];

// ===================== Component =====================

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const textMuted = isDark ? '#9CA3AF' : '#999';
  const borderColor = isDark ? '#2D2D2D' : '#E5E5E5';
  const cardBg = isDark ? '#1E1E1E' : '#FFFFFF';
  const repoSectionBg = isDark ? '#1A1A1A' : '#FAFAFA';
  const btnBg = isDark ? '#F3F4F6' : '#1A1A1A';
  const btnColor = isDark ? '#1A1A1A' : '#FFFFFF';
  const btnHover = isDark ? '#D1D5DB' : '#333333';

  return (
    <Box className="page-fade-in" sx={{ maxWidth: 1100, mx: 'auto' }}>
      {/* ===== Hero Section ===== */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          py: '60px 0 50px',
          pt: 1.5,
          pb: 5,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 32, fontWeight: 700, color: 'text.primary', mb: 0.5, letterSpacing: '-0.02em' }}>
            项目
          </Typography>
          <Typography sx={{ fontSize: 13, color: isDark ? '#9CA3AF' : '#666', mb: 3 }}>
            多人协同，打造超级团队
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 16 }} />}
            onClick={() => navigate('/warehouses')}
            disableElevation
            sx={{
              px: 3,
              py: 1.2,
              backgroundColor: btnBg,
              color: btnColor,
              borderRadius: '8px',
              fontSize: 13,
              fontWeight: 500,
              textTransform: 'none',
              '&:hover': { backgroundColor: btnHover },
            }}
          >
            新建项目
          </Button>
        </Box>

        {/* Hero Illustration */}
        <Box sx={{ width: 360, height: 240, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
          <svg viewBox="0 0 360 240" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <rect x="20" y="140" width="80" height="4" rx="2" fill="#1a1a1a" opacity="0.7" />
            <rect x="28" y="144" width="4" height="40" rx="1" fill="#1a1a1a" opacity="0.7" />
            <rect x="88" y="144" width="4" height="40" rx="1" fill="#1a1a1a" opacity="0.7" />
            <rect x="35" y="120" width="50" height="20" rx="2" stroke="#1a1a1a" strokeWidth="1.5" fill="none" opacity="0.6" />
            <rect x="40" y="124" width="40" height="12" rx="1" fill="#f0f0f0" opacity="0.5" />
            <circle cx="60" cy="90" r="16" stroke="#1a1a1a" strokeWidth="1.5" fill="none" opacity="0.6" />
            <path d="M40 130 Q40 110 60 110 Q80 110 80 130" stroke="#1a1a1a" strokeWidth="1.5" fill="none" opacity="0.6" />

            <rect x="140" y="140" width="80" height="4" rx="2" fill="#1a1a1a" opacity="0.7" />
            <rect x="155" y="120" width="50" height="20" rx="2" stroke="#1a1a1a" strokeWidth="1.5" fill="none" opacity="0.6" />
            <rect x="160" y="124" width="40" height="12" rx="1" fill="#f0f0f0" opacity="0.5" />
            <rect x="168" y="72" width="24" height="28" rx="6" stroke="#1a1a1a" strokeWidth="1.5" fill="none" opacity="0.6" />
            <circle cx="175" cy="84" r="3" fill="#2dd4a8" opacity="0.7" />
            <circle cx="185" cy="84" r="3" fill="#2dd4a8" opacity="0.7" />
            <rect x="164" y="76" width="4" height="8" rx="2" fill="#1a1a1a" opacity="0.6" />
            <rect x="192" y="76" width="4" height="8" rx="2" fill="#1a1a1a" opacity="0.6" />

            <rect x="260" y="140" width="80" height="4" rx="2" fill="#1a1a1a" opacity="0.7" />
            <rect x="275" y="120" width="50" height="20" rx="2" stroke="#1a1a1a" strokeWidth="1.5" fill="none" opacity="0.6" />
            <rect x="280" y="124" width="40" height="12" rx="1" fill="#f0f0f0" opacity="0.5" />
            <circle cx="300" cy="90" r="16" stroke="#1a1a1a" strokeWidth="1.5" fill="none" opacity="0.6" />
            <path d="M280 130 Q280 110 300 110 Q320 110 320 130" stroke="#1a1a1a" strokeWidth="1.5" fill="none" opacity="0.6" />

            <rect x="230" y="40" width="26" height="30" rx="4" fill="none" stroke="#1a1a1a" strokeWidth="1" opacity="0.5" />
            <line x1="236" y1="50" x2="250" y2="50" stroke="#1a1a1a" strokeWidth="1" opacity="0.5" />
            <line x1="236" y1="55" x2="248" y2="55" stroke="#1a1a1a" strokeWidth="1" opacity="0.5" />
          </svg>
        </Box>
      </Box>

      {/* ===== Fixed Repos Section ===== */}
      <Box
        sx={{
          mb: 5,
          p: 3,
          backgroundColor: repoSectionBg,
          borderRadius: '14px',
          border: `1px solid ${borderColor}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FolderOutlinedIcon sx={{ fontSize: 20, color: isDark ? '#9CA3AF' : '#666' }} />
            <Typography sx={SECTION_TITLE_STYLE}>固定项目仓库</Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon sx={{ fontSize: 14 }} />}
            onClick={() => navigate('/warehouses')}
            sx={{
              borderColor: isDark ? '#444' : '#D1D5DB',
              color: isDark ? '#D1D5DB' : '#374151',
              fontSize: 12,
              textTransform: 'none',
              borderRadius: '8px',
              '&:hover': {
                borderColor: isDark ? '#666' : '#9CA3AF',
                backgroundColor: isDark ? '#2D2D2D' : '#F3F4F6',
              },
            }}
          >
            关联仓库
          </Button>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {FIXED_REPOS.map((repo) => (
            <Box
              key={repo.key}
              onClick={() => navigate(repo.path)}
              sx={{
                ...CARD_STYLE,
                backgroundColor: cardBg,
                borderColor,
                p: 2.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    backgroundColor: isDark ? '#2D2D2D' : '#F5F5F5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {repo.icon}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                    {repo.name}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                    {repo.description}
                  </Typography>
                </Box>
              </Box>
              {repo.meta && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    pt: 1.5,
                    borderTop: `1px solid ${isDark ? '#2D2D2D' : '#F0F0F0'}`,
                  }}
                >
                  <Typography sx={{ fontSize: 11, color: textMuted }}>{repo.meta}</Typography>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      </Box>

      {/* ===== Template Gallery Section ===== */}
      <Box sx={{ mb: 5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography sx={SECTION_TITLE_STYLE}>全部功能</Typography>
          <Box sx={{ position: 'relative', width: 240 }}>
            <SearchIcon
              sx={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 16,
                color: textMuted,
              }}
            />
            <Box
              component="input"
              placeholder="搜索功能"
              sx={{
                width: '100%',
                height: 38,
                pl: 4.5,
                pr: 1.5,
                border: `1px solid ${isDark ? '#444' : '#E5E5E5'}`,
                borderRadius: '8px',
                fontSize: 13,
                color: 'text.primary',
                bgcolor: cardBg,
                outline: 'none',
                '&::placeholder': { color: textMuted },
                '&:focus': { borderColor: isDark ? '#666' : '#999' },
              }}
            />
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
          {TEMPLATES.map((tpl) => (
            <Box
              key={tpl.key}
              onClick={() => tpl.path && navigate(tpl.path)}
              sx={{
                ...CARD_STYLE,
                backgroundColor: cardBg,
                borderColor,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.75,
                p: 2.5,
              }}
            >
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: '10px',
                  backgroundColor: isDark ? '#2D2D2D' : '#F5F5F5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {tpl.icon}
              </Box>
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                  {tpl.name}
                </Typography>
                <Typography sx={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                  {tpl.description}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default ProjectsPage;
