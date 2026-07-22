// Skills CLI registration for managing agent skills.
// 移植自 openclaw/src/cli/skills-cli.ts。

import type { Command } from "commander";
import { scanWorkbuddySkills, parseSkillMd } from "./skills-cli.scanner.js";
import {
  formatDependencyResult,
  generateDependencyReport,
  checkDependencies,
  checkAllDependencies,
  detectCycles,
} from "../skills/lifecycle/dependency.js";

/** ANSI 颜色 */
const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

/** 加载所有技能 entry（供依赖检查使用） */
function loadAllEntries() {
  return scanWorkbuddySkills().map((s) => {
    const { frontmatter } = parseSkillMd(s.body);
    return {
      skill: {
        name: s.dirName,
        description: s.description,
        filePath: s.body,
        baseDir: "",
        source: "bundled" as const,
        disableModelInvocation: false,
      },
      frontmatter,
    };
  });
}

/** 注册 `skills deps` 子命令 */
function registerDepsCommand(skills: Command): void {
  const deps = skills.command("deps").description("检查技能依赖与冲突");

  deps
    .command("check")
    .description("检查所有技能依赖与冲突")
    .option("--json", "以 JSON 格式输出", false)
    .option("--skill <name>", "检查指定技能（默认全部）")
    .action((opts: { json?: boolean; skill?: string }) => {
      const entries = loadAllEntries();

      if (opts.skill) {
        const entry = entries.find((e) => e.skill.name === opts.skill);
        if (!entry) {
          console.error(`${c.red}错误${c.reset}: 找不到技能 "${opts.skill}"`);
          process.exit(1);
        }
        const result = checkDependencies(entry, entries);
        if (opts.json) {
          console.log(JSON.stringify({ skill: opts.skill, result }, null, 2));
        } else {
          console.log(formatDependencyResult(opts.skill, result));
        }
        process.exit(result.valid ? 0 : 1);
      }

      const results = checkAllDependencies(entries);
      let hasError = false;
      for (const [skillId, result] of results) {
        if (!result.valid) {
          hasError = true;
        }
      }

      if (opts.json) {
        const obj: Record<string, unknown> = {};
        for (const [id, r] of results) obj[id] = r;
        console.log(JSON.stringify(obj, null, 2));
      } else {
        console.log(generateDependencyReport(entries));
      }
      process.exit(hasError ? 1 : 0);
    });

  deps
    .command("graph")
    .description("以文本格式输出依赖图谱")
    .option("--json", "以 JSON 格式输出", false)
    .option("--filter <type>", "过滤边类型：required|optional|conflicts", "all")
    .action((opts: { json?: boolean; filter?: string }) => {
      const scanned = scanWorkbuddySkills();
      const nodeMap = new Map<string, { id: string; name: string }>();
      for (const s of scanned) nodeMap.set(s.dirName, { id: s.dirName, name: s.name });

      const nodes = Array.from(nodeMap.values());
      const edges: Array<{ source: string; target: string; type: string }> = [];
      for (const s of scanned) {
        const { frontmatter } = parseSkillMd(s.body);
        if (frontmatter.dependencies) {
          try {
            const deps = JSON.parse(frontmatter.dependencies);
            if (Array.isArray(deps)) {
              for (const dep of deps) {
                if (typeof dep === "string") {
                  edges.push({ source: s.dirName, target: dep, type: "required" });
                } else if (dep && typeof dep === "object") {
                  const id = String((dep as Record<string, unknown>).skill ?? (dep as Record<string, unknown>).name ?? "");
                  if (id) {
                    edges.push({
                      source: s.dirName,
                      target: id,
                      type: (dep as Record<string, unknown>).required === false ? "optional" : "required",
                    });
                  }
                }
              }
            }
          } catch {
            // ignore
          }
        }
        if (frontmatter.conflicts) {
          try {
            const conflicts = JSON.parse(frontmatter.conflicts);
            if (Array.isArray(conflicts)) {
              for (const c2 of conflicts) {
                if (typeof c2 === "string") {
                  edges.push({ source: s.dirName, target: c2, type: "conflicts" });
                } else if (c2 && typeof c2 === "object") {
                  const id = String((c2 as Record<string, unknown>).skill ?? (c2 as Record<string, unknown>).name ?? "");
                  if (id) edges.push({ source: s.dirName, target: id, type: "conflicts" });
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }

      const filtered = opts.filter && opts.filter !== "all" ? edges.filter((e) => e.type === opts.filter) : edges;

      if (opts.json) {
        console.log(JSON.stringify({ nodes, edges: filtered }, null, 2));
        return;
      }

      console.log(`${c.bold}技能依赖图谱${c.reset}`);
      console.log(`${c.gray}=========================${c.reset}`);
      console.log(`节点数: ${c.cyan}${nodes.length}${c.reset}, 边数: ${c.cyan}${filtered.length}${c.reset}`);
      console.log();
      if (filtered.length === 0) {
        console.log(`${c.yellow}暂无依赖关系${c.reset}`);
        return;
      }
      for (const e of filtered) {
        const color = e.type === "required" ? c.blue : e.type === "conflicts" ? c.red : c.gray;
        const symbol = e.type === "required" ? "→" : e.type === "conflicts" ? "⚡" : "⇢";
        console.log(`  ${color}${symbol}${c.reset} ${c.bold}${e.source}${c.reset} ${c.dim}→${c.reset} ${e.target}  ${color}[${e.type}]${c.reset}`);
      }
    });

  deps
    .command("cycles")
    .description("检测循环依赖")
    .option("--json", "以 JSON 格式输出", false)
    .action((opts: { json?: boolean }) => {
      const entries = loadAllEntries();
      const cycles = detectCycles(entries);

      if (opts.json) {
        console.log(JSON.stringify({ cycles }, null, 2));
      } else {
        if (cycles.length === 0) {
          console.log(`${c.green}✅ 未检测到循环依赖${c.reset}`);
        } else {
          console.log(`${c.red}❌ 检测到 ${cycles.length} 个循环依赖:${c.reset}`);
          for (const cycle of cycles) {
            console.log(`  ${c.yellow}${cycle.join(" → ")} → ${cycle[0]}${c.reset}`);
          }
        }
      }
      process.exit(cycles.length > 0 ? 1 : 0);
    });
}

/** Register the `skills` CLI command and subcommands. */
export function registerSkillsCli(program: Command): void {
  const skills = program.command("skills").description("Manage agent skills");

  skills
    .command("list")
    .description("List configured skills")
    .option("--json", "Output JSON", false)
    .action((opts: { json?: boolean }) => {
      const scanned = scanWorkbuddySkills();
      if (opts.json) {
        console.log(JSON.stringify(scanned.map((s) => ({ id: s.dirName, name: s.name, description: s.description })), null, 2));
      } else {
        console.log(`${c.bold}技能列表${c.reset} ${c.gray}(共 ${scanned.length} 个)${c.reset}`);
        for (const s of scanned) {
          console.log(`  ${c.cyan}${s.dirName}${c.reset}  ${s.name}  ${c.gray}${s.description.slice(0, 60)}${c.reset}`);
        }
      }
    });

  skills
    .command("info")
    .description("Show skill details")
    .argument("<name>", "Skill name")
    .action((name: string) => {
      const scanned = scanWorkbuddySkills();
      const target = scanned.find((s) => s.dirName === name);
      if (!target) {
        console.error(`${c.red}错误${c.reset}: 找不到技能 "${name}"`);
        process.exit(1);
      }
      const { frontmatter } = parseSkillMd(target.body);
      console.log(`${c.bold}${target.name}${c.reset} ${c.gray}(${target.dirName})${c.reset}`);
      console.log();
      console.log(`${c.dim}描述:${c.reset} ${target.description}`);
      if (Object.keys(frontmatter).length > 0) {
        console.log();
        console.log(`${c.dim}元数据:${c.reset}`);
        for (const [k, v] of Object.entries(frontmatter)) {
          console.log(`  ${c.cyan}${k}${c.reset}: ${v}`);
        }
      }
    });

  registerDepsCommand(skills);

  skills.action(() => {
    skills.help();
  });
}
