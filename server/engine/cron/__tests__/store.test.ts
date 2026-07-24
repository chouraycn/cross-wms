import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveQuarantinePath,
  resolveCronStorePath,
  JsonCronJobStore,
  quarantineEntries,
  getDefaultCronStore,
  setDefaultCronStore,
} from "../store.js";
import type { CronJob } from "../types.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cron-store-test-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function createValidJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: "job-1",
    name: "Test Job",
    enabled: true,
    createdAtMs: 1700000000000,
    updatedAtMs: 1700000000000,
    schedule: { kind: "cron", expr: "0 * * * *" },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: { kind: "systemEvent", text: "test" },
    state: {},
    ...overrides,
  };
}

describe("resolveQuarantinePath", () => {
  it("json 后缀替换为 -quarantine.json", () => {
    expect(resolveQuarantinePath("/path/to/jobs.json")).toBe(
      "/path/to/jobs-quarantine.json",
    );
  });

  it("无 json 后缀时追加 -quarantine.json", () => {
    expect(resolveQuarantinePath("/path/to/jobs")).toBe(
      "/path/to/jobs-quarantine.json",
    );
  });

  it("多层路径正确处理", () => {
    expect(resolveQuarantinePath("/a/b/c/store.json")).toBe(
      "/a/b/c/store-quarantine.json",
    );
  });
});

describe("resolveCronStorePath", () => {
  it("显式路径返回绝对路径", () => {
    const result = resolveCronStorePath("/explicit/path/jobs.json");
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toContain("jobs.json");
  });

  it("空字符串返回默认路径", () => {
    const result = resolveCronStorePath("");
    expect(result).toContain("cron");
    expect(result).toContain("jobs.json");
  });

  it("undefined 返回默认路径", () => {
    const result = resolveCronStorePath(undefined);
    expect(result).toContain("cron");
    expect(result).toContain("jobs.json");
  });

  it("空白字符串返回默认路径", () => {
    const result = resolveCronStorePath("   ");
    expect(result).toContain("jobs.json");
  });

  it("~ 前缀展开为 home 目录", () => {
    const result = resolveCronStorePath("~/custom-cron.json");
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    expect(result.startsWith(home)).toBe(true);
  });
});

describe("JsonCronJobStore", () => {
  it("getStorePath 返回配置的路径", () => {
    const storePath = path.join(tempDir, "jobs.json");
    const store = new JsonCronJobStore(storePath);
    expect(store.getStorePath()).toBe(path.resolve(storePath));
  });

  it("getQuarantinePath 返回隔离文件路径", () => {
    const storePath = path.join(tempDir, "jobs.json");
    const store = new JsonCronJobStore(storePath);
    expect(store.getQuarantinePath()).toBe(
      path.resolve(path.join(tempDir, "jobs-quarantine.json")),
    );
  });

  it("load 不存在的文件返回空存储", async () => {
    const store = new JsonCronJobStore(path.join(tempDir, "missing.json"));
    const loaded = await store.load();
    expect(loaded.store.jobs).toEqual([]);
    expect(loaded.quarantineJobs).toEqual([]);
    expect(loaded.invalidConfigRows).toEqual([]);
  });

  it("save 后 load 能读回数据", async () => {
    const storePath = path.join(tempDir, "jobs.json");
    const store = new JsonCronJobStore(storePath);
    const job = createValidJob();
    await store.save({ version: 1, jobs: [job] });
    const loaded = await store.load();
    expect(loaded.store.jobs.length).toBe(1);
    expect(loaded.store.jobs[0].id).toBe("job-1");
    expect(loaded.store.jobs[0].name).toBe("Test Job");
  });

  it("load 过滤无效的 job 配置", async () => {
    const storePath = path.join(tempDir, "jobs.json");
    const store = new JsonCronJobStore(storePath);
    const validJob = createValidJob();
    const invalidJob = { id: 123, name: "bad" } as unknown as CronJob;
    await fs.promises.writeFile(
      storePath,
      JSON.stringify({ version: 1, jobs: [validJob, invalidJob] }),
    );
    const loaded = await store.load();
    expect(loaded.store.jobs.length).toBe(1);
    expect(loaded.invalidConfigRows.length).toBe(1);
    expect(loaded.invalidConfigRows[0].sourceIndex).toBe(1);
  });

  it("load 无效的存储文件格式返回空存储", async () => {
    const storePath = path.join(tempDir, "jobs.json");
    const store = new JsonCronJobStore(storePath);
    await fs.promises.writeFile(storePath, JSON.stringify({ notVersion: 1 }));
    const loaded = await store.load();
    expect(loaded.store.jobs).toEqual([]);
  });

  it("load 支持 JSON 注释", async () => {
    const storePath = path.join(tempDir, "jobs.json");
    const store = new JsonCronJobStore(storePath);
    const job = createValidJob();
    const raw = `{
      // this is a comment
      "version": 1,
      /* block comment */
      "jobs": [${JSON.stringify(job)}]
    }`;
    await fs.promises.writeFile(storePath, raw);
    const loaded = await store.load();
    expect(loaded.store.jobs.length).toBe(1);
  });

  it("load 为 job 补齐缺失的 state", async () => {
    const storePath = path.join(tempDir, "jobs.json");
    const store = new JsonCronJobStore(storePath);
    const job = createValidJob();
    // 删除 state 字段模拟旧数据
    const { state, ...jobWithoutState } = job;
    await fs.promises.writeFile(
      storePath,
      JSON.stringify({ version: 1, jobs: [jobWithoutState] }),
    );
    const loaded = await store.load();
    expect(loaded.store.jobs[0].state).toBeDefined();
    expect(loaded.store.jobs[0].state.consecutiveErrors).toBe(0);
  });

  it("loadQuarantine 不存在的文件返回空", async () => {
    const store = new JsonCronJobStore(path.join(tempDir, "missing.json"));
    const result = await store.loadQuarantine();
    expect(result.jobs).toEqual([]);
  });

  it("saveQuarantine 后 loadQuarantine 能读回", async () => {
    const storePath = path.join(tempDir, "jobs.json");
    const store = new JsonCronJobStore(storePath);
    await store.saveQuarantine({
      version: 1,
      jobs: [
        {
          quarantinedAtMs: 1700000000000,
          sourceIndex: 0,
          reason: "test reason",
        },
      ],
    });
    const loaded = await store.loadQuarantine();
    expect(loaded.jobs.length).toBe(1);
    expect(loaded.jobs[0].reason).toBe("test reason");
  });

  it("save 是原子写入（通过 tmp 文件重命名）", async () => {
    const storePath = path.join(tempDir, "jobs.json");
    const store = new JsonCronJobStore(storePath);
    await store.save({ version: 1, jobs: [] });
    // 文件应该存在
    expect(fs.existsSync(storePath)).toBe(true);
    // 不应残留 tmp 文件
    const files = fs.readdirSync(tempDir);
    expect(files.filter((f) => f.endsWith(".tmp."))).toHaveLength(0);
  });
});

