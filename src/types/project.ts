/**
 * Project types for CDF Know Clow
 */

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived' | 'completed';
  category: 'custom' | 'template' | 'fixed';
  created_at: string;
  updated_at: string;
  /** 关联的专业 Agent ID（可选） */
  agentId?: string | null;
}

export interface ProjectFormData {
  name: string;
  description: string;
  status: 'active' | 'archived' | 'completed';
  category: 'custom' | 'template' | 'fixed';
  /** 关联的专业 Agent ID（可选） */
  agentId?: string;
}
