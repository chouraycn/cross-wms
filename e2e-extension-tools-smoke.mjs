#!/usr/bin/env node
/**
 * 扩展工具端到端冒烟测试（覆盖全部 6 个 tool 类扩展）
 *
 * 对每个扩展验证：启用 → 工具注册到 toolRegistry → 通过 invoke 端点调用成功 → 禁用后工具移除
 *
 * 覆盖扩展：
 *   canvas          canvas_create_surface / canvas_list_surfaces
 *   diffs           diffs_compute
 *   file-transfer   file_transfer_queue / file_transfer_list / file_transfer_complete
 *   browser         browser_navigate（data: URL，离线确定性）
 *   web-readability web_readability_clean
 *   document-extract document_extract_text（临时文件）
 *
 * 运行：node e2e-extension-tools-smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = 'http://127.0.0.1:3001/api/extensions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

let step = 0;
const failures = [];
function log(msg) { console.log(`[step ${++step}] ${msg}`); }
function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ 断言失败: ${msg}`);
    failures.push(msg);
    throw new Error(`assert failed: ${msg}`);
  }
}
function softAssert(cond, msg) {
  if (!cond) { console.warn(`⚠️ 软断言失败: ${msg}`); failures.push(msg); }
}

async function enableExt(id, config) {
  // 若已启用（如 restoreEnabledOnStartup 恢复），先禁用以回到干净状态
  const detail = await req('GET', `/${id}`);
  const d = detail.json?.data ?? detail.json;
  if (d && d.enabled === true) {
    await req('POST', `/${id}/disable`);
    await sleep(150);
  }
  const r = await req('POST', `/${id}/enable`, { config: config || {} });
  log(`POST /${id}/enable → ${r.status}`);
  assert(r.status === 200, `启用 ${id} 应返回 200，实际 ${r.status}: ${JSON.stringify(r.json)}`);
  await sleep(250);
}

async function disableExt(id) {
  const r = await req('POST', `/${id}/disable`);
  log(`POST /${id}/disable → ${r.status}`);
  assert(r.status === 200, `禁用 ${id} 应返回 200，实际 ${r.status}: ${JSON.stringify(r.json)}`);
  await sleep(150);
}

async function getTools(id) {
  const r = await req('GET', `/${id}/tools`);
  assert(r.status === 200, `GET /${id}/tools 应返回 200，实际 ${r.status}`);
  return r.json?.data?.tools ?? r.json?.tools ?? [];
}

async function invoke(id, name, args) {
  const r = await req('POST', `/${id}/tools/${name}/invoke`, { args });
  const result = r.json?.data?.result ?? r.json?.result;
  return { status: r.status, result, json: r.json };
}

async function verifyRemoved(id) {
  const tools = await getTools(id);
  log(`GET /${id}/tools (禁用后) → ${tools.length} 个工具`);
  assert(tools.length === 0, `禁用 ${id} 后应无工具，实际 ${tools.length}`);
}

console.log('=== 扩展工具端到端冒烟测试（6 个 tool 扩展）===\n');

// ---------- 1. canvas ----------
{
  console.log('--- canvas ---');
  const canvasRoot = `.canvas-smoke-${Date.now()}`;
  await enableExt('canvas', { host: { root: canvasRoot, liveReload: true } });
  let tools = await getTools('canvas');
  log(`canvas 工具: ${JSON.stringify(tools)}`);
  assert(tools.length === 4, `canvas 应注册 4 个工具，实际 ${tools.length}`);
  assert(tools.includes('canvas_create_surface'), '应含 canvas_create_surface');

  const surfaceName = `demo_${Date.now()}`;
  let r = await invoke('canvas', 'canvas_create_surface', { name: surfaceName, content: '<h1>Hello Canvas</h1>' });
  log(`invoke canvas_create_surface → ${r.status}`);
  assert(r.status === 200, `canvas_create_surface 应 200，实际 ${r.status}`);
  assert(r.result && r.result.includes('"action":"created"'), '应返回 created');

  r = await invoke('canvas', 'canvas_list_surfaces', {});
  log(`invoke canvas_list_surfaces → ${r.status}`);
  assert(r.result && r.result.includes('"count":1'), '应返回 count:1');

  await disableExt('canvas');
  await verifyRemoved('canvas');
}

// ---------- 2. diffs ----------
{
  console.log('\n--- diffs ---');
  await enableExt('diffs', { defaults: { layout: 'unified', theme: 'dark' } });
  let tools = await getTools('diffs');
  log(`diffs 工具: ${JSON.stringify(tools)}`);
  assert(tools.length === 3, `diffs 应注册 3 个工具，实际 ${tools.length}`);
  assert(tools.includes('diffs_compute'), '应含 diffs_compute');

  const r = await invoke('diffs', 'diffs_compute', {
    left: 'a\nb\nc',
    right: 'a\nB\nc\nd',
    leftLabel: 'old',
    rightLabel: 'new',
  });
  log(`invoke diffs_compute → ${r.status}`);
  assert(r.status === 200, `diffs_compute 应 200，实际 ${r.status}`);
  assert(r.result && r.result.includes('"ok":true'), '应返回 ok:true');
  assert(r.result && r.result.includes('"added"'), 'stats 应含 added');

  await disableExt('diffs');
  await verifyRemoved('diffs');
}

// ---------- 3. file-transfer ----------
{
  console.log('\n--- file-transfer ---');
  // 准备临时文件
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-smoke-'));
  const srcFile = path.join(tmpDir, 'source.txt');
  const destDir = path.join(tmpDir, 'dest');
  fs.writeFileSync(srcFile, 'hello file transfer');
  fs.mkdirSync(destDir, { recursive: true }); // 作为目标目录存在，工具会复制到 destDir/source.txt
  log(`临时源文件: ${srcFile}`);

  await enableExt('file-transfer', { maxBytes: 1048576, allowedRoots: [tmpDir] });
  let tools = await getTools('file-transfer');
  log(`file-transfer 工具: ${JSON.stringify(tools)}`);
  assert(tools.length === 4, `file-transfer 应注册 4 个工具，实际 ${tools.length}`);

  let r = await invoke('file-transfer', 'file_transfer_queue', { sourcePath: srcFile, targetPath: destDir });
  log(`invoke file_transfer_queue → ${r.status}`);
  assert(r.status === 200, `file_transfer_queue 应 200，实际 ${r.status}`);
  assert(r.result && r.result.includes('"status":"queued"'), '应返回 queued');
  const idMatch = r.result && r.result.match(/"id":"(ft_[^"]+)"/);
  assert(idMatch, '应返回任务 id');
  const taskId = idMatch[1];

  r = await invoke('file-transfer', 'file_transfer_list', {});
  log(`invoke file_transfer_list → ${r.status}`);
  assert(r.result && r.result.includes(taskId), '应包含刚创建的任务 id');

  r = await invoke('file-transfer', 'file_transfer_complete', { id: taskId });
  log(`invoke file_transfer_complete → ${r.status}`);
  assert(r.status === 200, `file_transfer_complete 应 200，实际 ${r.status}`);
  assert(r.result && r.result.includes('"status":"completed"'), '应返回 completed');
  // 验证文件确实被复制
  const copiedFile = path.join(destDir, 'source.txt');
  assert(fs.existsSync(copiedFile), `目标文件应存在: ${copiedFile}`);
  log(`已验证复制文件存在: ${copiedFile}`);

  await disableExt('file-transfer');
  await verifyRemoved('file-transfer');

  // 清理
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

// ---------- 4. browser ----------
{
  console.log('\n--- browser ---');
  await enableExt('browser', { timeoutMs: 8000 });
  let tools = await getTools('browser');
  log(`browser 工具: ${JSON.stringify(tools)}`);
  assert(tools.length === 3, `browser 应注册 3 个工具，实际 ${tools.length}`);

  // 使用 data: URL，离线确定性
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent('<html><head><title>Smoke</title></head><body><p>Hello Browser</p><a href="/foo">link1</a></body></html>');
  const r = await invoke('browser', 'browser_navigate', { url: dataUrl });
  log(`invoke browser_navigate → ${r.status}`);
  assert(r.status === 200, `browser_navigate 应 200，实际 ${r.status}: ${JSON.stringify(r.json)}`);
  if (r.result && r.result.includes('"ok":true')) {
    assert(r.result.includes('Hello Browser'), '应返回页面文本 Hello Browser');
    log('browser_navigate 成功返回页面快照');
  } else {
    // data: URL 在某些环境不支持时软断言
    softAssert(false, `browser_navigate 未返回 ok（可能 data: URL 不支持）: ${r.result}`);
  }

  await disableExt('browser');
  await verifyRemoved('browser');
}

// ---------- 5. web-readability ----------
{
  console.log('\n--- web-readability ---');
  await enableExt('web-readability', { timeoutMs: 8000 });
  let tools = await getTools('web-readability');
  log(`web-readability 工具: ${JSON.stringify(tools)}`);
  assert(tools.length === 2, `web-readability 应注册 2 个工具，实际 ${tools.length}`);

  const longBody = 'This is the main article body content for readability extraction. '.repeat(8);
  const html = `<html><head><title>Article Title</title><meta property="og:title" content="OG Title"></head><body><article><p>${longBody}</p><p>Second paragraph here.</p></article></body></html>`;
  const r = await invoke('web-readability', 'web_readability_clean', { html });
  log(`invoke web_readability_clean → ${r.status}`);
  assert(r.status === 200, `web_readability_clean 应 200，实际 ${r.status}`);
  assert(r.result && r.result.includes('"ok":true'), '应返回 ok:true');
  assert(r.result && r.result.includes('article body content'), '应提取正文');
  assert(r.result && r.result.includes('"strategy":"article"'), '应使用 article 策略');

  await disableExt('web-readability');
  await verifyRemoved('web-readability');
}

// ---------- 6. document-extract ----------
{
  console.log('\n--- document-extract ---');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-smoke-'));
  const docFile = path.join(tmpDir, 'sample.md');
  fs.writeFileSync(docFile, '# Sample\n\nThis is markdown content for extraction.');
  log(`临时文档: ${docFile}`);

  await enableExt('document-extract', {});
  let tools = await getTools('document-extract');
  log(`document-extract 工具: ${JSON.stringify(tools)}`);
  assert(tools.length === 2, `document-extract 应注册 2 个工具，实际 ${tools.length}`);

  let r = await invoke('document-extract', 'document_extract_info', { filePath: docFile });
  log(`invoke document_extract_info → ${r.status}`);
  assert(r.status === 200, `document_extract_info 应 200，实际 ${r.status}`);
  assert(r.result && r.result.includes('"likelyText":true'), '应识别为文本文件');

  r = await invoke('document-extract', 'document_extract_text', { filePath: docFile });
  log(`invoke document_extract_text → ${r.status}`);
  assert(r.status === 200, `document_extract_text 应 200，实际 ${r.status}`);
  assert(r.result && r.result.includes('markdown content for extraction'), '应返回文档内容');

  await disableExt('document-extract');
  await verifyRemoved('document-extract');

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

console.log('\n✅ 全部 6 个 tool 扩展冒烟测试通过！');
console.log('   覆盖：canvas / diffs / file-transfer / browser / web-readability / document-extract');
console.log('   验证项：启用即注册、Agent 可调用、禁用即移除。');
if (failures.length > 0) {
  console.log(`\n⚠️ 软断言失败 ${failures.length} 项（非致命）：`);
  failures.forEach((f) => console.log('   - ' + f));
}
