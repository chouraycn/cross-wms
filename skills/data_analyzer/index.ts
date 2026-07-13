/**
 * data_analyzer — 数据分析（原生可执行入口）
 *
 * 调用方式：
 *   skill_data_analyzer({ sql })             → 运行 SQL 并做基础统计分析
 *   skill_data_analyzer({ content })          → 分析 JSON 数组文本
 *   skill_data_analyzer({ sql, fileName })    → 分析后将结论落盘（file_generateFile）
 *
 * 执行确定性统计：行数、列、缺失值、数值列 min/max/avg/sum，并给出 Markdown 结论。
 */
import type { SkillContext, SkillResult } from '../../server/types/skill-runtime.js';

export async function execute(
  params: Record<string, unknown>,
  ctx: SkillContext,
): Promise<SkillResult> {
  const startTime = Date.now();
  try {
    let rows: Record<string, unknown>[] = [];
    let source = '';

    if (params.sql) {
      const raw = await ctx.tools.run('db_query', { sql: String(params.sql) });
      const parsed = safeJson(raw);
      if (parsed && !Array.isArray(parsed) && (parsed as Record<string, unknown>).error) {
        return fail(String((parsed as Record<string, unknown>).error), startTime);
      }
      rows = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
      source = `SQL: ${String(params.sql).slice(0, 120)}`;
    } else if (params.content) {
      const parsed = safeJson(String(params.content));
      rows = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
      source = 'content (JSON array)';
    } else {
      return fail('请提供 sql 或 content 参数', startTime);
    }

    if (rows.length === 0) {
      return ok({ source, rowCount: 0, findings: ['数据集为空，无可分析内容。'] }, startTime);
    }

    const stats = analyze(rows);
    const findings = buildFindings(stats);

    let file: unknown = null;
    if (params.fileName) {
      const md = `# 数据分析报告\n\n> 来源：${source}\n\n行数：${rows.length}\n\n${findings}`;
      const raw = await ctx.tools.run('file_generateFile', {
        fileName: String(params.fileName),
        content: md,
        sessionId: ctx.sessionId,
        description: '数据分析报告',
      });
      file = safeJson(raw);
    }

    return ok({ source, rowCount: rows.length, stats, findings, file }, startTime);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), startTime);
  }
}

interface ColumnStat {
  name: string;
  nullCount: number;
  isNumeric: boolean;
  min?: number;
  max?: number;
  avg?: number;
  sum?: number;
}

function analyze(rows: Record<string, unknown>[]): { columns: ColumnStat[] } {
  const columns: ColumnStat[] = [];
  const keys = Object.keys(rows[0] ?? {});
  for (const key of keys) {
    let nullCount = 0;
    let isNumeric = true;
    const nums: number[] = [];
    for (const row of rows) {
      const v = row[key];
      if (v === null || v === undefined || v === '') {
        nullCount++;
        continue;
      }
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) {
        nums.push(n);
      } else {
        isNumeric = false;
      }
    }
    const stat: ColumnStat = { name: key, nullCount, isNumeric: nums.length > 0 && isNumeric };
    if (stat.isNumeric && nums.length > 0) {
      stat.min = Math.min(...nums);
      stat.max = Math.max(...nums);
      stat.avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      stat.sum = nums.reduce((a, b) => a + b, 0);
    }
    columns.push(stat);
  }
  return { columns };
}

function buildFindings(stats: { columns: ColumnStat[] }): string {
  const lines: string[] = ['## 关键发现', ''];
  for (const c of stats.columns) {
    const parts = [`- **${c.name}**：缺失 ${c.nullCount} 条`];
    if (c.isNumeric) {
      parts.push(`数值范围 ${c.min} ~ ${c.max}，均值 ${round(c.avg)}，合计 ${round(c.sum)}`);
    }
    lines.push(parts.join('；'));
  }
  lines.push('');
  lines.push('## 风险提示');
  const highNull = stats.columns.filter((c) => c.nullCount > 0);
  lines.push(
    highNull.length
      ? `存在缺失值的列：${highNull.map((c) => c.name).join('、')}，分析前建议先补全。`
      : '各列无明显缺失值。',
  );
  return lines.join('\n');
}

function round(n?: number): number {
  return n === undefined ? NaN : Math.round(n * 100) / 100;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function ok(data: unknown, t: number): SkillResult {
  return { success: true, data, metadata: { durationMs: Date.now() - t } };
}

function fail(err: string, t: number): SkillResult {
  return { success: false, error: err, metadata: { durationMs: Date.now() - t } };
}
