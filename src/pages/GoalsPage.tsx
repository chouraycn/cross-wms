import React from 'react';
import Box from '@mui/material/Box';
import GoalPanel from '../components/Goal/GoalPanel';

/**
 * 目标管理页面
 *
 * 使用 contract-correct 的 GoalPanel 组件（src/components/Goal/GoalPanel.tsx），
 * 该组件自行调用真实后端 /api/goals/* 接口，无需页面传递数据。
 */
const GoalsPage: React.FC = () => {
  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      <GoalPanel />
    </Box>
  );
};

export default GoalsPage;
