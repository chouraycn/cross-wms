/**
 * wms_daily_report — 每日运营日报（原生可执行入口）
 *
 * 调用方式：skill_wms_daily_report({ fileName? })
 *
 * 汇总：库存概览 + 低库存 TOP10 + 异常单据扫描（表不存在时优雅降级），
 * 生成 Markdown 日报。传 fileName 时通过 file_generateFile 落盘并返回下载链接。
 */
import type { SkillContext, SkillResult } from '../../server/types/skill-runtime.js';

export async function execute(
  params: Record<string, unknown>,
  ctx: SkillContext,
): Promise<SkillResult> {
  const startTime = Date.now();
  try {
    const today = new Date().toISOString().slice(0, 10);

    const overviewRaw = await ctx.tools.run('wms_inventory', {});
    const overview = (safeJson(overviewRaw) || {}) as Record<string, unknown>;

    const lowSql =
      `SELECT sku, name, warehouse_id, quantity, safety_stock FROM inventory ` +
      `WHERE quantity < safety_stock ORDER BY quantity ASC LIMIT 10`;
    const lowParsed = safeJson(await ctx.tools.run('db_query', { sql: lowSql }));
    const lowRows = Array.isArray(lowParsed) ? lowParsed : [];

    // 异常单据扫描（表可能不存在，优雅降级）
    let anomalyNote = '未检测到异常单据表，跳过异常扫描。';
    const anomalyRaw = await ctx.tools.run('db_query', {
      sql:
        `SELECT status, COUNT(*) AS cnt FROM inbound_orders ` +
        `WHERE status IN ('pending','suspended','failed') GROUP BY status`,
    });
    const anomalyParsed = safeJson(anomalyRaw);
    if (Array.isArray(anomalyParsed) && anomalyParsed.length) {
      anomalyNote = `待处理/挂起/校验失败单据：${JSON.stringify(anomalyParsed)}`;
    } else if (anomalyParsed && (anomalyParsed as Record<string, unknown>).error) {
      anomalyNote = `异常单据扫描跳过（${(anomalyParsed as Record<string, unknown>).error}）`;
    }

    const report = buildReport(today, overview, lowRows, anomalyNote);

    // 可选落盘
    let file: unknown = null;
    if (params.fileName) {
      const raw = await ctx.tools.run('file_generateFile', {
        fileName: String(params.fileName),
        content: report,
        sessionId: ctx.sessionId,
        description: `WMS 每日运营日报 ${today}`,
      });
      file = safeJson(raw);
    }

    return {
      success: true,
      data: { date: today, report, file },
      metadata: { durationMs: Date.now() - startTime },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      metadata: { durationMs: Date.now() - startTime },
    };
  }
}

function buildReport(
  today: string,
  overview: Record<string, unknown>,
  lowRows: unknown[],
  anomalyNote: string,
): string {
  const lines: string[] = [];
  lines.push(`# WMS 日报 · ${today}`, '');
  lines.push('## 库存概览');
  lines.push(
    `- 物料种类：${overview.totalItems ?? 'N/A'}`,
    `- 仓库数：${overview.warehouseCount ?? 'N/A'}`,
    `- 低库存物料数：${overview.lowStockItems ?? 'N/A'}`,
    '',
  );

  lines.push('## 库存预警（TOP）');
  if (lowRows.length === 0) {
    lines.push('_当前无低于安全库存的物料。_', '');
  } else {
    lines.push('| SKU | 名称 | 仓库 | 可用量 | 安全库存 |', '| --- | --- | --- | --- | --- |');
    for (const r of lowRows) {
      const row = r as Record<string, unknown>;
      lines.push(
        `| ${row.sku} | ${row.name} | ${row.warehouse_id} | ${row.quantity} | ${row.safety_stock} |`,
      );
    }
    lines.push('');
  }

  lines.push('## 异常单据');
  lines.push(anomalyNote, '');
  lines.push('## 运营建议');
  lines.push('1. 优先补货处于安全库存以下的物料。');
  lines.push('2. 核查挂起/校验失败单据，避免影响出入库时效。');
  return lines.join('\n');
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
