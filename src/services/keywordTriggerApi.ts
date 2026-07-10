import { API_BASE } from '../constants/api';

const KEYWORD_TRIGGER_BASE = `${API_BASE}/keyword-trigger`;

export interface KeywordTriggerConfig {
  enabled: boolean;
  matchMode: 'exact' | 'fuzzy' | 'semantic';
  threshold: number;
  maxTriggers: number;
  minKeywordLength: number;
  ignoreCase: boolean;
}

export interface KeywordMatchResult {
  keyword: string;
  skillId: string;
  skillName: string;
  weight: number;
  score: number;
}

export interface KeywordTriggerStats {
  totalTriggers: number;
  totalMatches: number;
  avgMatchTime: number;
  topKeywords: Array<{ keyword: string; count: number }>;
  topSkills: Array<{ skillId: string; skillName: string; count: number }>;
}

export interface KeywordInfo {
  keyword: string;
  skillId: string;
  skillName: string;
  weight: number;
}

export async function getKeywordTriggerConfig(): Promise<KeywordTriggerConfig> {
  const response = await fetch(`${KEYWORD_TRIGGER_BASE}/config`);
  return response.json();
}

export async function updateKeywordTriggerConfig(config: Partial<KeywordTriggerConfig>): Promise<{ ok: boolean; config: KeywordTriggerConfig }> {
  const response = await fetch(`${KEYWORD_TRIGGER_BASE}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return response.json();
}

export async function getKeywordTriggerStats(): Promise<KeywordTriggerStats> {
  const response = await fetch(`${KEYWORD_TRIGGER_BASE}/stats`);
  return response.json();
}

export async function getAllKeywords(): Promise<{ keywords: KeywordInfo[] }> {
  const response = await fetch(`${KEYWORD_TRIGGER_BASE}/keywords`);
  return response.json();
}

export async function testKeywordMatch(message: string): Promise<{ message: string; matches: KeywordMatchResult[] }> {
  const response = await fetch(`${KEYWORD_TRIGGER_BASE}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return response.json();
}

export async function refreshKeywordRules(): Promise<{ ok: boolean }> {
  const response = await fetch(`${KEYWORD_TRIGGER_BASE}/refresh`, {
    method: 'POST',
  });
  return response.json();
}