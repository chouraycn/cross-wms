import { describe, it, expect } from "vitest";
import {
  explainShellCommand,
  analyzeWindowsShellCommand,
  tokenizeWindowsSegment,
  rebuildWindowsShellCommandFromSource,
  windowsEscapeArg,
  isWindowsPlatform,
  analyzeArgvCommand,
  isInterpreterLikeAllowlistPattern,
  detectInlineEvalArgv,
  assertNoSymlinkParentsSync,
} from "../_openclaw-infra-deps.js";

describe("explainShellCommand", () => {
  it("应返回空结果用于空命令", async () => {
    const result = await explainShellCommand("");
    expect(result.topLevelCommands).toHaveLength(0);
    expect(result.nestedCommands).toHaveLength(0);
  });

  it("应返回空结果用于空白命令", async () => {
    const result = await explainShellCommand("   ");
    expect(result.topLevelCommands).toHaveLength(0);
    expect(result.nestedCommands).toHaveLength(0);
  });

  it("应解析简单命令", async () => {
    const result = await explainShellCommand("ls -la /home");
    expect(result.topLevelCommands).toHaveLength(1);
    expect(result.topLevelCommands[0].executable).toBe("ls");
    expect(result.topLevelCommands[0].argv).toEqual(["ls", "-la", "/home"]);
    expect(result.nestedCommands).toHaveLength(0);
  });

  it("应解析带引号的参数", async () => {
    const result = await explainShellCommand('echo "hello world"');
    expect(result.topLevelCommands).toHaveLength(1);
    expect(result.topLevelCommands[0].executable).toBe("echo");
    expect(result.topLevelCommands[0].argv).toEqual(["echo", "hello world"]);
  });

  it("应解析单引号参数", async () => {
    const result = await explainShellCommand("echo 'hello world'");
    expect(result.topLevelCommands[0].argv).toEqual(["echo", "hello world"]);
  });

  it("应解析转义字符", async () => {
    const result = await explainShellCommand("echo hello\\ world");
    expect(result.topLevelCommands[0].argv).toEqual(["echo", "hello world"]);
  });

  it("应检测 bash -c 包装器 payload", async () => {
    const result = await explainShellCommand('bash -c "echo hello"');
    expect(result.topLevelCommands).toHaveLength(1);
    expect(result.topLevelCommands[0].executable).toBe("bash");
    expect(result.nestedCommands).toHaveLength(1);
    expect(result.nestedCommands[0].executable).toBe("echo");
    expect(result.nestedCommands[0].context).toBe("wrapper-payload");
  });

  it("应检测 sh -c 包装器 payload", async () => {
    const result = await explainShellCommand("sh -c 'rm -rf /tmp'");
    expect(result.nestedCommands).toHaveLength(1);
    expect(result.nestedCommands[0].executable).toBe("rm");
  });

  it("应检测 python -c 包装器 payload", async () => {
    const result = await explainShellCommand('python -c "print(1)"');
    expect(result.nestedCommands).toHaveLength(1);
    expect(result.nestedCommands[0].executable).toBe("print(1)");
  });

  it("应检测命令替换 $(...)", async () => {
    const result = await explainShellCommand("echo $(whoami)");
    expect(result.nestedCommands).toHaveLength(1);
    expect(result.nestedCommands[0].executable).toBe("whoami");
    expect(result.nestedCommands[0].context).toBe("command-substitution");
  });

  it("应检测多个命令替换", async () => {
    const result = await explainShellCommand("echo $(date) $(pwd)");
    expect(result.nestedCommands).toHaveLength(2);
    expect(result.nestedCommands[0].executable).toBe("date");
    expect(result.nestedCommands[1].executable).toBe("pwd");
  });

  it("应检测反引号命令替换", async () => {
    const result = await explainShellCommand("echo `date`");
    expect(result.nestedCommands).toHaveLength(1);
    expect(result.nestedCommands[0].executable).toBe("date");
  });

  it("应处理无参数的包装器", async () => {
    const result = await explainShellCommand("bash script.sh");
    expect(result.topLevelCommands[0].executable).toBe("bash");
    expect(result.nestedCommands).toHaveLength(0);
  });
});

describe("analyzeWindowsShellCommand", () => {
  it("应返回失败用于空命令", () => {
    const result = analyzeWindowsShellCommand({ command: "" });
    expect(result.ok).toBe(false);
    expect(result.segments).toHaveLength(0);
  });

  it("应解析简单 Windows 命令", () => {
    const result = analyzeWindowsShellCommand({ command: "dir /s /b" });
    expect(result.ok).toBe(true);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].argv).toEqual(["dir", "/s", "/b"]);
  });

  it("应处理带引号的路径", () => {
    const result = analyzeWindowsShellCommand({ command: '"C:\\Program Files\\app.exe" --help' });
    expect(result.ok).toBe(true);
    expect(result.segments[0].argv[0]).toBe("C:\\Program Files\\app.exe");
  });

  it("应处理混合引号参数", () => {
    const result = analyzeWindowsShellCommand({ command: 'echo "hello world" foo' });
    expect(result.ok).toBe(true);
    expect(result.segments[0].argv).toEqual(["echo", "hello world", "foo"]);
  });
});

