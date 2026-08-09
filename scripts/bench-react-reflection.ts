/**
 * ReAct 反思(reflection)开关对比基准 — scripts/bench-react-reflection.ts
 *
 * 用法：
 *   # 快速跑（不打真实 LLM API）：默认 dry-run，生成 mock 报告
 *   npx tsx scripts/bench-react-reflection.ts
 *
 *   # 真跑（需要本地后端已启动在 http://localhost:3000）
 *   npx tsx scripts/bench-react-reflection.ts --live --base-url http://localhost:3000
 *
 *   # 自定义样本数 & 并发
 *   npx tsx scripts/bench-react-reflection.ts --samples 30 --concurrency 2
 *
 * 输出：scripts/benchmarks/reports/react-reflection-YYYYMMDD-HHmmss.md
 *       同时把 JSON 明细写到同目录 .json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// ---------- CLI 参数 ----------
type Options = {
  live: boolean;
  baseUrl: string;
  samples: number;
  concurrency: number;
  agentId: string;
  userId: string;
  reportDir: string;
  timeoutMs: number;
};

function parseOptions(argv: string[]): Options {
  const get = (flag: string, fallback?: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const has = (flag: string) => argv.includes(flag);

  return {
    live: has('--live'),
    baseUrl: get('--base-url', process.env.BENCH_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
    samples: Math.max(10, Math.min(300, parseInt(get('--samples', '50') || '50', 10))),
    concurrency: Math.max(1, Math.min(10, parseInt(get('--concurrency', '3') || '3', 10))),
    agentId: get('--agent-id', process.env.BENCH_AGENT_ID || 'seed-agent-warehouse-specialist'),
    userId: get('--user-id', 'bench-user-1'),
    reportDir: path.resolve(process.cwd(), get('--report-dir', 'scripts/benchmarks/reports') || 'scripts/benchmarks/reports'),
    timeoutMs: Math.max(10_000, parseInt(get('--timeout-ms', '120000') || '120000', 10)),
  };
}

// ---------- 样本 ----------
type CaseCategory = 'simple' | 'wms-complex' | 'multi-tool';
type BenchCase = { id: string; category: CaseCategory; prompt: string; expectedKeywords: string[] };

const SEED_SIMPLE: string[] = [
  '介绍一下 CDF Know Clow',
  '什么是 ReAct 框架？',
  '1 分钟介绍仓库专员的职责',
  '解释"库存周转率"这个概念',
  'SKU 是什么的缩写？',
  '跨境免税仓库和普通仓库最大的区别？',
  '什么叫呆滞物料？',
  '什么是 FIFO 和 LIFO？',
  '补货的安全库存如何计算？',
  'JSON 里对象和数组有什么不同？',
  '帮我写一个 SQL，查 2026 年 7 月每天的出库订单数（不用真实表名）',
  '3PL、4PL 的含义？',
  '什么叫临期预警？',
  'UOM 是什么？常见的 UOM 有哪些？',
  '库位 ABC 分类的原则是什么？',
  '如何计算订单拣货路径的最短距离？',
  '批次号和序列号有什么不同？',
  '为什么要做库存盘点？盘点方式有几种？',
  '简单介绍看板管理（Kanban）在仓库中的用途',
  '什么是保税货物？它的核心特征？',
];

const SEED_WMS_COMPLEX: string[] = [
  '查询 WH01 仓库 2026-07 月入库总金额 Top 10 的 SKU 列表，包含供应商、金额、占比',
  '帮我对比 6 月 vs 7 月 WH01/WH02 两仓的出库量，按品类分组，输出环比变化',
  '找出近 30 天 WH02 仓库里"临期+库存≥100"的 SKU，按到期日排序，给出促销建议',
  '查询 2026-Q3 滞销 SKU 清单：最后动销日距今 >90 天，且当前库存 >50，列出仓号/SKU/数量/库龄',
  '基于最近 90 天出库量，预测 WH01 仓库未来 30 天的 Top 5 SKU 补货建议量（安全库存=3×日均）',
  '生成 2026-07 月的《出入库日报》表头结构，需要字段至少 10 个，并说明每个字段用途',
  '帮我分析最近 14 天 A 类商品（销售额 Top 20%）的缺货次数与缺货时长，输出 SKU 维度',
  'WH01 与 WH02 仓库的在途调拨单列表：单号/调出仓/调入仓/预计到达/状态，按出发时间倒序',
  '最近 30 天所有入库质检合格率：按供应商分组，过滤合格率<95%的供应商，输出整改建议清单',
  '7 月所有异常预警统计：按 低库存/临期/滞销/预测短缺 分类，数量+影响SKU数+涉及仓数',
  '生成一张 SQL 视图定义：v_inventory_position（实时可售库存=在手-预留+在途-锁定），并注释字段',
  'WH01 仓库当前按库位排列的 SKU 分布图：需要包含库位、SKU、数量、最近动销日，按库位字母顺序',
  '最近 30 天出库订单拣货准确率对比：按拣货员分组，展示错误次数与准确率%，降序',
  'SKU001 最近 60 天的库存变化趋势：日期/入库/出库/结存/在途 五列，按日期升序',
  '2026-08 仓库人员绩效：收货/上架/拣货/复核四个环节，每人每日平均件数、错误率、加班时长',
  '查询 2026-07 退货入库（reverse）处理时效：从退货登记 → 上架完成，按天数分桶（<1d, 1-3d, 3-7d, >7d）',
  'WH02 仓库的 SKU 存储建议：基于近 30 天拣货频率，把拣货频次≥5 次/天 的 SKU 移动到黄金拣货区 A01-A10',
  '7 月客户投诉 Top 原因：错发/漏发/破损/临期发运，按数量降序并给出整改优先级',
  '盘点差异分析：盘点批次 P2026-07 的盈亏 SKU 清单，按金额排序，标注是否超过阈值需要复盘',
  '最近 30 天跨境订单通关时效：出库→清关放行→末端派送，各环节平均耗时，按出境口岸分组',
];

const SEED_MULTI_TOOL: string[] = [
  '读取最近 7 天的 chat 日志文件，统计每天对话数并生成图表',
  '列出 src/components 下所有超过 90KB 的大文件，并给其中 Top5 生成拆分建议（拆辅助文件）',
  '检查 db-wms.ts 的 6 个仓储 CRUD 接口权限：是否所有写操作都校验了 tenantId',
  '对比 README.md 和实际 package.json scripts：列出文档中缺失或过时的命令描述',
  '把 openclaw 包内所有 @ts-expect-error 与 @ts-ignore 做汇总：数量排名 Top3 的文件 + 典型用例 1 个/文件',
  '在 /public 目录下搜索 SVG 图标，按"是否含有中文文本"分组，给出需要国际化的清单',
  '生成 Vitest 配置分析：vitest.workspace.ts 下每个 package 使用的 environment/threads/grep 差异表',
  '扫描 server/routes 下所有 REST 接口：列出未加权限中间件的 POST/PUT/DELETE 路由',
  '导出最近 30 天技能调用次数：CSV 格式（skillId, 调用次数, 成功率, 平均耗时 ms）',
  '检查 package.json 与 apps/macos/Package.swift 的版本号是否一致，不一致生成修正补丁',
];

function buildCases(opts: Options): BenchCase[] {
  const cases: BenchCase[] = [];
  for (let i = 0; i < SEED_SIMPLE.length && cases.filter(c => c.category === 'simple').length < Math.round(opts.samples * 0.4); i++) {
    const c = SEED_SIMPLE[i];
    cases.push({
      id: `S-${String(i + 1).padStart(2, '0')}`,
      category: 'simple',
      prompt: c,
      expectedKeywords: c.includes('？') ? ['。'] : ['CDF', 'ReAct', '仓库', '库存', 'SKU', 'SQL', 'FIFO', 'LIFO'].slice(0, 2),
    });
  }
  for (let i = 0; i < SEED_WMS_COMPLEX.length && cases.filter(c => c.category === 'wms-complex').length < Math.round(opts.samples * 0.4); i++) {
    const c = SEED_WMS_COMPLEX[i];
    cases.push({
      id: `W-${String(i + 1).padStart(2, '0')}`,
      category: 'wms-complex',
      prompt: c,
      expectedKeywords: ['SKU', '仓库', 'WH0'],
    });
  }
  for (let i = 0; i < SEED_MULTI_TOOL.length && cases.filter(c => c.category === 'multi-tool').length < Math.max(1, Math.round(opts.samples * 0.2)); i++) {
    const c = SEED_MULTI_TOOL[i];
    cases.push({
      id: `T-${String(i + 1).padStart(2, '0')}`,
      category: 'multi-tool',
      prompt: c,
      expectedKeywords: ['统计', '列表', '分析', 'CSV', 'SQL'].slice(0, 2),
    });
  }
  return cases;
}

// ---------- 运行 ----------
type RunMode = 'reflection-off' | 'reflection-on';

type RunResult = {
  caseId: string;
  mode: RunMode;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  steps: number;
  turns: number;
  contentLength: number;
  correctness: number; // 0..1 基于 expectedKeywords + 基础长度阈值 的简易打分
  toolCalls: number;
  errorMsg?: string;
};

function sleep(ms: number) {
  return new Promise<void>(res => setTimeout(res, ms));
}

function fakeRun(c: BenchCase, mode: RunMode, opts: Options): RunResult {
  // Mock：reflection-on 比 off 多花 ~15% token 和 ~0.5 步，但早停概率带来的步数下降
  // 对于 simple 类：置信度高，早停 30% → 步数更少
  const baseSteps = c.category === 'simple' ? 2 : c.category === 'wms-complex' ? 7 : 10;
  const baseTokensIn = c.category === 'simple' ? 400 : c.category === 'wms-complex' ? 2500 : 3800;
  const baseTokensOut = c.category === 'simple' ? 120 : c.category === 'wms-complex' ? 800 : 1400;
  const earlyStop = mode === 'reflection-on' && c.category === 'simple' && Math.random() < 0.5;

  const steps = Math.max(1, baseSteps + (mode === 'reflection-on' ? (earlyStop ? -1 : 0) : 0));
  const tokensIn = Math.round(baseTokensIn * (mode === 'reflection-on' ? 1.18 : 1) * (earlyStop ? 0.78 : 1));
  const tokensOut = Math.round(baseTokensOut * (mode === 'reflection-on' ? 1.08 : 1) * (earlyStop ? 0.82 : 1));
  const durationMs = Math.round(
    (c.category === 'simple' ? 3500 : c.category === 'wms-complex' ? 14000 : 26000)
    * (mode === 'reflection-on' ? 1.12 : 1)
    * (earlyStop ? 0.7 : 1)
    + Math.random() * 800
  );

  const content = `这是 ${mode} 模式下对「${c.prompt.slice(0, 24)}…」的合成回答，包含模拟关键词 ${c.expectedKeywords.join('、')}。`;
  const kwHit = c.expectedKeywords.filter(k => content.includes(k)).length;
  const correctness = Math.max(0, Math.min(1,
    0.25 * Math.min(1, content.length / 60)
    + 0.5 * (c.expectedKeywords.length > 0 ? kwHit / c.expectedKeywords.length : 0.3)
    + 0.25 * (steps <= baseSteps ? 1 : 0.5)
  ));

  return {
    caseId: c.id,
    mode,
    durationMs,
    tokensIn,
    tokensOut,
    steps,
    turns: Math.max(1, Math.ceil(steps / 1.8)),
    contentLength: content.length,
    correctness,
    toolCalls: c.category === 'multi-tool' ? 3 : c.category === 'wms-complex' ? 2 : 0,
  };
}

/** 真实调用 SSE 端点（需要后端启动）。本函数是契约写法，若后端还未消费 enableReflection 字段，ON/OFF 两种模式结果会相同（这也是对比实验要记录的结果）。 */
async function liveRun(c: BenchCase, mode: RunMode, opts: Options): Promise<RunResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(`${opts.baseUrl}/api/staff/chat-stream/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cdf-tenant': 'default' },
      body: JSON.stringify({
        user_id: opts.userId,
        agent_id: opts.agentId,
        message: c.prompt,
        // 后端 chatStream 路由目前未消费该字段；此 body 作为未来扩展契约保留
        enableReflection: mode === 'reflection-on',
        options: mode === 'reflection-on' ? { enableReflection: true } : undefined,
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      return {
        caseId: c.id, mode, durationMs: Date.now() - started,
        tokensIn: 0, tokensOut: 0, steps: 0, turns: 0,
        contentLength: 0, correctness: 0, toolCalls: 0,
        errorMsg: `HTTP ${res.status} ${await res.text().catch(() => '')}`,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let steps = 0;
    let turns = 0;
    let content = '';
    let toolCalls = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const raw = line.replace(/^data:\s*/, '').trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const ev = JSON.parse(raw);
          const d = ev.data ?? ev;
          if (d.type === 'stream_delta' || ev.event === 'stream_delta') {
            const text = d.text ?? '';
            tokensOut += Math.max(1, Math.ceil(text.length / 4));
            content += text;
          } else if (d.type === 'usage' || d.prompt_tokens) {
            tokensIn += Number(d.prompt_tokens ?? 0);
            tokensOut += Number(d.completion_tokens ?? 0);
          } else if (d.type === 'react_phase') {
            steps = Math.max(steps, Number(d.step ?? 0));
          } else if (d.type === 'status' && d.phase === 'tool') {
            toolCalls++;
          } else if (d.type === 'turn_trace') {
            turns = Math.max(turns, Number(d.turn ?? 0));
            tokensIn += Number(d.tokensUsed ?? 0);
          }
        } catch {
          /* ignore non-JSON SSE lines */
        }
      }
    }

    const kwHit = c.expectedKeywords.filter(k => content.includes(k)).length;
    const correctness = Math.max(0, Math.min(1,
      0.3 * Math.min(1, content.length / 120)
      + 0.6 * (c.expectedKeywords.length > 0 ? kwHit / c.expectedKeywords.length : 0.3)
      + 0.1 * (steps >= 1 ? 1 : 0)
    ));

    return {
      caseId: c.id, mode, durationMs: Date.now() - started,
      tokensIn, tokensOut, steps, turns: turns || Math.max(1, steps),
      contentLength: content.length, correctness, toolCalls,
    };
  } catch (e: unknown) {
    return {
      caseId: c.id, mode, durationMs: Date.now() - started,
      tokensIn: 0, tokensOut: 0, steps: 0, turns: 0,
      contentLength: 0, correctness: 0, toolCalls: 0,
      errorMsg: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runCase(c: BenchCase, mode: RunMode, opts: Options): Promise<RunResult> {
  const r = opts.live ? await liveRun(c, mode, opts) : fakeRun(c, mode, opts);
  // 真实 LLM API 调用之间留 500ms 节流窗口
  if (opts.live) await sleep(500);
  return r;
}

async function runAll(cases: BenchCase[], opts: Options): Promise<RunResult[]> {
  const results: RunResult[] = [];
  let cursor = 0;
  while (cursor < cases.length) {
    const batch = cases.slice(cursor, cursor + opts.concurrency);
    const pairRuns: Array<Promise<RunResult[]>> = batch.map(async (c) => [
      await runCase(c, 'reflection-off', opts),
      await runCase(c, 'reflection-on', opts),
    ]);
    const resolved = await Promise.all(pairRuns);
    for (const r of resolved) results.push(...r);
    cursor += batch.length;
    process.stdout.write(`[bench] 进度 ${Math.min(cursor, cases.length)}/${cases.length} 样本\n`);
  }
  return results;
}

// ---------- 汇总与报告 ----------
type AggRow = {
  category: CaseCategory | 'ALL';
  mode: RunMode;
  count: number;
  errors: number;
  avgTokensIn: number; avgTokensOut: number; avgTokensTotal: number;
  avgSteps: number; avgTurns: number;
  avgDurationMs: number;
  avgCorrectness: number;
  correctnessGte70: number;
  avgToolCalls: number;
};

function num(n: number, d = 2): string {
  if (!Number.isFinite(n)) return '-';
  return n.toFixed(d);
}
function pct(n: number, d = 1): string { return `${num(n * 100, d)}%`; }

function aggregate(results: RunResult[], cases: BenchCase[]): AggRow[] {
  const caseById = new Map(cases.map(c => [c.id, c]));
  const categories: Array<CaseCategory | 'ALL'> = Array.from(
    new Set<CaseCategory | 'ALL'>([...cases.map(c => c.category), 'ALL'])
  );
  const rows: AggRow[] = [];
  for (const cat of categories) {
    for (const mode of ['reflection-off', 'reflection-on'] as const) {
      const subset = results.filter(r => r.mode === mode && (cat === 'ALL' || caseById.get(r.caseId)?.category === cat));
      if (subset.length === 0) continue;
      const tokensInSum = subset.reduce((s, r) => s + r.tokensIn, 0);
      const tokensOutSum = subset.reduce((s, r) => s + r.tokensOut, 0);
      rows.push({
        category: cat as CaseCategory | 'ALL',
        mode,
        count: subset.length,
        errors: subset.filter(r => !!r.errorMsg).length,
        avgTokensIn: tokensInSum / subset.length,
        avgTokensOut: tokensOutSum / subset.length,
        avgTokensTotal: (tokensInSum + tokensOutSum) / subset.length,
        avgSteps: subset.reduce((s, r) => s + r.steps, 0) / subset.length,
        avgTurns: subset.reduce((s, r) => s + r.turns, 0) / subset.length,
        avgDurationMs: subset.reduce((s, r) => s + r.durationMs, 0) / subset.length,
        avgCorrectness: subset.reduce((s, r) => s + r.correctness, 0) / subset.length,
        correctnessGte70: subset.filter(r => r.correctness >= 0.7).length / subset.length,
        avgToolCalls: subset.reduce((s, r) => s + r.toolCalls, 0) / subset.length,
      });
    }
  }
  return rows;
}

function deltaPct(curr: number, base: number): string {
  if (!Number.isFinite(curr) || !Number.isFinite(base) || base === 0) return '—';
  const p = (curr - base) / base * 100;
  const sign = p > 0 ? '+' : '';
  return `${sign}${num(p, 2)}%`;
}

function buildMdReport(opts: Options, cases: BenchCase[], results: RunResult[], reportTime: string): string {
  const rows = aggregate(results, cases);
  const byCatMode = new Map<string, AggRow>();
  for (const r of rows) byCatMode.set(`${r.category}::${r.mode}`, r);

  const header = [
    '# ReAct 反思开关对比实验报告',
    '',
    `- 生成时间：${reportTime}`,
    `- 运行模式：${opts.live ? '真实后端 SSE (--live)' : 'MOCK 数据 (默认 dry-run)'}`,
    opts.live ? `- 后端地址：${opts.baseUrl}` : '',
    `- 样本总数：${cases.length}（simple=${cases.filter(c => c.category === 'simple').length}, wms-complex=${cases.filter(c => c.category === 'wms-complex').length}, multi-tool=${cases.filter(c => c.category === 'multi-tool').length}）`,
    `- 并发度：${opts.concurrency}`,
    `- Agent ID：${opts.agentId}`,
    '',
    '> 术语解释：',
    '> - **reflection-off**（基线）：当前默认关闭反思分支，每轮不做 LLM 自评估',
    '> - **reflection-on**（候选）：启用 reflection 阶段，每轮产出 confidenceScore，≥7 分允许早停',
    '',
  ].filter(Boolean).join('\n');

  const cats: Array<CaseCategory | 'ALL'> = ['simple', 'wms-complex', 'multi-tool', 'ALL'];

  const tableHeader = '| 类别 | 模式 | 样本 | 错误 | tokens 总数 (Δ) | 步数 Avg (Δ) | 轮数 Avg (Δ) | 耗时 ms Avg (Δ) | 正确率 Avg (Δ) | ≥70% 占比 (Δ) |';
  const sep        = '|---|---|---:|---:|---|---|---|---|---|---|';
  const tableRows: string[] = [];
  for (const cat of cats) {
    const base = byCatMode.get(`${cat}::reflection-off`);
    const cand = byCatMode.get(`${cat}::reflection-on`);
    if (!base || !cand) continue;
    const catLabel = cat === 'ALL' ? '**总体**' : `\`${cat}\``;
    tableRows.push([
      `| ${catLabel} | 关 (baseline) | ${base.count} | ${base.errors} | ${num(base.avgTokensTotal, 0)} | ${num(base.avgSteps, 2)} | ${num(base.avgTurns, 2)} | ${num(base.avgDurationMs, 0)} | ${pct(base.avgCorrectness)} | ${pct(base.correctnessGte70)} |`,
      `|  | 开 (candidate) | ${cand.count} | ${cand.errors} | ${num(cand.avgTokensTotal, 0)} **${deltaPct(cand.avgTokensTotal, base.avgTokensTotal)}** | ${num(cand.avgSteps, 2)} **${deltaPct(cand.avgSteps, base.avgSteps)}** | ${num(cand.avgTurns, 2)} **${deltaPct(cand.avgTurns, base.avgTurns)}** | ${num(cand.avgDurationMs, 0)} **${deltaPct(cand.avgDurationMs, base.avgDurationMs)}** | ${pct(cand.avgCorrectness)} **${deltaPct(cand.avgCorrectness, base.avgCorrectness)}** | ${pct(cand.correctnessGte70)} **${deltaPct(cand.correctnessGte70, base.correctnessGte70)}** |`,
    ].join('\n'));
  }

  const overall = byCatMode.get('ALL::reflection-on');
  const overallBase = byCatMode.get('ALL::reflection-off');
  const summaryDecision = (() => {
    if (!overall || !overallBase) return '> ⚠️ 缺少 ALL 聚合行，无法给出决策建议';
    const tokenDelta = (overall.avgTokensTotal - overallBase.avgTokensTotal) / overallBase.avgTokensTotal;
    const stepDelta = (overall.avgSteps - overallBase.avgSteps) / overallBase.avgSteps;
    const lines: string[] = [];
    lines.push('## 🎯 决策建议');
    lines.push('');
    lines.push(`- token 增量：**${deltaPct(overall.avgTokensTotal, overallBase.avgTokensTotal)}**（阈值 <15%：${tokenDelta < 0.15 ? '✅ 可接受' : '❌ 偏高，需谨慎启用'}）`);
    lines.push(`- 步数下降：**${deltaPct(overall.avgSteps, overallBase.avgSteps)}**（阈值 ≤-20%：${stepDelta <= -0.2 ? '✅ 早停效果明显' : '⚠️ 早停未达预期'}）`);
    lines.push(`- 正确率差：**${deltaPct(overall.avgCorrectness, overallBase.avgCorrectness)}**（≥0 为正向）`);
    lines.push('');
    if (tokenDelta < 0.15 && stepDelta <= -0.2 && overall.avgCorrectness >= overallBase.avgCorrectness) {
      lines.push('### 建议：**启用 reflection（推荐配置 P0-1 早停 + P1-5 自评分）**');
      lines.push('- 改 `server/engine/reactExecutor.ts` 的 reflectionPhase 开关：将 `skipReflection: true` 改回 `false`（或等价配置位）');
      lines.push('- 早停门槛 `confidenceScore >= 7` 可在 `ReflectionConfidenceEvent` 里按业务再调（例如 simple 类 ≥6 即可停）');
    } else if (tokenDelta < 0.15) {
      lines.push('### 建议：**仅对复杂类 (wms-complex / multi-tool) 局部启用 reflection 做 AB 实验**');
      lines.push('- 先针对 2 类复杂任务再跑 100 条专项样本，确认步骤下降 ≥ 25% 时再全量开启');
    } else {
      lines.push('### 建议：**保持 reflection 关闭，更新 PRD / README 说明现状**');
      lines.push('- 同时可把 `useAgentChat.ts` 中 reflection_confidence 事件分支的日志等级降级，减少空跑');
    }
    return lines.join('\n');
  })();

  const errRows = results.filter(r => !!r.errorMsg).slice(0, 10);
  const errorsSec = errRows.length === 0 ? '' : [
    '## ⚠️ 错误清单（Top 10）',
    '',
    ...errRows.map(r => `- **\`${r.caseId}\` · ${r.mode}**：${r.errorMsg}`),
    '',
  ].join('\n');

  return [
    header,
    '## 📊 指标对比总表',
    '',
    tableHeader,
    sep,
    tableRows.join('\n'),
    '',
    summaryDecision,
    '',
    '## 📒 明细字段说明',
    '',
    '- tokens 总数 = prompt_tokens + completion_tokens（均为每样本均值）',
    '- 步数 = react_phase.step 末值 / mock 合成值',
    '- 正确率 = 关键字命中率 (60%) + 回答长度 (30%) + 步数合理性 (10%) 的确定性打分',
    '- ≥70% 占比 = 样本中 correctness ≥ 0.7 的比例，作为"可用回答率"的近似',
    '',
    errorsSec,
  ].join('\n');
}

// ---------- main ----------
async function main() {
  const opts = parseOptions(process.argv.slice(2));
  mkdirSync(opts.reportDir, { recursive: true });

  const cases = buildCases(opts);
  process.stdout.write(`[bench] 运行=${opts.live ? 'LIVE' : 'DRY-RUN'} 样本=${cases.length} 并发=${opts.concurrency}\n`);

  const results = await runAll(cases, opts);
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const reportTime = ts.toLocaleString('zh-CN', { hour12: false });

  const md = buildMdReport(opts, cases, results, reportTime);
  const mdPath = path.join(opts.reportDir, `react-reflection-${stamp}.md`);
  writeFileSync(mdPath, md, 'utf8');

  const jsonPath = path.join(opts.reportDir, `react-reflection-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify({
    generatedAt: ts.toISOString(),
    options: opts,
    cases,
    results,
    aggregates: aggregate(results, cases),
  }, null, 2), 'utf8');

  process.stdout.write(`[bench] 报告已生成\n  - ${mdPath}\n  - ${jsonPath}\n`);
}

main().catch((e: unknown) => {
  console.error('[bench] 执行失败:', e);
  process.exit(1);
});
