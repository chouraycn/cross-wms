# 运行时问题诊断报告（4 项用户反馈）

> 诊断时间：2026-07-13
> 范围：重装后历史对话丢失 / 对话生成白屏 / 技能暂不可用 / 搜索无结果
> 结论一句话：**四类现象同一根因——用户数据被分裂在多个互不可见的数据目录中（含空格 `CDF Know Clow` vs 无空格 `CDFKnowClow` vs 旧 `.cdf-know-clow`），切换目录即"丢失"旧数据、且新目录的 Key/索引常常为空导致功能退化。**

---

## 一、实锤证据（磁盘现状）

```
~/Library/Application Support/CDF Know Clow      ← 含空格（dev 模式落点）
  sessions/*.jsonl : 334 个
  chat.db          : 存在
  .encryption_key / .master.key / SOUL.md / USER.md / MEMORY.md : 各自独立一份
  models/all-MiniLM-L6-v2/ : 存在（完整性未确认）

~/Library/Application Support/CDFKnowClow        ← 无空格（发布版 .app 落点）
  sessions/*.jsonl : 348 个
  chat.db          : 存在
  .encryption_key / .master.key / SOUL.md / USER.md / MEMORY.md : 另一份
  models/all-MiniLM-L6-v2/ : ✅ 完整（model.onnx 22.9MB / tokenizer.json / vocab.txt）

~/.cdf-know-clow                                 ← 最早旧目录
  chat.db : 610KB（残留）
```

**三个目录互不可见**，各自持有独立的加密密钥、会话、向量索引、身份文件。

---

## 二、根因链

### 根因 R1：数据目录命名在含空格 / 无空格之间漂移（★ 核心）

| 启动方式 | 注入 `CDF_DATA_DIR`? | `resolveRootDir()` 走分支 | 实际 `rootDir` |
|---|---|---|---|
| 发布版 `.app`（Swift 宿主） | ✅ `~/Library/Application Support/CDFKnowClow/data` | env 分支（`dirname`） | `…/Application Support/CDFKnowClow` |
| `npm run dev`（纯 node，无宿主） | ❌ 无 | 分支2 `getMacOSAppSupportDir()` | `…/Application Support/CDF Know Clow`（用 `appIdentity` 默认含空格名） |

- `server/config/appIdentity.ts:1` 默认 `appName = 'CDF Know Clow'`（**含空格**）
- `apps/macos/.../AppConfig.swift:7` Swift 宿主用 `CDFKnowClow`（**无空格**）
- `server/config/appPaths.ts:21-22` 在 `CDF_DATA_DIR` 存在时 `dirname` 还原，否则 fallback 到含空格名

→ **dev 与发布版各写各的目录**，300+ 会话被劈成两份。用户所谓"重装后历史对话没了"，本质是切到了另一个目录，旧目录数据原封不动还在。

### 根因 R2：目录切换后新目录的 Key/索引为空或不匹配

- `server/keychainStore.ts:44` 加密密钥 `ENCRYPTION_KEY_FILE = rootDir/.encryption_key`
- `server/engine/crypto.ts` AES-256-GCM 用该 key 解密保存的 API Key
- 每个数据目录有**自己生成**的 `.encryption_key` / `.master.key`

切到新目录 → 该目录的 key 是空的/不匹配 → API Key 解密失败 → 无可用模型 → **对话生成时长时间等待/白屏**。

### 根因 R3：向量索引按目录隔离 + embedText 无超时保护

- `server/services/embeddingService.ts:366 semanticSearch` 依赖 ONNX embedding；模型本机已下载（发布版目录完整），但 dev 含空格目录模型完整性未确认。
- `server/services/embeddingService.ts:374-383` `getOnnxStatus()!=='ready'` 时 `await initOnnxEmbedding()`，**无超时**——首次推理/模型加载会长时间挂起（之前 CI 沙箱里表现为 22s 超时）。
- 技能向量索引（`getAllEmbeddings()`）存在 `rootDir` 下，切目录后为空 → 语义搜索匹配不出结果。

### 根因 R4：前端失败被静默吞掉，无可见状态

