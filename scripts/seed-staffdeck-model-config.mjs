/**
 * 为数字员工对话补齐「可用模型配置」——数据层修复（不改后端代码）。
 *
 * 根因：
 *  - 嵌入前端 useChatSession 的 selectedModelConfig 来自企业模型配置表 sd_model_configs；
 *    若为空，前端 ensureModelAvailable() 直接拦截发送（提示「管理员尚未配置模型」）。
 *  - 前端发出的 model 字段 = sd_model_configs 的 id；而后端 staffChatExecutor 是在主程序
 *    models.json 里按 id 查找模型。两套 id 空间割裂 → 发 mcfg_xxx 必然找不到 → 演示模式。
 *
 * 修复：往 sd_model_configs 插入一条 id 与主程序 models.json 的本地 Ollama 配置
 *       (llama3.1) 对齐的记录。铁律：id 必须与 ollama tag 一致（用 llama3.1，非
 *       ollama-llama3.1），否则前端发来的 model 字段（= sd_model_configs.id）在
 *       staffChatExecutor 按 models.json id 直查时落空 → 误入 mock 兜底。
 *       这样前端选中的配置发出的 model id 后端能直接命中本地模型
 *       （isLocalModel(ollama)=true，无需 API Key），真实生成而非演示占位。
 *
 * 幂等：INSERT OR IGNORE，重复运行安全。
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import Database from 'better-sqlite3';

const REPO_ROOT = resolve('.');

// 自动识别运行时 DB（优先 AppSupport，回退 .dev-data）
const CANDIDATES = [
  process.env.STAFF_DB_PATH,
  resolve(homedir(), 'Library/Application Support/CDFKnowClow/chat.db'),
  resolve(REPO_ROOT, '.dev-data/config/chat.db'),
].filter(Boolean);

let DB_PATH = null;
for (const p of CANDIDATES) {
  if (p && existsSync(p)) { DB_PATH = p; break; }
}
if (!DB_PATH) {
  console.error('[seed-model-config] 未找到运行时 chat.db');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('busy_timeout = 15000');

// 铁律：id 必须与 ollama tag 一致（llama3.1），同时它也是 models.json 的 ollama 条目 id。
const ALIGNED_ID = 'llama3.1';
const TENANT = 'default';

const existing = db
  .prepare('SELECT id, name, enabled, is_default, trust_status FROM sd_model_configs WHERE id = ?')
  .get(ALIGNED_ID);

if (existing) {
  console.log(`[seed-model-config] 已存在 id=${ALIGNED_ID}，跳过插入：`, existing);
} else {
  db.prepare(
    `INSERT OR IGNORE INTO sd_model_configs (
      id, tenant_id, name, provider, api_protocol, base_url, api_key_encrypted,
      model, temperature, max_output_tokens, trust_status, is_default, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ALIGNED_ID,
    TENANT,
    'Llama 3.1 (本地 Ollama)',
    'ollama',
    'openai_chat_completions',
    'http://localhost:11434/v1',
    '', // 本地模型无需 API Key（api_key_encrypted NOT NULL，传空串）
    'llama3.1',
    0.2,
    4096,
    'legacy_trusted', // 本地模型视为可信，绕过验证门槛
    1, // is_default
    1, // enabled
  );
  console.log(`[seed-model-config] 已插入默认模型配置 id=${ALIGNED_ID}`);
}

const rows = db
  .prepare('SELECT id, name, provider, model, enabled, is_default, trust_status FROM sd_model_configs WHERE tenant_id = ?')
  .all(TENANT);
console.log(`\n[seed-model-config] tenant=${TENANT} 的模型配置 (${rows.length}):`);
for (const r of rows) {
  console.log(`  - ${r.id} | ${r.name} | provider=${r.provider} | model=${r.model} | enabled=${r.enabled} | is_default=${r.is_default} | trust=${r.trust_status}`);
}

db.close();
console.log('\n[seed-model-config] done.');
