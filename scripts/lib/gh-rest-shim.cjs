#!/usr/bin/env node
// GitHub Actions REST API 简单客户端（CommonJS）
const process = require('process');
const https = require('https');
const fs = require('fs');

const API = 'api.github.com';
const REPO_ENV = process.env.GH_REPO;

function gh({ method = 'GET', path, body, token, extraHeaders = {}, expectedStatus = [200, 201, 202, 204] }) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'cdf-know-clow/gh-rest-shim',
    ...extraHeaders,
  };
  const auth = token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (body) headers['Content-Type'] = 'application/json';

  return new Promise((resolve, reject) => {
    const req = https.request({
      method,
      hostname: API,
      path,
      headers,
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const ok = expectedStatus.includes(res.statusCode);
        let parsed;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
        if (!ok) reject(new Error(`HTTP ${res.statusCode} ${method} ${path}: ${JSON.stringify(parsed ?? data).slice(0, 400)}`));
        else resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function inferRepo() {
  if (REPO_ENV) return REPO_ENV;
  try {
    const cfg = fs.readFileSync('.git/config', 'utf8');
    const m = cfg.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(.+?)\r?\n/);
    if (!m) return null;
    const url = m[1].trim();
    const gh = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
    if (gh) return `${gh[1]}/${gh[2]}`;
  } catch {}
  return null;
}
function detectRepo() {
  const r = inferRepo();
  if (!r) throw new Error('Cannot infer repo. Set GH_REPO=owner/repo or GITHUB_TOKEN/GH_TOKEN.');
  return r;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const repo = detectRepo();
  if (cmd === 'repo') return console.log(repo);
  if (cmd === 'list-workflows') {
    const { body } = await gh({ path: `/repos/${repo}/actions/workflows?per_page=100` });
    for (const w of body.workflows) console.log(`${w.id}\t${w.path}\t${w.name}\tstate=${w.state}`);
    return;
  }
  if (cmd === 'list-runs') {
    const branch = args[0] || '';
    const q = branch ? `?branch=${encodeURIComponent(branch)}&per_page=20` : '?per_page=20';
    const { body } = await gh({ path: `/repos/${repo}/actions/runs${q}` });
    for (const r of body.workflow_runs) {
      console.log(`${r.id}\t${r.status}\t${r.conclusion || ''}\t${r.head_branch}\t${r.head_sha.slice(0, 8)}\t${r.name}\t${r.html_url}`);
    }
    return;
  }
  if (cmd === 'run-view') {
    const id = args[0];
    const { body: r } = await gh({ path: `/repos/${repo}/actions/runs/${id}` });
    console.log(`run ${r.id} ${r.status}/${r.conclusion || ''} on ${r.head_branch} (${r.head_sha.slice(0, 8)}): ${r.html_url}`);
    const { body: jobs } = await gh({ path: `/repos/${repo}/actions/runs/${id}/jobs?per_page=100` });
    for (const j of jobs.jobs) {
      console.log(`  job ${j.id} ${j.status}/${j.conclusion || ''} ${j.name} started=${j.started_at || ''} completed=${j.completed_at || ''}`);
      for (const s of j.steps || []) console.log(`    step ${s.number} ${s.status}/${s.conclusion || ''} ${s.name}`);
    }
    return;
  }
  if (cmd === 'run-logs') {
    const id = args[0];
    const { body: jobs } = await gh({ path: `/repos/${repo}/actions/runs/${id}/jobs?per_page=100` });
    for (const j of jobs.jobs) {
      try {
        const res = await gh({ path: `/repos/${repo}/actions/jobs/${j.id}/logs`, expectedStatus: [200, 302] });
        console.log(`=== JOB ${j.name} (${j.id}) ===`);
        const txt = res.body ? String(res.body) : '';
        console.log(txt.slice(0, 4000));
      } catch (e) {
        console.log(`JOB ${j.name} (${j.id}) logs not available: ${e.message}`);
      }
    }
    return;
  }
  if (cmd === 'workflow-dispatch') {
    const workflowId = args[0];
    const ref = args[1] || 'main';
    let inputs = {};
    if (args[2]) { try { inputs = JSON.parse(args[2]); } catch { throw new Error('inputs must be valid JSON'); } }
    await gh({ method: 'POST', path: `/repos/${repo}/actions/workflows/${workflowId}/dispatches`, body: { ref, inputs }, expectedStatus: [204] });
    console.log(`Dispatched workflow=${workflowId} ref=${ref}. Poll list-runs in ~10s.`);
    return;
  }
  console.error('Usage: gh-rest-shim.cjs <repo|list-workflows|list-runs [branch]|run-view <id>|run-logs <id>|workflow-dispatch <workflowId> <ref> [inputsJson]>');
  process.exit(2);
}
main().catch((e) => { console.error('gh-rest-shim FAIL:', e.message); process.exit(1); });
