/**
 * TUI CLI 注册单元测试
 *
 * 验证 tui 命令的 commander 注册以及选项是否被正确解析。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

vi.mock("../../../tui/cli.js", () => ({
  runTuiCli: vi.fn(),
}));

import { runTuiCli } from "../../../tui/cli.js";
import { registerTuiCli } from "../tui-cli.js";

const runTuiCliMock = runTuiCli as unknown as ReturnType<typeof vi.fn>;

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerTuiCli(program);
  return program;
}

describe("registerTuiCli", () => {
  beforeEach(() => {
    runTuiCliMock.mockReset();
    runTuiCliMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers the tui command with the expected aliases", () => {
    const program = buildProgram();
    const tui = program.commands.find((c) => c.name() === "tui");
    expect(tui).toBeDefined();
    expect(tui?.aliases()).toEqual(expect.arrayContaining(["terminal", "chat"]));
  });

  it("parses --http --url --theme options and forwards them to runTuiCli", async () => {
    const program = buildProgram();
    await program.parseAsync([
      "node",
      "cdf",
      "tui",
      "--http",
      "--url",
      "http://localhost:7777",
      "--theme",
      "dark",
    ]);
    expect(runTuiCliMock).toHaveBeenCalledTimes(1);
    expect(runTuiCliMock).toHaveBeenCalledWith([
      "--http",
      "--url",
      "http://localhost:7777",
      "--theme",
      "dark",
    ]);
  });

  it("passes --config when provided", async () => {
    const program = buildProgram();
    await program.parseAsync([
      "node",
      "cdf",
      "tui",
      "--config",
      "/tmp/tui.json",
    ]);
    expect(runTuiCliMock).toHaveBeenCalledWith(["--config", "/tmp/tui.json"]);
  });

  it("passes --list-backends and --verbose flags", async () => {
    const program = buildProgram();
    await program.parseAsync(["node", "cdf", "tui", "--list-backends", "--verbose"]);
    expect(runTuiCliMock).toHaveBeenCalledWith(["--list-backends", "--verbose"]);
  });

  it("sets CDF_TUI_TOKEN env var when --token is provided", async () => {
    const previous = process.env.CDF_TUI_TOKEN;
    try {
      const program = buildProgram();
      await program.parseAsync(["node", "cdf", "tui", "--token", "secret-token"]);
      expect(process.env.CDF_TUI_TOKEN).toBe("secret-token");
    } finally {
      if (previous === undefined) {
        delete process.env.CDF_TUI_TOKEN;
      } else {
        process.env.CDF_TUI_TOKEN = previous;
      }
    }
  });

  it("prints an error and exits when runTuiCli throws", async () => {
    runTuiCliMock.mockRejectedValueOnce(new Error("boom"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as never);

    const program = buildProgram();
    await expect(
      program.parseAsync(["node", "cdf", "tui"]),
    ).rejects.toThrow("exit:1");
    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
