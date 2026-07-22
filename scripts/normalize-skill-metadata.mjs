#!/usr/bin/env node
/**
 * 技能元数据标准化脚本
 * 统一所有 SKILL.md 文件的 frontmatter 格式
 */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const SKILLS_DIR = process.argv[2] || "./skills";

/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { data: {}, body: content };

  const yamlStr = match[1];
  const body = content.slice(match[0].length).trimStart();

  try {
    const data = YAML.parse(yamlStr);
    return { data, body };
  } catch (err) {
    console.warn(`YAML parse warning: ${err.message}`);
    return { data: {}, body: content };
  }
}

/**
 * 序列化 frontmatter 为标准格式
 */
function serializeFrontmatter(data) {
  // 构建标准化的顶层字段
  const output = {};

  // 核心字段（顺序固定）
  if (data.name) output.name = data.name;
  if (data.description) output.description = data.description;
  if (data.version) output.version = data.version;
  if (data.homepage) output.homepage = data.homepage;

  // 构建 metadata 对象
  const metadata = {};

  // openclaw 子字段
  const openclaw = {};
  if (data.emoji) openclaw.emoji = data.emoji;
  if (data.requires) openclaw.requires = data.requires;
  if (data.install) openclaw.install = data.install;
  if (Object.keys(openclaw).length > 0) metadata.openclaw = openclaw;

  // crosswms 子字段
  const crosswms = {};
  if (data.category) crosswms.category = data.category;
  if (data.icon) crosswms.icon = data.icon;
  if (data.tags) crosswms.tags = data.tags;
  if (data.trigger) crosswms.trigger = data.trigger;
  if (data.executionMode) crosswms.executionMode = data.executionMode;
  if (data.source) crosswms.source = data.source;
  if (data.featured !== undefined) crosswms.featured = data.featured;
  if (data.status) crosswms.status = data.status;
  if (Object.keys(crosswms).length > 0) metadata.crosswms = crosswms;

  if (Object.keys(metadata).length > 0) {
    output.metadata = metadata;
  }

  const yamlStr = YAML.stringify(output, {
    indent: 2,
    lineWidth: 0, // 不自动换行
    sortMapEntries: false, // 保持插入顺序
  }).trim();

  return `---\n${yamlStr}\n---`;
}

/**
 * 合并交叉字段（从现有数据中提取）
 */
function normalizeData(data, skillName) {
  const normalized = { ...data };

  // 确保 name 存在
  if (!normalized.name) normalized.name = skillName;

  // 确保 description 存在
  if (!normalized.description) {
    normalized.description = `CDF Know Clow ${normalized.name} 技能`;
  }

  // 确保 version 存在
  if (!normalized.version) normalized.version = "1.0.0";

  // 从 metadata.openclaw 提取字段
  if (data.metadata?.openclaw) {
    const oc = data.metadata.openclaw;
    if (oc.emoji && !normalized.emoji) normalized.emoji = oc.emoji;
    if (oc.requires && !normalized.requires) normalized.requires = oc.requires;
    if (oc.install && !normalized.install) normalized.install = oc.install;
  }

  // 从 metadata.crosswms 提取字段
  if (data.metadata?.crosswms) {
    const cw = data.metadata.crosswms;
    if (cw.category && !normalized.category) normalized.category = cw.category;
    if (cw.icon && !normalized.icon) normalized.icon = cw.icon;
    if (cw.tags && !normalized.tags) normalized.tags = cw.tags;
    if (cw.trigger && !normalized.trigger) normalized.trigger = cw.trigger;
    if (cw.executionMode && !normalized.executionMode) normalized.executionMode = cw.executionMode;
    if (cw.source && !normalized.source) normalized.source = cw.source;
    if (cw.featured !== undefined && normalized.featured === undefined) normalized.featured = cw.featured;
    if (cw.status && !normalized.status) normalized.status = cw.status;
  }

  // 处理旧字段映射
  if (data.triggers && !normalized.trigger) {
    normalized.trigger = data.triggers.join(" / ");
  }
  if (data["allowed-tools"] && !normalized.allowedTools) {
    normalized.allowedTools = data["allowed-tools"];
  }

  // 默认 category
  if (!normalized.category) {
    if (skillName.startsWith("builtin-")) normalized.category = "core";
    else if (skillName.startsWith("wms_")) normalized.category = "wms";
    else normalized.category = "general";
  }

  // 默认 source
  if (!normalized.source) {
    if (skillName.startsWith("builtin-")) normalized.source = "builtin";
    else normalized.source = "workspace";
  }

  // 默认 status
  if (!normalized.status) normalized.status = "active";

  // 默认 executionMode
  if (!normalized.executionMode) normalized.executionMode = "agent";

  return normalized;
}

/**
 * 处理单个技能文件
 */
function processSkill(skillDir) {
  const skillFile = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillFile)) return null;

  const content = fs.readFileSync(skillFile, "utf-8");
  const { data, body } = parseFrontmatter(content);
  const skillName = path.basename(skillDir);

  const normalized = normalizeData(data, skillName);
  const newFrontmatter = serializeFrontmatter(normalized);

  const newContent = `${newFrontmatter}\n\n${body}`;

  // 只在内容变化时写入
  if (newContent.trim() !== content.trim()) {
    fs.writeFileSync(skillFile, newContent, "utf-8");
    return { name: skillName, updated: true };
  }

  return { name: skillName, updated: false };
}

// 主程序
console.log("=== 技能元数据标准化 ===\n");

const skillDirs = fs
  .readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(SKILLS_DIR, d.name));

let updated = 0;
let skipped = 0;
const errors = [];

for (const dir of skillDirs) {
  try {
    const result = processSkill(dir);
    if (!result) {
      skipped++;
      continue;
    }
    if (result.updated) {
      console.log(`✅ 已更新: ${result.name}`);
      updated++;
    } else {
      console.log(`⏭️  跳过: ${result.name} (已是标准格式)`);
      skipped++;
    }
  } catch (err) {
    console.error(`❌ 错误: ${path.basename(dir)} - ${err.message}`);
    errors.push({ dir: path.basename(dir), error: err.message });
  }
}

console.log(`\n=== 完成 ===`);
console.log(`已更新: ${updated}`);
console.log(`跳过: ${skipped}`);
console.log(`错误: ${errors.length}`);

if (errors.length > 0) {
  console.log("\n错误详情:");
  errors.forEach((e) => console.log(`  - ${e.dir}: ${e.error}`));
}
