/**
 * 插件类检查
 * 包含插件注册表、插件清单验证等检查
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type {
  DoctorCheck,
  DoctorCheckResult,
  DoctorContext,
  DoctorFinding,
} from "../types.js";
import { DoctorSeverity, DoctorCategory } from "../types.js";

const PluginManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  main: z.string().optional(),
  author: z.string().optional(),
  type: z.enum(["tool", "channel", "skill", "plugin"]).optional(),
});

export const pluginChecks: DoctorCheck[] = [
  {
    id: "doctor-plugin-registry",
    category: DoctorCategory.PLUGINS,
    title: "插件注册表检查",
    description: "检查插件注册表状态和已注册插件",
    run: checkPluginRegistry,
  },
  {
    id: "doctor-plugin-manifests",
    category: DoctorCategory.PLUGINS,
    title: "插件清单验证",
    description: "验证插件清单文件的有效性",
    run: checkPluginManifests,
  },
];

async function checkPluginRegistry(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];
  const pluginsDir = join(context.workspaceDir, "plugins");

  if (!existsSync(pluginsDir)) {
    findings.push({
      id: "doctor/plugins/dir-missing",
      severity: "info",
      message: "插件目录不存在",
      target: pluginsDir,
      fixHint: "如果需要插件功能，请创建插件目录",
      fixable: false,
    });

    return {
      checkId: "doctor-plugin-registry",
      category: DoctorCategory.PLUGINS,
      severity: DoctorSeverity.INFO,
      title: "插件注册表检查",
      description: "检查插件注册表状态和已注册插件",
      findings,
      details: { pluginsDir },
    };
  }

  try {
    const entries = readdirSync(pluginsDir, { withFileTypes: true });
    const pluginDirs = entries.filter((e) => e.isDirectory());
    const pluginFiles = entries.filter(
      (e) => e.isFile() && e.name.endsWith(".js") || e.name.endsWith(".mjs"),
    );

    findings.push({
      id: "doctor/plugins/count",
      severity: "info",
      message: `发现 ${pluginDirs.length} 个插件目录和 ${pluginFiles.length} 个插件文件`,
      target: pluginsDir,
      fixable: false,
    });

    if (pluginDirs.length === 0 && pluginFiles.length === 0) {
      findings.push({
        id: "doctor/plugins/empty",
        severity: "info",
        message: "插件目录为空，没有已安装的插件",
        target: pluginsDir,
        fixHint: "可通过插件管理器安装插件",
        fixable: false,
      });
    }

    return {
      checkId: "doctor-plugin-registry",
      category: DoctorCategory.PLUGINS,
      severity: DoctorSeverity.INFO,
      title: "插件注册表检查",
      description: "检查插件注册表状态和已注册插件",
      findings,
      details: {
        pluginsDir,
        pluginDirCount: pluginDirs.length,
        pluginFileCount: pluginFiles.length,
        pluginNames: pluginDirs.map((d) => d.name),
      },
    };
  } catch (err) {
    findings.push({
      id: "doctor/plugins/read-error",
      severity: "warning",
      message: `无法读取插件目录: ${err instanceof Error ? err.message : String(err)}`,
      target: pluginsDir,
      fixHint: "检查目录权限和路径正确性",
      fixable: false,
    });

    return {
      checkId: "doctor-plugin-registry",
      category: DoctorCategory.PLUGINS,
      severity: DoctorSeverity.WARN,
      title: "插件注册表检查",
      description: "检查插件注册表状态和已注册插件",
      findings,
      details: { pluginsDir },
    };
  }
}

async function checkPluginManifests(
  context: DoctorContext,
): Promise<DoctorCheckResult> {
  const findings: DoctorFinding[] = [];
  const pluginsDir = join(context.workspaceDir, "plugins");
  let validPlugins = 0;
  let invalidPlugins = 0;
  let checkedPlugins = 0;

  if (!existsSync(pluginsDir)) {
    findings.push({
      id: "doctor/plugins/manifests-no-dir",
      severity: "info",
      message: "插件目录不存在，跳过清单验证",
      target: pluginsDir,
      fixable: false,
    });

    return {
      checkId: "doctor-plugin-manifests",
      category: DoctorCategory.PLUGINS,
      severity: DoctorSeverity.INFO,
      title: "插件清单验证",
      description: "验证插件清单文件的有效性",
      findings,
      details: { pluginsDir, checkedPlugins: 0 },
    };
  }

  try {
    const entries = readdirSync(pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const manifestPath = join(pluginsDir, entry.name, "package.json");
      checkedPlugins++;

      if (!existsSync(manifestPath)) {
        invalidPlugins++;
        findings.push({
          id: `doctor/plugins/manifest-missing-${entry.name}`,
          severity: "warning",
          message: `插件 "${entry.name}" 缺少 package.json 清单文件`,
          target: manifestPath,
          fixHint: "创建 package.json 清单文件",
          fixable: false,
        });
        continue;
      }

      try {
        const raw = readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(raw);
        const result = PluginManifestSchema.safeParse(manifest);

        if (!result.success) {
          invalidPlugins++;
          for (const issue of result.error.issues) {
            findings.push({
              id: `doctor/plugins/manifest-invalid-${entry.name}-${issue.path.join(".")}`,
              severity: "warning",
              message: `插件 "${entry.name}" 清单字段 ${issue.path.join(".")} 无效: ${issue.message}`,
              target: manifestPath,
              fixHint: `修正清单文件中的 ${issue.path.join(".")} 字段`,
              fixable: false,
            });
          }
        } else {
          validPlugins++;
        }
      } catch (err) {
        invalidPlugins++;
        findings.push({
          id: `doctor/plugins/manifest-error-${entry.name}`,
          severity: "error",
          message: `插件 "${entry.name}" 清单文件解析失败: ${err instanceof Error ? err.message : String(err)}`,
          target: manifestPath,
          fixHint: "检查 package.json 文件格式是否正确",
          fixable: false,
        });
      }
    }

    const severity = findings.some((f) => f.severity === "error")
      ? DoctorSeverity.FAIL
      : findings.length > 0
        ? DoctorSeverity.WARN
        : DoctorSeverity.PASS;

    return {
      checkId: "doctor-plugin-manifests",
      category: DoctorCategory.PLUGINS,
      severity,
      title: "插件清单验证",
      description: "验证插件清单文件的有效性",
      findings,
      details: {
        pluginsDir,
        checkedPlugins,
        validPlugins,
        invalidPlugins,
      },
    };
  } catch (err) {
    findings.push({
      id: "doctor/plugins/manifests-check-error",
      severity: "error",
      message: `插件清单检查失败: ${err instanceof Error ? err.message : String(err)}`,
      fixHint: "检查插件目录权限",
      fixable: false,
    });

    return {
      checkId: "doctor-plugin-manifests",
      category: DoctorCategory.PLUGINS,
      severity: DoctorSeverity.FAIL,
      title: "插件清单验证",
      description: "验证插件清单文件的有效性",
      findings,
      details: { pluginsDir },
    };
  }
}
