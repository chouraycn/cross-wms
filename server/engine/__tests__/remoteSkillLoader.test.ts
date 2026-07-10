import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { RemoteSkillLoader } from "../remoteSkillLoader.js";

const TMP = path.join(os.tmpdir(), `rsl-test-${Date.now()}`);
const CACHE = path.join(TMP, "cache");
const TARGET = path.join(TMP, "skills");
const REG_V1 = path.join(TMP, "reg", "v1");
const REG_V2 = path.join(TMP, "reg", "v2");

function writeSkill(dir: string, version: string, body: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: demo\ndescription: demo skill\nversion: ${version}\ntriggers:\n  - keyword:demo\n---\n${body}`,
  );
  fs.writeFileSync(path.join(dir, "asset.txt"), `version=${version}`);
}

beforeAll(() => {
  fs.mkdirSync(TMP, { recursive: true });
  writeSkill(REG_V1, "1.0.0", "body v1");
  writeSkill(REG_V2, "2.0.0", "body v2");
});

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("RemoteSkillLoader 远程安装/下载/回退生命周期", () => {
  it("安装 v1 后记录当前版本并写入目标目录", async () => {
    const loader = new RemoteSkillLoader({ cacheDir: CACHE });
    loader.addSource({ type: "local", url: REG_V1, enabled: true, priority: 0 });
    const res = await loader.installSkill("demo", "1.0.0", REG_V1, TARGET);
    expect(res.success).toBe(true);
    expect(res.version).toBe("1.0.0");
    expect(res.installedPath).toBe(TARGET);

    const installed = loader.getInstalledSkills();
    expect(installed).toHaveLength(1);
    expect(installed[0].version).toBe("1.0.0");

    // 目标目录应包含 SKILL.md 且版本为 1.0.0
    const md = fs.readFileSync(path.join(TARGET, "SKILL.md"), "utf-8");
    expect(md).toContain("version: 1.0.0");
    expect(fs.readFileSync(path.join(TARGET, "asset.txt"), "utf-8")).toBe("version=1.0.0");
  });

  it("安装 v2 时保留 v1 历史备份并切换当前版本", async () => {
    const loader = new RemoteSkillLoader({ cacheDir: CACHE });
    loader.addSource({ type: "local", url: REG_V2, enabled: true, priority: 0 });
    const res = await loader.installSkill("demo", "2.0.0", REG_V2, TARGET);
    expect(res.success).toBe(true);
    expect(res.version).toBe("2.0.0");

    const installed = loader.getInstalledSkills();
    expect(installed[0].version).toBe("2.0.0");

    // 版本历史应包含两个版本
    const versions = loader.listVersions("demo");
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.version).sort()).toEqual(["1.0.0", "2.0.0"]);
    expect(versions.find((v) => v.version === "2.0.0")!.current).toBe(true);
    expect(versions.find((v) => v.version === "1.0.0")!.current).toBe(false);

    // 历史备份目录存在
    expect(fs.existsSync(path.join(CACHE, ".history", "demo", "1.0.0", "SKILL.md"))).toBe(true);
  });

  it("回退到 v1：还原文件并更新 currentVersion", async () => {
    const loader = new RemoteSkillLoader({ cacheDir: CACHE });
    const res = await loader.rollbackSkill("demo", "1.0.0");
    expect(res.success).toBe(true);
    expect(res.version).toBe("1.0.0");

    const installed = loader.getInstalledSkills();
    expect(installed[0].version).toBe("1.0.0");

    const md = fs.readFileSync(path.join(TARGET, "SKILL.md"), "utf-8");
    expect(md).toContain("version: 1.0.0");
    expect(fs.readFileSync(path.join(TARGET, "asset.txt"), "utf-8")).toBe("version=1.0.0");

    const versions = loader.listVersions("demo");
    expect(versions.find((v) => v.version === "1.0.0")!.current).toBe(true);
    expect(versions.find((v) => v.version === "2.0.0")!.current).toBe(false);
  });

  it("回退到不存在的版本应失败", async () => {
    const loader = new RemoteSkillLoader({ cacheDir: CACHE });
    const res = await loader.rollbackSkill("demo", "9.9.9");
    expect(res.success).toBe(false);
    expect(res.error).toContain("历史版本");
  });

  it("回退后再安装 v3 仍可前进（备份链完整）", async () => {
    const REG_V3 = path.join(TMP, "reg", "v3");
    writeSkill(REG_V3, "3.0.0", "body v3");
    const loader = new RemoteSkillLoader({ cacheDir: CACHE });
    loader.addSource({ type: "local", url: REG_V3, enabled: true, priority: 0 });
    const res = await loader.installSkill("demo", "3.0.0", REG_V3, TARGET);
    expect(res.success).toBe(true);
    expect(loader.listVersions("demo").map((v) => v.version).sort()).toEqual([
      "1.0.0",
      "2.0.0",
      "3.0.0",
    ]);
    // 当前为 3.0.0，可回退到 2.0.0
    const rb = await loader.rollbackSkill("demo", "2.0.0");
    expect(rb.success).toBe(true);
    expect(rb.version).toBe("2.0.0");
  });

  it("卸载技能清理 live 目录与历史", async () => {
    const loader = new RemoteSkillLoader({ cacheDir: CACHE });
    // 重新安装到 live（上一步回退到了 2.0.0，live 目录仍有内容）
    expect(fs.existsSync(TARGET)).toBe(true);
    const ok = await loader.uninstallSkill("demo");
    expect(ok).toBe(true);
    expect(loader.getInstalledSkills()).toHaveLength(0);
    // 历史目录被清理
    expect(fs.existsSync(path.join(CACHE, ".history", "demo"))).toBe(false);
  });

  it("version history 持久化到 installed.json 并在新实例中恢复", async () => {
    // 重新安装 v1/v2 以生成 manifest
    const loader = new RemoteSkillLoader({ cacheDir: CACHE });
    loader.addSource({ type: "local", url: REG_V1, enabled: true, priority: 0 });
    await loader.installSkill("demo", "1.0.0", REG_V1, TARGET);
    loader.addSource({ type: "local", url: REG_V2, enabled: true, priority: 0 });
    await loader.installSkill("demo", "2.0.0", REG_V2, TARGET);

    // 新实例从 manifest 恢复历史
    const reloaded = new RemoteSkillLoader({ cacheDir: CACHE });
    const versions = reloaded.listVersions("demo");
    expect(versions.map((v) => v.version).sort()).toEqual(["1.0.0", "2.0.0"]);
  });
});
