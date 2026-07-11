import { API_BASE } from '../constants/api';
import { SSEStreamParser } from '../utils/sse/SSEStreamParser.js';
import type {
  SkillProposal,
  ProposalFilter,
  ProposalStats,
  CreateProposalParams,
  InstallProgress,
} from '../types/proposal';

const WORKSHOP_BASE = `${API_BASE}/skill-workshop`;

export async function getProposals(filter?: ProposalFilter): Promise<{ proposals: SkillProposal[]; count: number }> {
  const params = new URLSearchParams();
  if (filter?.status) params.set('status', filter.status);
  if (filter?.type) params.set('type', filter.type);
  if (filter?.skillName) params.set('skillName', filter.skillName);

  const url = params.toString() ? `${WORKSHOP_BASE}/proposals?${params}` : `${WORKSHOP_BASE}/proposals`;
  const response = await fetch(url);
  return response.json();
}

export async function getProposal(id: string): Promise<{ proposal: SkillProposal }> {
  const response = await fetch(`${WORKSHOP_BASE}/proposals/${id}`);
  return response.json();
}

export async function createProposal(params: CreateProposalParams): Promise<{ proposal: SkillProposal }> {
  const response = await fetch(`${WORKSHOP_BASE}/proposals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return response.json();
}

export async function applyProposal(id: string, reviewerId?: string): Promise<{ proposal: SkillProposal }> {
  const response = await fetch(`${WORKSHOP_BASE}/proposals/${id}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewerId }),
  });
  return response.json();
}

export async function rejectProposal(id: string, reason: string, reviewerId?: string): Promise<{ proposal: SkillProposal }> {
  const response = await fetch(`${WORKSHOP_BASE}/proposals/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, reviewerId }),
  });
  return response.json();
}

export async function quarantineProposal(id: string, reason: string): Promise<{ proposal: SkillProposal }> {
  const response = await fetch(`${WORKSHOP_BASE}/proposals/${id}/quarantine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return response.json();
}

export async function rollbackProposal(id: string): Promise<{ proposal: SkillProposal }> {
  const response = await fetch(`${WORKSHOP_BASE}/proposals/${id}/rollback`, {
    method: 'POST',
  });
  return response.json();
}

export async function getProposalStats(): Promise<{ stats: ProposalStats }> {
  const response = await fetch(`${WORKSHOP_BASE}/stats`);
  return response.json();
}

export async function installSkill(source: string, onProgress?: (progress: InstallProgress) => void): Promise<{ installId: string }> {
  const response = await fetch(`${WORKSHOP_BASE}/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });

  if (!response.ok) {
    throw new Error('安装请求失败');
  }

  const reader = response.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    // 使用共享 SSEStreamParser 处理跨 chunk 边界的 SSE 流
    const parser = new SSEStreamParser();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const decoded = decoder.decode(value, { stream: true });
      for (const sseEvent of parser.feed(decoded)) {
        try {
          const data = sseEvent.data;
          // SSEStreamParser 已自动尝试 JSON 解析，非 JSON 则保留原始字符串
          if (typeof data !== 'object' || data === null) continue;
          const progress = data as InstallProgress;
          onProgress?.(progress);
          if (progress.type === 'result') {
            return { installId: (progress.result as any)?.installId || '' };
          } else if (progress.type === 'error') {
            throw new Error(progress.error || '安装失败');
          }
        } catch (e) {
          console.error('Failed to parse SSE data:', e);
        }
      }
    }
  }

  return { installId: '' };
}

export async function cancelInstall(installId: string): Promise<{ cancelled: boolean }> {
  const response = await fetch(`${WORKSHOP_BASE}/install/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installId }),
  });
  return response.json();
}