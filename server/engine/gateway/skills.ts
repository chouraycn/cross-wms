import { logger } from "../../logger.js";
import {
  getSkills,
  refreshSkills,
  searchSkills,
  computeSkillStatus,
  formatStatusReport,
  installSkill,
  uninstallSkill,
  searchClawHubSkills,
  fetchClawHubSkillDetail,
  getSkillSecurityVerdict,
  getVerdictSummary,
  type SkillStatusSummary,
  type ClawHubSkillSearchResult,
  type ClawHubSkillDetail,
  type SecurityVerdict,
} from "../skills/index.js";

export type SkillStatusResult = {
  status: SkillStatusSummary;
  report: string;
};

export type SkillSearchResult = {
  results: Array<{
    id: string;
    name: string;
    description: string;
    version: string;
    source: string;
  }>;
  total: number;
};

export type SkillDetailResult = {
  id: string;
  name: string;
  description: string;
  version: string;
  source: string;
  enabled: boolean;
  status: string;
};

export type SkillInstallResult = {
  success: boolean;
  message: string;
  skillId?: string;
  version?: string;
};

export type SkillSecurityResult = {
  slug: string;
  version?: string;
  verdict: SecurityVerdict;
  summary: string;
};

export type ClawHubSearchResult = {
  results: ClawHubSkillSearchResult[];
  total: number;
};

export type ClawHubDetailResult = ClawHubSkillDetail | null;

export const skillsHandlers = {
  async skills_status(): Promise<SkillStatusResult> {
    logger.debug("[Gateway:Skills] skills.status called");
    await refreshSkills(process.cwd());
    const entries = getSkills();
    const status = computeSkillStatus(entries);
    const report = formatStatusReport(status);
    return { status, report };
  },

  async skills_search(params: { query?: string; limit?: number }): Promise<SkillSearchResult> {
    const { query, limit = 20 } = params || {};
    logger.debug("[Gateway:Skills] skills.search called", { query, limit });

    const entries = getSkills();
    const results = searchSkills(entries, query || "", limit);

    const mappedResults = results.map((entry) => ({
      id: entry.skill.name,
      name: entry.skill.name,
      description: entry.skill.description || "",
      version: entry.skill.version || "0.0.0",
      source: entry.source,
    }));

    return {
      results: mappedResults,
      total: mappedResults.length,
    };
  },

  async skills_detail(params: { id: string }): Promise<SkillDetailResult | null> {
    const { id } = params || {};
    logger.debug("[Gateway:Skills] skills.detail called", { id });

    if (!id) {
      return null;
    }

    const entries = getSkills();
    const entry = entries.find((e) => e.skill.name === id);

    if (!entry) {
      return null;
    }

    return {
      id: entry.skill.name,
      name: entry.skill.name,
      description: entry.skill.description || "",
      version: entry.skill.version || "0.0.0",
      source: entry.source,
      enabled: entry.promptVisible,
      status: entry.runtimeVisible ? "active" : "inactive",
    };
  },

  async skills_install(params: { spec: string; version?: string }): Promise<SkillInstallResult> {
    const { spec, version } = params || {};
    logger.debug("[Gateway:Skills] skills.install called", { spec, version });

    if (!spec) {
      return { success: false, message: "安装规范（spec）不能为空" };
    }

    try {
      const result = await installSkill(spec, { version });

      if (result.success) {
        await refreshSkills(process.cwd());
        return {
          success: true,
          message: `技能 ${result.skill?.name || spec} 安装成功`,
          skillId: result.skill?.name,
          version: result.skill?.version,
        };
      }

      return { success: false, message: result.error || "安装失败" };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("[Gateway:Skills] skills.install error:", err);
      return { success: false, message: errorMessage };
    }
  },

  async skills_uninstall(params: { id: string }): Promise<SkillInstallResult> {
    const { id } = params || {};
    logger.debug("[Gateway:Skills] skills.uninstall called", { id });

    if (!id) {
      return { success: false, message: "技能 ID 不能为空" };
    }

    try {
      const result = await uninstallSkill(id);

      if (result.success) {
        await refreshSkills(process.cwd());
        return { success: true, message: `技能 ${id} 卸载成功` };
      }

      return { success: false, message: result.error || "卸载失败" };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("[Gateway:Skills] skills.uninstall error:", err);
      return { success: false, message: errorMessage };
    }
  },

  async skills_enable(params: { id: string }): Promise<{ success: boolean; message: string }> {
    const { id } = params || {};
    logger.debug("[Gateway:Skills] skills.enable called", { id });

    if (!id) {
      return { success: false, message: "技能 ID 不能为空" };
    }

    await refreshSkills(process.cwd());
    const entries = getSkills();
    const entry = entries.find((e) => e.skill.name === id);

    if (!entry) {
      return { success: false, message: `技能 ${id} 不存在` };
    }

    return { success: true, message: `技能 ${id} 已启用` };
  },

  async skills_disable(params: { id: string }): Promise<{ success: boolean; message: string }> {
    const { id } = params || {};
    logger.debug("[Gateway:Skills] skills.disable called", { id });

    if (!id) {
      return { success: false, message: "技能 ID 不能为空" };
    }

    await refreshSkills(process.cwd());
    const entries = getSkills();
    const entry = entries.find((e) => e.skill.name === id);

    if (!entry) {
      return { success: false, message: `技能 ${id} 不存在` };
    }

    return { success: true, message: `技能 ${id} 已禁用` };
  },

  async skills_clawhub_search(params: { query?: string; limit?: number }): Promise<ClawHubSearchResult> {
    const { query, limit = 20 } = params || {};
    logger.debug("[Gateway:Skills] skills.clawhub_search called", { query, limit });

    const results = searchClawHubSkills(query, limit);

    return {
      results,
      total: results.length,
    };
  },

  async skills_clawhub_detail(params: { slug: string }): Promise<ClawHubDetailResult> {
    const { slug } = params || {};
    logger.debug("[Gateway:Skills] skills.clawhub_detail called", { slug });

    if (!slug) {
      return null;
    }

    return fetchClawHubSkillDetail(slug);
  },

  async skills_securityVerdicts(params: { slug: string; version?: string }): Promise<SkillSecurityResult> {
    const { slug, version } = params || {};
    logger.debug("[Gateway:Skills] skills.securityVerdicts called", { slug, version });

    if (!slug) {
      throw new Error("slug 参数不能为空");
    }

    const verdict = await getSkillSecurityVerdict(slug, version);
    const summary = getVerdictSummary(verdict);

    return { slug, version, verdict, summary };
  },

  async skills_verify(params: { slug: string; version?: string }): Promise<SkillSecurityResult> {
    const { slug, version } = params || {};
    logger.debug("[Gateway:Skills] skills.verify called", { slug, version });

    if (!slug) {
      throw new Error("slug 参数不能为空");
    }

    const verdict = await getSkillSecurityVerdict(slug, version);
    const summary = getVerdictSummary(verdict);

    return { slug, version, verdict, summary };
  },
};