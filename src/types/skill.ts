/**
 * Skill 类型定义
 * 用于 AI 助手输入框的 @ 技能选择功能
 */

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string; // Material Icon 名称
  category: 'analysis' | 'report' | 'operations' | 'query';
}

export const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'skill-inventory-analysis',
    name: '库存分析',
    description: '分析库存情况，识别滞销和缺货风险',
    icon: 'Analytics',
    category: 'analysis',
  },
  {
    id: 'skill-transit-tracking',
    name: '在途跟踪',
    description: '查询在途订单状态和预计到达时间',
    icon: 'LocalShipping',
    category: 'query',
  },
  {
    id: 'skill-inbound-planning',
    name: '入库规划',
    description: '优化入库流程，提升仓库入库效率',
    icon: 'Input',
    category: 'operations',
  },
  {
    id: 'skill-outbound-optimization',
    name: '出库优化',
    description: '优化出库流程，降低出库错误率',
    icon: 'Output',
    category: 'operations',
  },
  {
    id: 'skill-warehouse-kpi',
    name: '仓库KPI',
    description: '查看仓库关键绩效指标和趋势',
    icon: 'BarChart',
    category: 'report',
  },
];
