import React from 'react';
import MemoryPanel from '../components/Memory/MemoryPanel';

/**
 * 记忆管理页面
 *
 * v9.1: 接入富面板 components/Memory/MemoryPanel（此前为未接线死代码）。
 * 富面板提供分类标签、重要性权重、时间衰减、MMR/质量评分、批量操作、
 * 详情抽屉、高级搜索等完整能力，后端 /api/memory 已补齐对应端点
 * （PUT /:id、POST /batch-delete、POST /batch-category）与富字段存储。
 */
const MemoryPage: React.FC = () => {
  return <MemoryPanel />;
};

export default MemoryPage;
