/**
 * pdf_exporter — 导出为 PDF（原生可执行入口）
 *
 * 调用方式：skill_pdf_exporter({ content, title?, fileName? })
 *   content：Markdown / HTML / 纯文本
 *
 * 将内容包装为打印友好的 HTML 文档，通过 file_generateFile 落盘（默认 .pdf 文件名），
 * 返回下载/预览链接。中文字体优先，避免乱码。
 */
import type { SkillContext, SkillResult } from '../../server/types/skill-runtime.js';

export async function execute(
  params: Record<string, unknown>,
  ctx: SkillContext,
): Promise<SkillResult> {
  const startTime = Date.now();
  try {
    const content = params.content ? String(params.content) : '';
    if (!content.trim()) {
      return fail('请提供导出内容 content', startTime);
    }
    const today = new Date().toISOString().slice(0, 10);
    const title = params.title ? String(params.title) : `导出文档 · ${today}`;
    const fileName = params.fileName ? String(params.fileName) : `${title}.pdf`;

    const html = toPrintHtml(content, title);
    const raw = await ctx.tools.run('file_generateFile', {
      fileName,
      content: html,
      sessionId: ctx.sessionId,
      description: title,
    });
    const result = safeJson(raw);

    if (result && (result as Record<string, unknown>).success === false) {
      return fail(String((result as Record<string, unknown>).error), startTime);
    }

    return ok(result, startTime);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), startTime);
  }
}

function toPrintHtml(content: string, title: string): string {
  const body = content.trim().startsWith('<')
    ? content
    : `<pre style="white-space: pre-wrap; font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;">${escapeHtml(
        content,
      )}</pre>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 24mm 18mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; color: #1f2329; line-height: 1.7; font-size: 14px; }
  h1 { font-size: 22px; border-bottom: 2px solid #1f2329; padding-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; page-break-inside: auto; }
  th, td { border: 1px solid #d0d3d9; padding: 6px 10px; text-align: left; }
  thead { display: table-header-group; }
  th { background: #f2f3f5; }
  pre { white-space: pre-wrap; word-break: break-word; }
  .footer { margin-top: 24px; color: #8a8f99; font-size: 12px; border-top: 1px solid #e5e6eb; padding-top: 8px; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
<div class="footer">由 CrossWMS 导出 · 生成时间 ${new Date().toLocaleString('zh-CN')}</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