- `src/stores/skillStore.ts:310 initFromApi()` `catch` 静默 → 技能列表为空 → 表现"技能暂不可用"。
- `src/stores/skillStore.ts:94/108/264` 多个加载函数 `catch` 空处理。

---

## 三、四个现象 → 根因映射

| 现象 | 直接原因 | 底层根因 |
|---|---|---|
| 重装后历史对话丢失 | 启动目录与上次不同，读不到旧目录的 334/348 会话 | R1 目录分裂 |
| 对话生成久白屏 | 新目录 key 不匹配 → 模型加载/校验挂起；或首次 ONNX 推理无超时 | R2 + R3 |
| 技能暂不可用 | 新目录技能索引/状态为空 + `initFromApi` 静默失败 | R1 + R4 |
| 搜索无直接结果 | 新目录向量索引为空 + `embedText` 降级 Mock 后匹配不出 | R1 + R3 |

---

## 四、修复方案（按优先级）

### P0 — 统一数据目录（解决 R1，一揽子修复 4 项）

1. **统一 appName 为无空格 `CDFKnowClow`**
   - `server/config/appIdentity.ts:1` 改 `DEFAULT_APP_NAME = 'CDFKnowClow'`
   - 同步确认 `apps/macos` Swift 侧已用 `CDFKnowClow`（已一致）
   - 效果：dev 与发布版落到同一目录 `…/Application Support/CDFKnowClow`

2. **增强 `appPaths.ts` 迁移合并（关键且需谨慎）**
   - 现状：`resolveRootDir` env 分支（35-46）只合并"有 `sessions` 子目录"的候选；dev 分支2（57-76）只处理 `.cdf-know-clow`，**漏了含空格 `CDF Know Clow`**。
   - 改为：启动时对全部候选目录（`CDF Know Clow` 含空格 / `CDFKnowClow` 无空格 / `.cdf-know-clow`）做**健壮合并**到目标目录（merge 全部内容含 chat.db / sessions / 向量索引 / 配置，已存在文件以"非空/较新"优先），合并后原目录改名加 `.migrated` 后缀防回退。

3. **选定权威目录**：建议 `~/Library/Application Support/CDFKnowClow`（与发布版一致，且 ONNX 模型完整）。

> ⚠️ 合并 334+348 个会话属用户数据操作，**执行前需你确认**，并建议先备份两个目录。

### P1 — 消除阻塞与静默失败（解决 R2/R3/R4，修复白屏/技能/搜索体验）

4. **embedText / semanticSearch 加超时**（embeddingService.ts:374）：`Promise.race([initOnnxEmbedding(), timeout(5s)])`，超时即快速降级 Mock，不再 22s 挂起白屏。
5. **ONNX 模型随包分发**：确认 `build:mac` 把 `models/all-MiniLM-L6-v2/` 打进 `.app` Resources，避免运行时依赖下载（当前本机已有，但 CI/新机可能缺失）。
6. **`initFromApi` 失败可见**（skillStore.ts:320）：catch 后 `notifyAll()` 并 dispatch 可见错误事件，UI 显示"技能加载失败，点击重试"，而非静默空列表。
7. **搜索降级提示**：`semanticSearch` 降级 Mock 时返回标记，前端提示"语义搜索暂不可用，已切换关键词搜索"。

---

## 五、验证清单（修复后）

- [ ] 同一台机器 dev 与 `.app` 启动后，会话数一致（不再分裂）
- [ ] 重装后历史对话保留（合并生效）
- [ ] 首次对话无 20s+ 白屏（embedText 超时保护）
- [ ] 技能页正常列出（initFromApi 可见错误处理）
- [ ] 搜索返回结果（向量索引随目录统一而完整）

---

## 六、影响文件

| 文件 | 改动 |
|---|---|
| `server/config/appIdentity.ts` | `DEFAULT_APP_NAME` 去空格 |
| `server/config/appPaths.ts` | 合并逻辑增强（候选目录全量合并 + 防回退） |
| `server/services/embeddingService.ts` | `initOnnxEmbedding` 加超时 |
| `src/stores/skillStore.ts` | `initFromApi` / 各加载函数失败可见 |
| `scripts/package-mac-*.sh` | 确认 ONNX 模型入包 |
