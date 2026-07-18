import type Database from 'better-sqlite3';
import type { QueryPlan, QueryPlanStep } from './types.js';

interface ExplainQueryPlanRow {
  id: number;
  parent: number;
  detail: string;
}

function parseDetail(detail: string): {
  table?: string;
  index?: string;
  isScan: boolean;
  isUsingIndex: boolean;
  isUsingTempBTree: boolean;
} {
  const result = {
    table: undefined as string | undefined,
    index: undefined as string | undefined,
    isScan: false,
    isUsingIndex: false,
    isUsingTempBTree: false,
  };

  if (detail.includes('SCAN')) {
    result.isScan = true;
    const tableMatch = detail.match(/SCAN (?:\w+ )?(\w+)/);
    if (tableMatch) result.table = tableMatch[1];
  }

  if (detail.includes('USING INDEX') || detail.includes('USING COVERING INDEX')) {
    result.isUsingIndex = true;
    const indexMatch = detail.match(/USING (?:COVERING )?INDEX (\w+)/);
    if (indexMatch) result.index = indexMatch[1];
    const tableMatch = detail.match(/SEARCH (\w+)/);
    if (tableMatch) result.table = tableMatch[1];
  }

  if (detail.includes('SEARCH')) {
    const tableMatch = detail.match(/SEARCH (\w+)/);
    if (tableMatch) result.table = tableMatch[1];
  }

  if (detail.includes('USE TEMP B-TREE')) {
    result.isUsingTempBTree = true;
  }

  return result;
}

export function explainQueryPlan(
  db: Database.Database,
  sql: string,
  params: unknown[] = []
): QueryPlanStep[] {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as ExplainQueryPlanRow[];
  return rows.map((row) => {
    const parsed = parseDetail(row.detail);
    return {
      id: row.id,
      parent: row.parent,
      detail: row.detail,
      ...parsed,
    };
  });
}

export function analyzeQueryPlan(
  db: Database.Database,
  sql: string,
  params: unknown[] = []
): QueryPlan {
  const steps = explainQueryPlan(db, sql, params);
  const hasFullTableScan = steps.some((step) => step.isScan);
  const usesIndex = steps.some((step) => step.isUsingIndex);

  return {
    sql,
    steps,
    hasFullTableScan,
    usesIndex,
  };
}

export function planUsesIndex(
  db: Database.Database,
  indexName: string,
  sql: string,
  params: unknown[] = []
): boolean {
  const plan = explainQueryPlan(db, sql, params);
  return plan.some((step) => step.index === indexName);
}

export function planIncludesDetail(
  db: Database.Database,
  expected: string,
  sql: string,
  params: unknown[] = []
): boolean {
  const plan = explainQueryPlan(db, sql, params);
  return plan.some((step) => step.detail.includes(expected));
}

export function getPlanSummary(plan: QueryPlan): string {
  const lines: string[] = [];
  lines.push(`Query Plan Summary:`);
  lines.push(`  SQL: ${plan.sql.length > 80 ? plan.sql.slice(0, 77) + '...' : plan.sql}`);
  lines.push(`  Steps: ${plan.steps.length}`);
  lines.push(`  Has full table scan: ${plan.hasFullTableScan ? 'YES' : 'NO'}`);
  lines.push(`  Uses index: ${plan.usesIndex ? 'YES' : 'NO'}`);
  lines.push('');
  lines.push('Plan details:');
  for (const step of plan.steps) {
    const indent = '  '.repeat(getDepth(step.id, plan.steps));
    lines.push(`${indent}${step.detail}`);
  }
  return lines.join('\n');
}

function getDepth(id: number, steps: QueryPlanStep[]): number {
  let depth = 0;
  let current = steps.find((s) => s.id === id);
  while (current && current.parent !== 0) {
    depth++;
    current = steps.find((s) => s.id === current!.parent);
  }
  return depth;
}

export interface IndexOptimizationSuggestion {
  table: string;
  columns: string[];
  reason: string;
  sql: string;
  estimatedBenefit: 'high' | 'medium' | 'low';
}

export function suggestIndexes(
  db: Database.Database,
  queries: Array<{ sql: string; params?: unknown[]; frequency?: number }>
): IndexOptimizationSuggestion[] {
  const suggestions: IndexOptimizationSuggestion[] = [];
  const seenSuggestions = new Set<string>();

  for (const query of queries) {
    const plan = analyzeQueryPlan(db, query.sql, query.params ?? []);

    for (const step of plan.steps) {
      if (step.isScan && step.table && !step.table.startsWith('sqlite_')) {
        const table = step.table;
        const suggestionKey = `scan:${table}`;
        if (!seenSuggestions.has(suggestionKey)) {
          seenSuggestions.add(suggestionKey);
          suggestions.push({
            table,
            columns: ['rowid'],
            reason: `Full table scan detected on ${table}`,
            sql: `-- Analyze query patterns on ${table} to create appropriate indexes`,
            estimatedBenefit: 'high',
          });
        }
      }

      if (step.isUsingTempBTree && step.table) {
        const suggestionKey = `temp:${step.table}`;
        if (!seenSuggestions.has(suggestionKey)) {
          seenSuggestions.add(suggestionKey);
          suggestions.push({
            table: step.table,
            columns: [],
            reason: `Temporary B-tree used for ${step.table}, consider covering index`,
            sql: `-- Consider adding a covering index for queries on ${step.table}`,
            estimatedBenefit: 'medium',
          });
        }
      }
    }
  }

  return suggestions;
}
