/**
 * ModelManagementCenterPage — 模型管理聚合页
 *
 * 收敛「AI 能力」分组（模型配置 / 链管理 / 语义匹配 / 人格规则）
 * 与设置面板「模型管理」对话框为同一套能力的两个入口，统一到此页。
 * 通过 Tab 在同一页面内组合，底层仍为原有独立页面组件。
 *
 * 「按 Provider 分组」「置顶/收藏/隐藏」等 Model 切换能力由 ModelsPage 提供。
 */

import React from 'react';
import MemoryIcon from '@mui/icons-material/Memory';
import CenterPage from '../components/Layout/CenterPage';
import ModelsPage from './ModelsPage';
import SkillChainsPage from './SkillChainsPage';
import MatchingPage from './MatchingPage';
import SoulRulesPage from './SoulRulesPage';

const ModelManagementCenterPage: React.FC = () => (
  <CenterPage
    title="模型管理"
    description="集中管理 AI 模型配置、技能链编排、语义匹配引擎与人格规则"
    icon={<MemoryIcon />}
    tabs={[
      { label: '模型配置', render: () => <ModelsPage /> },
      { label: '链管理', render: () => <SkillChainsPage /> },
      { label: '语义匹配', render: () => <MatchingPage /> },
      { label: '人格规则', render: () => <SoulRulesPage /> },
    ]}
  />
);

export default ModelManagementCenterPage;
