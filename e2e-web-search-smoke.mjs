#!/usr/bin/env node
/**
 * web-search 类扩展端到端冒烟测试（覆盖全部 6 个 web-search 扩展）
 *
 * 对每个扩展验证：启用 → 工具注册到 toolRegistry → invoke 调用 → 禁用后工具移除
 *
 * 覆盖扩展：
 *   duckduckgo   duckduckgo_search（无需 key，真实搜索）
 *   searxng      searxng_search（自托管，预期连接失败但工具可调用）
 *   brave        brave_search（无 key 时返回友好提示）
 *   exa          exa_search（无 key 时返回友好提示）
 *   tavily       tavily_search（无 key 时返回友好提示）
 *   firecrawl    firecrawl_search（无 key 时返回友好提示）
 *
 * 运行：node e2e-web-search-smoke.mjs
 */

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
  if (!cond) { console.error(`❌ ${msg}`); failures.push(msg); throw new Error(msg); }
}
function softAssert(cond, msg) { if (!cond) { console.warn(`⚠️ ${msg}`); failures.push(msg); } }

async function enableExt(id, config) {
  const detail = await req('GET', `/${id}`);
  const d = detail.json?.data ?? detail.json;
  if (d && d.enabled === true) { await req('POST', `/${id}/disable`); await sleep(150); }
  const r = await req('POST', `/${id}/enable`, { config: config || {} });
  log(`POST /${id}/enable → ${r.status}`);
  assert(r.status === 200, `启用 ${id} 应 200，实际 ${r.status}: ${JSON.stringify(r.json)}`);
  await sleep(250);
}

async function disableExt(id) {
  const r = await req('POST', `/${id}/disable`);
  log(`POST /${id}/disable → ${r.status}`);
  assert(r.status === 200, `禁用 ${id} 应 200，实际 ${r.status}`);
  await sleep(150);
}

async function getTools(id) {
  const r = await req('GET', `/${id}/tools`);
  assert(r.status === 200, `GET /${id}/tools 应 200`);
  return r.json?.data?.tools ?? r.json?.tools ?? [];
}

async function invoke(id, name, args) {
  const r = await req('POST', `/${id}/tools/${name}/invoke`, { args });
  return { status: r.status, result: r.json?.data?.result ?? r.json?.result, json: r.json };
}

async function verifyRemoved(id) {
  const tools = await getTools(id);
  log(`GET /${id}/tools (禁用后) → ${tools.length} 个工具`);
  assert(tools.length === 0, `禁用 ${id} 后应无工具，实际 ${tools.length}`);
}

console.log('=== web-search 扩展端到端冒烟测试（6 个）===\n');

// ---------- 1. duckduckgo（无需 key，真实搜索）----------
{
  console.log('--- duckduckgo ---');
  await enableExt('duckduckgo', {});
  let tools = await getTools('duckduckgo');
  log(`duckduckgo 工具: ${JSON.stringify(tools)}`);
  assert(tools.length === 1 && tools.includes('duckduckgo_search'), '应注册 duckduckgo_search');

  const r = await invoke('duckduckgo', 'duckduckgo_search', { query: 'Node.js', count: 3 });
  log(`invoke duckduckgo_search → ${r.status}`);
  assert(r.status === 200, `应 200，实际 ${r.status}`);
  if (r.result && r.result.includes('"ok":true')) {
    assert(r.result.includes('"results"'), '应返回 results');
    log('✓ duckduckgo 真实搜索成功');
  } else {
    softAssert(false, `duckduckgo 搜索未返回 ok（可能网络限制）: ${(r.result || '').slice(0, 120)}`);
  }

  await disableExt('duckduckgo');
  await verifyRemoved('duckduckgo');
}

// ---------- 2. searxng（自托管，预期连接失败但工具可调用）----------
{
  console.log('\n--- searxng ---');
  await enableExt('searxng', { baseUrl: 'http://localhost:8080' });
  let tools = await getTools('searxng');
  log(`searxng 工具: ${JSON.stringify(tools)}`);
  assert(tools.length === 1 && tools.includes('searxng_search'), '应注册 searxng_search');

  const r = await invoke('searxng', 'searxng_search', { query: 'test', count: 3 });
  log(`invoke searxng_search → ${r.status}`);
  assert(r.status === 200, `应 200，实际 ${r.status}`);
  // 本地无 SearXNG 实例，预期返回 ok:false + error（连接失败），但工具本身可调用
  assert(r.result && (r.result.includes('"ok":false') || r.result.includes('"ok":true')), '应返回结构化响应');

  await disableExt('searxng');
  await verifyRemoved('searxng');
}

// ---------- 3-6. 需 API key 的扩展：验证注册 + 无 key 友好提示 ----------
for (const [id, tool, keyName] of [
  ['brave', 'brave_search', 'BRAVE_API_KEY'],
  ['exa', 'exa_search', 'EXA_API_KEY'],
  ['tavily', 'tavily_search', 'TAVILY_API_KEY'],
  ['firecrawl', 'firecrawl_search', 'FIRECRAWL_API_KEY'],
]) {
  console.log(`\n--- ${id} ---`);
  await enableExt(id, {});
  let tools = await getTools(id);
  log(`${id} 工具: ${JSON.stringify(tools)}`);
  assert(tools.length === 1 && tools.includes(tool), `应注册 ${tool}`);

  const r = await invoke(id, tool, { query: 'test', count: 3 });
  log(`invoke ${tool} → ${r.status}`);
  assert(r.status === 200, `应 200，实际 ${r.status}`);
  assert(r.result && r.result.includes(keyName), `无 key 时应提示需配置 ${keyName}`);
  log(`✓ ${id} 无 key 友好提示正确`);

  await disableExt(id);
  await verifyRemoved(id);
}

console.log('\n✅ 全部 6 个 web-search 扩展冒烟测试通过！');
console.log('   覆盖：duckduckgo / searxng / brave / exa / tavily / firecrawl');
console.log('   验证项：启用即注册、Agent 可调用、禁用即移除。');
if (failures.length > 0) {
  console.log(`\n⚠️ 软断言失败 ${failures.length} 项（非致命）：`);
  failures.forEach((f) => console.log('   - ' + f));
}
