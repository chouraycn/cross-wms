/**
 * 插件技能系统测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  PluginSkillsManager,
  resetPluginSkillsManager,
} from "../lifecycle/plugin-skills.js";

describe("PluginSkillsManager", () => {
  let manager: PluginSkillsManager;
  let tempDir: string;

  beforeEach(async () => {
    resetPluginSkillsManager();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-skills-"));
    manager = new PluginSkillsManager({ pluginDirs: [tempDir] });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("addPluginDir", () => {
    it("should add plugin directory", () => {
      manager.addPluginDir("/new/plugin/dir");
      const config = manager.getConfig();

      expect(config.pluginDirs).toContain("/new/plugin/dir");
    });

    it("should not add duplicate directory", () => {
      manager.addPluginDir("/plugin/dir");
      manager.addPluginDir("/plugin/dir");

      const config = manager.getConfig();
      const count = config.pluginDirs?.filter((d) => d === "/plugin/dir").length || 0;

      expect(count).toBe(1);
    });
  });

  describe("discoverPlugins", () => {
    it("should return empty array for empty directory", async () => {
      const plugins = await manager.discoverPlugins();
      expect(plugins).toEqual([]);
    });

    it("should discover valid plugins", async () => {
      // 创建测试插件
      const pluginDir = path.join(tempDir, "test-plugin");
      await fs.mkdir(pluginDir, { recursive: true });

      const manifest = {
        id: "test-plugin",
        version: "1.0.0",
        skills: [{ path: "skills/test-skill" }],
      };

      await fs.writeFile(
        path.join(pluginDir, "openclaw.plugin.json"),
        JSON.stringify(manifest)
      );

      const plugins = await manager.discoverPlugins();
      expect(plugins.length).toBeGreaterThan(0);
      expect(plugins[0].manifest.id).toBe("test-plugin");
    });
  });

  describe("getPlugin", () => {
    it("should return undefined for unknown plugin", () => {
      const plugin = manager.getPlugin("unknown-plugin");
      expect(plugin).toBeUndefined();
    });
  });

  describe("getLoadedPlugins", () => {
    it("should return empty array initially", () => {
      const loaded = manager.getLoadedPlugins();
      expect(loaded).toEqual([]);
    });
  });

  describe("getConfig", () => {
    it("should return current config", () => {
      const config = manager.getConfig();
      expect(config).toBeDefined();
      expect(config.pluginDirs).toBeDefined();
    });
  });
});