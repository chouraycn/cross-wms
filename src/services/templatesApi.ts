/**
 * 模板市场 API — 前端调用后端模板接口
 */

import { request } from './api';

// ===================== Types =====================

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  tags: string[];
  workflow: Record<string, unknown>;
  author?: string;
  downloads: number;
  rating: number;
}

export interface TemplateFilter {
  category?: string;
  search?: string;
}

// ===================== API Functions =====================

/**
 * 获取模板列表
 */
export async function getTemplates(filter?: TemplateFilter): Promise<WorkflowTemplate[]> {
  const params = new URLSearchParams();

  if (filter?.category) params.append('category', filter.category);
  if (filter?.search) params.append('search', filter.search);

  const queryString = params.toString();
  const path = queryString ? `/api/templates?${queryString}` : `/api/templates`;

  const result = await request<{ data: WorkflowTemplate[]; total: number } | { error: string }>('GET', path);
  // 防御性处理：后端错误响应无 data 字段时返回空数组
  if (!result || !Array.isArray((result as { data?: WorkflowTemplate[] }).data)) {
    return [];
  }
  return (result as { data: WorkflowTemplate[] }).data;
}

/**
 * 获取单条模板详情
 */
export async function getTemplateById(id: string): Promise<WorkflowTemplate> {
  return request<WorkflowTemplate>('GET', `/api/templates/${id}`);
}

/**
 * 获取模板分类列表
 */
export async function getTemplateCategories(): Promise<string[]> {
  const result = await request<{ data: string[] } | { error: string }>('GET', '/api/templates/categories');
  // 防御性处理：后端错误响应无 data 字段时返回空数组
  if (!result || !Array.isArray((result as { data?: string[] }).data)) {
    return [];
  }
  return (result as { data: string[] }).data;
}

/**
 * 安装模板
 */
export async function installTemplate(id: string): Promise<{ success: boolean; workflow: Record<string, unknown> }> {
  return request<{ success: boolean; workflow: Record<string, unknown> }>('POST', `/api/templates/${id}/install`);
}

/**
 * 评分模板
 */
export async function rateTemplate(id: string, rating: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('POST', `/api/templates/${id}/rate`, { rating });
}

/**
 * 搜索模板
 */
export async function searchTemplates(query: string): Promise<WorkflowTemplate[]> {
  const result = await request<{ data: WorkflowTemplate[]; total: number } | { error: string }>('GET', `/api/templates/search?q=${encodeURIComponent(query)}`);
  // 防御性处理
  if (!result || !Array.isArray((result as { data?: WorkflowTemplate[] }).data)) {
    return [];
  }
  return (result as { data: WorkflowTemplate[] }).data;
}