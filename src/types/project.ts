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
}

export interface ProjectFormData {
  name: string;
  description: string;
  status: 'active' | 'archived' | 'completed';
  category: 'custom' | 'template' | 'fixed';
}