describe("tokenizeWindowsSegment", () => {
  it("应返回 null 用于空字符串", () => {
    expect(tokenizeWindowsSegment("")).toBeNull();
  });

  it("应分词简单命令", () => {
    const tokens = tokenizeWindowsSegment("cmd /c dir");
    expect(tokens).toEqual(["cmd", "/c", "dir"]);
  });

  it("应处理双引号", () => {
    const tokens = tokenizeWindowsSegment('echo "hello world"');
    expect(tokens).toEqual(["echo", "hello world"]);
  });
});

describe("rebuildWindowsShellCommandFromSource", () => {
  it("应返回失败用于空命令", () => {
    const result = rebuildWindowsShellCommandFromSource({
      command: "",
      renderSegment: (raw) => ({ ok: true, rendered: raw }),
    });
    expect(result.ok).toBe(false);
  });

  it("应重建命令", () => {
    const result = rebuildWindowsShellCommandFromSource({
      command: "echo hello",
      renderSegment: (raw) => ({ ok: true, rendered: `[${raw}]` }),
    });
    expect(result.ok).toBe(true);
    expect(result.command).toBe("[echo hello]");
    expect(result.segmentCount).toBe(1);
  });

  it("应传播渲染错误", () => {
    const result = rebuildWindowsShellCommandFromSource({
      command: "echo hello",
      renderSegment: () => ({ ok: false, reason: "render failed" }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("render failed");
  });
});

describe("windowsEscapeArg", () => {
  it("应拒绝非字符串输入", () => {
    const result = windowsEscapeArg(123 as any);
    expect(result.ok).toBe(false);
  });

  it("应拒绝包含空字节的字符串", () => {
    const result = windowsEscapeArg("hello\0world");
    expect(result.ok).toBe(false);
  });

  it("应将空字符串转义为双引号", () => {
    const result = windowsEscapeArg("");
    expect(result.ok).toBe(true);
    expect(result.escaped).toBe('""');
  });

  it("应保持安全字符不变", () => {
    const result = windowsEscapeArg("hello-world_123.txt");
    expect(result.ok).toBe(true);
    expect(result.escaped).toBe("hello-world_123.txt");
  });

  it("应为包含空格的字符串添加引号", () => {
    const result = windowsEscapeArg("hello world");
    expect(result.ok).toBe(true);
    expect(result.escaped).toBe('"hello world"');
  });

  it("应转义双引号", () => {
    const result = windowsEscapeArg('say "hello"');
    expect(result.ok).toBe(true);
    expect(result.escaped).toBe('"say \\"hello\\""');
  });
});

describe("isWindowsPlatform", () => {
  it("应识别 win32", () => {
    expect(isWindowsPlatform("win32")).toBe(true);
  });

  it("应识别 win64", () => {
    expect(isWindowsPlatform("win64")).toBe(true);
  });

  it("应拒绝 darwin", () => {
    expect(isWindowsPlatform("darwin")).toBe(false);
  });

  it("应拒绝 linux", () => {
    expect(isWindowsPlatform("linux")).toBe(false);
  });

  it("应拒绝 null", () => {
    expect(isWindowsPlatform(null)).toBe(false);
  });
});

describe("analyzeArgvCommand", () => {
  it("应返回失败用于空 argv", () => {
    const result = analyzeArgvCommand([]);
    expect(result.ok).toBe(false);
  });

  it("应分析简单 argv", () => {
    const result = analyzeArgvCommand(["ls", "-la"]);
    expect(result.ok).toBe(true);
    expect(result.segments[0].argv).toEqual(["ls", "-la"]);
    expect(result.segments[0].raw).toBe("ls -la");
  });
});

describe("isInterpreterLikeAllowlistPattern", () => {
  it("应始终返回 false", () => {
    expect(isInterpreterLikeAllowlistPattern("python")).toBe(false);
    expect(isInterpreterLikeAllowlistPattern("bash -c")).toBe(false);
  });
});

describe("detectInlineEvalArgv", () => {
  it("应始终返回 null", () => {
    expect(detectInlineEvalArgv(["bash", "-c", "echo hello"])).toBeNull();
  });
});

describe("assertNoSymlinkParentsSync", () => {
  it("应无错误地执行（降级实现）", () => {
    expect(() =>
      assertNoSymlinkParentsSync({ rootDir: "/tmp", targetPath: "/tmp/test" }),
    ).not.toThrow();
  });
});