describe("quarantineEntries", () => {
  it("空 entries 返回 null", async () => {
    const store = new JsonCronJobStore(path.join(tempDir, "jobs.json"));
    const result = await quarantineEntries(store, []);
    expect(result).toBeNull();
  });

  it("添加新隔离条目", async () => {
    const storePath = path.join(tempDir, "jobs.json");
    const store = new JsonCronJobStore(storePath);
    const result = await quarantineEntries(store, [
      {
        quarantinedAtMs: 1700000000000,
        sourceIndex: 0,
        reason: "invalid config",
      },
    ]);
    expect(result).toBe(store.getQuarantinePath());
    const loaded = await store.loadQuarantine();
    expect(loaded.jobs.length).toBe(1);
    expect(loaded.jobs[0].reason).toBe("invalid config");
  });

  it("重复条目不会重复添加", async () => {
    const storePath = path.join(tempDir, "jobs.json");
    const store = new JsonCronJobStore(storePath);
    const entry = {
      quarantinedAtMs: 1700000000000,
      sourceIndex: 0,
      reason: "duplicate",
    };
    await quarantineEntries(store, [entry]);
    await quarantineEntries(store, [entry]);
    const loaded = await store.loadQuarantine();
    expect(loaded.jobs.length).toBe(1);
  });

  it("按 sourceIndex 排序添加", async () => {
    const storePath = path.join(tempDir, "jobs.json");
    const store = new JsonCronJobStore(storePath);
    await quarantineEntries(store, [
      { quarantinedAtMs: 0, sourceIndex: 2, reason: "b" },
      { quarantinedAtMs: 0, sourceIndex: 0, reason: "a" },
    ]);
    const loaded = await store.loadQuarantine();
    expect(loaded.jobs.length).toBe(2);
    // 按 sourceIndex 排序后追加
    expect(loaded.jobs[0].sourceIndex).toBe(0);
    expect(loaded.jobs[1].sourceIndex).toBe(2);
  });
});

describe("默认存储实例", () => {
  it("getDefaultCronStore 返回单例", () => {
    const s1 = getDefaultCronStore();
    const s2 = getDefaultCronStore();
    expect(s1).toBe(s2);
  });

  it("setDefaultCronStore 替换默认实例", () => {
    const custom = new JsonCronJobStore(path.join(tempDir, "custom.json"));
    setDefaultCronStore(custom);
    expect(getDefaultCronStore()).toBe(custom);
  });
});
