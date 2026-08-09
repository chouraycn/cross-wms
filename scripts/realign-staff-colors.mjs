/**
 * scripts/realign-staff-colors.mjs
 * 2026-08-09 — 员工域前端配色对齐（暖/teal 单一事实源 staffdeck.css）
 *
 * 将 src/components/staff 下 MUI/行内组件里残留的靛蓝/冷灰硬编码色
 * （#18181a/#464c5e/#757f9c/#999/#e3e7f1/#f6f6f6/#f2f3f7/#fbfbff 等）
 * 以及 MUI 主题 token（primary.main/divider/text.secondary/text.primary/
 * primary.contrastText）统一重定向到 staffdeck.css 的 CSS 变量。
 *
 * 用法：
 *   node scripts/realign-staff-colors.mjs            # 仅 dry-run，打印改动
 *   node scripts/realign-staff-colors.mjs --apply    # 真正写回文件
 *
 * 不触碰：ui/sidebar.tsx（已用 var(--sidebar-*) 对齐）、
 *         lib/staffTokens.ts、lib/enterprise-ui.ts（已在上一轮处理）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const APPLY = process.argv.includes('--apply');

// [find, replace] —— 顺序无关（替换后结果不含目标 token，不会二次命中）
const REPLACEMENTS = [
  // --- 引号包裹的 MUI 主题 token ---
  ["'divider'", "'var(--border)'"],
  ['"divider"', '"var(--border)"'],
  ["'text.secondary'", "'var(--muted-foreground)'"],
  ['"text.secondary"', '"var(--muted-foreground)"'],
  ["'text.primary'", "'var(--foreground)'"],
  ['"text.primary"', '"var(--foreground)"'],
  ["'primary.contrastText'", "'var(--primary-foreground)'"],
  ['"primary.contrastText"', '"var(--primary-foreground)"'],
  ["'primary.main'", "'var(--primary)'"],
  ['"primary.main"', '"var(--primary)"'],

  // --- 近黑正文 #18181a → --foreground ---
  ["'#18181a'", "'var(--foreground)'"],
  ['text-[#18181a]', 'text-[var(--foreground)]'],
  ['hover:text-[#18181a]', 'hover:text-[var(--foreground)]'],

  // --- 冷灰文本 #464c5e → --ink-soft ---
  ["'#464c5e'", "'var(--ink-soft)'"],

  // --- 冷灰弱化文本 #757f9c/#999 → --muted-foreground ---
  ["'#757f9c'", "'var(--muted-foreground)'"],
  ['text-[#757f9c]', 'text-[var(--muted-foreground)]'],
  ["'#999'", "'var(--muted-foreground)'"],

  // --- 冷灰边框 #e3e7f1 → --border ---
  ["'#e3e7f1'", "'var(--border)'"],
  ['border-[#e3e7f1]', 'border-[var(--border)]'],
  ['hover:border-[#cbd3e6]', 'hover:border-[var(--border)]'],

  // --- 冷灰 hover/底色 #f6f6f6/#f2f3f7 → --surface-muted ---
  ["'#f6f6f6'", "'var(--surface-muted)'"],
  ["'#f2f3f7'", "'var(--surface-muted)'"],

  // --- 近白行底色 #fbfbff → --surface-subtle ---
  ["'#fbfbff'", "'var(--surface-subtle)'"],

  // --- 蓝焦点环 rgba(25,118,210,0.2) (#1976d2) → teal rgba(15,118,110,0.2) ---
  ['rgba(25,118,210,0.2)', 'rgba(15,118,110,0.2)'],

  // --- input.tsx 模板字符串里的 palette.primary.main + '33' alpha 后缀 ---
  [
    "${(theme as { palette: { primary: { main: string } } }).palette.primary.main}33",
    'rgba(15,118,110,0.2)',
  ],
];

const FILES = [
  // 非 ui/ 的 MUI 业务组件
  'src/components/staff/EmployeeCard.tsx',
  'src/components/staff/Paginator.tsx',
  'src/components/staff/CodeBlock.tsx',
  'src/components/staff/ExecutionBadge.tsx',
  'src/components/staff/LanguageSwitcher.tsx',
  'src/components/staff/EmployeeAvatarEditor.tsx',
  'src/components/staff/DetailField.tsx',
  'src/components/staff/ResourceImportDialog.tsx',
  'src/components/staff/BrandLogo.tsx',
  'src/components/staff/DataTable.tsx',
  'src/components/staff/AppHeader.tsx',
  'src/components/staff/ConfirmDialog.tsx',
  'src/components/staff/StatCard.tsx',
  'src/components/staff/EmployeeProfileEditor.tsx',
  // ui/ 里的 shadcn 名 MUI 组件（被 Traces/Debug 例外页通过 ui/index.js 使用）
  'src/components/staff/ui/input.tsx',
  'src/components/staff/ui/textarea.tsx',
  'src/components/staff/ui/card.tsx',
  'src/components/staff/ui/alert.tsx',
  'src/components/staff/ui/badge.tsx',
  'src/components/staff/ui/tabs.tsx',
  'src/components/staff/ui/table.tsx',
  'src/components/staff/ui/separator.tsx',
  'src/components/staff/ui/pagination.tsx',
  'src/components/staff/ui/alert-dialog.tsx',
  'src/components/staff/ui/underline-tabs.tsx',
];

let totalChanges = 0;
const report = [];

for (const rel of FILES) {
  const file = resolve(ROOT, rel);
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    report.push(`SKIP (missing) ${rel}`);
    continue;
  }
  let out = src;
  const perFile = [];
  for (const [find, repl] of REPLACEMENTS) {
    if (!out.includes(find)) continue;
    let count = 0;
    out = out.replaceAll(find, () => {
      count++;
      return repl;
    });
    if (count > 0) perFile.push(`    ${JSON.stringify(find)} → ${JSON.stringify(repl)}  ×${count}`);
  }
  if (perFile.length > 0) {
    totalChanges += perFile.reduce((s, l) => s + Number(l.match(/×(\d+)/)[1]), 0);
    report.push(`FILE ${rel}  (${perFile.length} 类替换)`);
    report.push(...perFile);
    if (APPLY) writeFileSync(file, out, 'utf8');
  }
}

console.log(report.join('\n'));
console.log(`\n=== ${APPLY ? 'APPLIED' : 'DRY-RUN'} — 共 ${totalChanges} 处替换 ===`);
