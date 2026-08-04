// Leaf module extracted from apiDomainWhitelist.ts to break
// db-core.ts → db-plugin.ts → apiDomainWhitelist.ts → db.ts → db-core.ts cycle (#10).
// BUILTIN_DOMAINS is a pure constant array referenced by db-plugin.ts for DB seeding;
// isolating it removes the db-plugin.ts → apiDomainWhitelist.ts import edge, while
// apiDomainWhitelist.ts still re-exports it for backward compatibility.

/**
 * 内置域名白名单（hostname + description）。
 * 作为 DB seed 与运行时 fallback 的单一数据源，由 db-plugin.ts 与 apiDomainWhitelist.ts 共同引用。
 */
export const BUILTIN_DOMAINS: ReadonlyArray<{ hostname: string; desc: string }> = [
  { hostname: 'api.github.com', desc: 'GitHub API' },
  { hostname: 'api.openai.com', desc: 'OpenAI API' },
  { hostname: 'api.anthropic.com', desc: 'Anthropic API' },
  { hostname: 'generativelanguage.googleapis.com', desc: 'Google Gemini API' },
  { hostname: 'api.weixin.qq.com', desc: '微信 API' },
  { hostname: 'qyapi.weixin.qq.com', desc: '企业微信 API' },
  { hostname: 'docs.qq.com', desc: '腾讯文档' },
  { hostname: 'api.day.app', desc: 'Day One API' },
  { hostname: 'open.feishu.cn', desc: '飞书开放平台' },
  { hostname: 'api.money.126.net', desc: '网易财经 API' },
  { hostname: 'pushbear.ftqq.com', desc: 'PushBear 通知' },
];
