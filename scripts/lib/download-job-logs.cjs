#!/usr/bin/env node
const https = require('https');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const jobId = process.argv[2] || process.env.JOB_ID || '93082610160';
const path = `/repos/chouraycn/cross-wms/actions/jobs/${jobId}/logs`;

const req = https.request({
  hostname: 'api.github.com',
  path,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cdf',
  },
}, (res) => {
  if (res.statusCode === 302 && res.headers.location) {
    const u = new URL(res.headers.location);
    const req2 = https.get({ hostname: u.host, path: u.pathname + u.search }, (r2) => {
      let d = '';
      r2.on('data', (c) => (d += c));
      r2.on('end', () => process.stdout.write(d));
    });
    req2.on('error', (e) => { console.error('ERR2:', e); process.exit(1); });
    return;
  }
  let d = '';
  res.on('data', (c) => (d += c));
  res.on('end', () => {
    console.error('status=', res.statusCode);
    process.stdout.write(d.slice(0, 10000));
  });
});
req.on('error', (e) => { console.error('ERR:', e); process.exit(1); });
req.end();
