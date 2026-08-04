import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 3099;
const env = { ...process.env, PORT: String(PORT), STAFF_AUTH_ALLOW_DEFAULT: '1', NODE_TLS_REJECT_UNAUTHORIZED: '0' };
const child = spawn(process.execPath, ['server_dist/index.cjs'], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', (d) => (log += d.toString()));
child.stderr.on('data', (d) => (log += d.toString()));

const base = `http://127.0.0.1:${PORT}`;
let ready = false;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  try { const r = await fetch(`${base}/api/health`); if (r.ok) { ready = true; break; } } catch {}
}
if (!ready) { console.log('SERVER_NOT_READY\n' + log.slice(-2500)); child.kill('SIGKILL'); process.exit(1); }

const probe = async (path) => {
  const r = await fetch(`${base}${path}`);
  const text = await r.text();
  let parsed = null; try { parsed = JSON.parse(text); } catch {}
  // 响应层可能对 code===0 剥 envelope：parsed 直接是 data；否则 parsed.data
  const data = Array.isArray(parsed) ? parsed : (parsed && parsed.data);
  return { status: r.status, data };
};

const tools = await probe('/api/staffdeck/tools?tenant_id=default');
console.log('TOOLS status=' + tools.status + ' count=' + (Array.isArray(tools.data) ? tools.data.length : 'NON-ARRAY'));
if (Array.isArray(tools.data)) {
  const sample = tools.data.slice(0, 3).map((t) => ({
    name: t.name, type: t.tool_type,
    has_mcp_config: t.mcp_config !== undefined,
    mcp_config_keys: t.mcp_config && typeof t.mcp_config === 'object' ? Object.keys(t.mcp_config) : t.mcp_config,
  }));
  console.log(JSON.stringify(sample, null, 2));
} else {
  console.log('NON-ARRAY BODY: ' + JSON.stringify(tools.data).slice(0, 500));
}
child.kill('SIGKILL');
