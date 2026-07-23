import { describe, expect, it } from "vitest";
import {
  isRelayableExecCompletionEvent,
  buildCronEventPrompt,
  buildExecEventPrompt,
  isExecCompletionEvent,
  isCronSystemEvent,
} from "../heartbeat-events-filter.js";

describe("isExecCompletionEvent", () => {
  it("应该识别结构化的 exec completed 事件", () => {
    expect(isExecCompletionEvent("exec completed (job-1, code 0)")).toBe(true);
  });

  it("应该识别结构化的 exec failed 事件", () => {
    expect(isExecCompletionEvent("exec failed (job-1, signal SIGTERM)")).toBe(true);
  });

  it("应该识别 'exec finished' 前缀事件", () => {
    expect(isExecCompletionEvent("exec finished: something")).toBe(true);
    expect(isExecCompletionEvent("exec finished (details)")).toBe(true);
  });

  it("应该忽略普通文本", () => {
    expect(isExecCompletionEvent("hello world")).toBe(false);
    expect(isExecCompletionEvent("")).toBe(false);
  });

  it("应该忽略大小写", () => {
    expect(isExecCompletionEvent("EXEC COMPLETED (a, code 0)")).toBe(true);
  });
});

describe("isCronSystemEvent", () => {
  it("空字符串应返回 false", () => {
    expect(isCronSystemEvent("")).toBe(false);
    expect(isCronSystemEvent("   ")).toBe(false);
  });

  it("exec 完成事件应返回 false", () => {
    expect(isCronSystemEvent("exec completed (a, code 0)")).toBe(false);
  });

  it("heartbeat 噪声事件应返回 false", () => {
    expect(isCronSystemEvent("HEARTBEAT_OK")).toBe(false);
    expect(isCronSystemEvent("heartbeat poll triggered")).toBe(false);
    expect(isCronSystemEvent("heartbeat wake requested")).toBe(false);
  });

  it("真实提醒内容应返回 true", () => {
    expect(isCronSystemEvent("Standup meeting in 5 minutes")).toBe(true);
  });
});

describe("isRelayableExecCompletionEvent", () => {
  it("带 output 的成功事件应返回 true", () => {
    expect(isRelayableExecCompletionEvent("exec completed (job-1, code 0) :: build ok")).toBe(true);
  });

  it("不带 output 的成功事件应返回 false（无需转发）", () => {
    expect(isRelayableExecCompletionEvent("exec completed (job-1, code 0)")).toBe(false);
  });

  it("不带 output 的失败事件应返回 true", () => {
    expect(isRelayableExecCompletionEvent("exec failed (job-1, code 1)")).toBe(true);
  });

  it("非结构化的 exec finished 事件应返回 true", () => {
    expect(isRelayableExecCompletionEvent("exec finished: some output")).toBe(true);
  });

  it("普通文本应返回 false", () => {
    expect(isRelayableExecCompletionEvent("hello")).toBe(false);
  });
});

describe("buildCronEventPrompt", () => {
  it("空事件内容 + deliverToUser 默认应提示回复 HEARTBEAT_OK", () => {
    const prompt = buildCronEventPrompt([]);
    expect(prompt).toContain("no event content was found");
    expect(prompt).toContain("HEARTBEAT_OK");
  });

  it("空事件内容 + useHeartbeatResponseTool 应包含工具说明", () => {
    const prompt = buildCronEventPrompt([], { useHeartbeatResponseTool: true });
    expect(prompt).toContain("heartbeat_respond tool");
  });

  it("空事件内容 + deliverToUser=false 应提示内部处理", () => {
    const prompt = buildCronEventPrompt([], { deliverToUser: false });
    expect(prompt).toContain("Handle this internally");
  });

  it("有内容 + deliverToUser 默认应提示转发给用户", () => {
    const prompt = buildCronEventPrompt(["Reminder: lunch at noon"]);
    expect(prompt).toContain("Reminder: lunch at noon");
    expect(prompt).toContain("relay this reminder to the user");
  });

  it("有内容 + deliverToUser=false 应提示内部处理而非转发", () => {
    const prompt = buildCronEventPrompt(["Reminder: lunch"], { deliverToUser: false });
    expect(prompt).toContain("Handle this reminder internally");
    expect(prompt).toContain("Do not relay it to the user");
  });
});

describe("buildExecEventPrompt", () => {
  it("空事件 + 默认应提示回复 HEARTBEAT_OK 且不重用旧输出", () => {
    const prompt = buildExecEventPrompt([]);
    expect(prompt).toContain("no command output was found");
    expect(prompt).toContain("HEARTBEAT_OK");
    expect(prompt).toContain("Do not mention, summarize, or reuse output");
  });

  it("空事件 + useHeartbeatResponseTool 应包含工具说明", () => {
    const prompt = buildExecEventPrompt([], { useHeartbeatResponseTool: true });
    expect(prompt).toContain("heartbeat_respond tool");
  });

  it("有输出 + deliverToUser 默认应提示转发命令输出", () => {
    const prompt = buildExecEventPrompt(["exec completed (job-1, code 0) :: all good"]);
    expect(prompt).toContain("all good");
    expect(prompt).toContain("relay the command output to the user");
  });

  it("有输出 + deliverToUser=false 应提示内部处理", () => {
    const prompt = buildExecEventPrompt(
      ["exec completed (job-1, code 0) :: all good"],
      { deliverToUser: false },
    );
    expect(prompt).toContain("user delivery is disabled");
  });

  it("失败且无 output 应提示缺少捕获输出", () => {
    const prompt = buildExecEventPrompt(["exec failed (job-1, code 1)"]);
    expect(prompt).toContain("without captured stdout/stderr");
  });

  it("超长输出应被截断", () => {
    const longOutput = "x".repeat(10_000);
    const evt = `exec completed (job-1, code 0) :: ${longOutput}`;
    const prompt = buildExecEventPrompt([evt]);
    expect(prompt).toContain("[truncated]");
    expect(prompt.length).toBeLessThan(longOutput.length);
  });
});
