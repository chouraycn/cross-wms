/**
 * 仪表盘 API 服务层 — 代理导出
 *
 * 此文件已迁移至 src/capabilities/warehouse/dashboardApi.ts
 * 为保持向后兼容，此处从新位置 re-export 所有公共 API。
 *
 * 新代码请直接从 capabilities/warehouse 导入：
 *   import { dashboardApi } from '../capabilities/warehouse';
 */

export {
  type DataSourceConfig,
  type DocMapping,
  DashboardApiService,
  dashboardApi,
} from '../capabilities/warehouse/dashboardApi';
