// 咨询转录分类测试，覆盖空文本、不完整转录、trailing-fragment 与非 actionable closing。
import { describe, expect, it } from "vitest";
import { classifySkippableRealtimeVoiceConsultTranscript } from "../consult-transcript.js";

describe("classifySkippableRealtimeVoiceConsultTranscript", () => {
  it("classifies empty text as empty", () => {
    expect(classifySkippableRealtimeVoiceConsultTranscript("")).toBe("empty");
    expect(classifySkippableRealtimeVoiceConsultTranscript("   ")).toBe("empty");
  });

  it("classifies trailing ellipsis as incomplete-transcript", () => {
    expect(classifySkippableRealtimeVoiceConsultTranscript("tell me about...")).toBe(
      "incomplete-transcript",
    );
    expect(classifySkippableRealtimeVoiceConsultTranscript("what is…")).toBe(
      "incomplete-transcript",
    );
  });

  it("classifies trailing connector words as trailing-fragment", () => {
    expect(classifySkippableRealtimeVoiceConsultTranscript("tell me about")).toBe(
      "trailing-fragment",
    );
    expect(classifySkippableRealtimeVoiceConsultTranscript("ship it to")).toBe(
      "trailing-fragment",
    );
    expect(classifySkippableRealtimeVoiceConsultTranscript("check the")).toBe(
      "trailing-fragment",
    );
  });

  it("classifies conversational closings as non-actionable-closing", () => {
    expect(classifySkippableRealtimeVoiceConsultTranscript("see you later")).toBe(
      "non-actionable-closing",
    );
    expect(classifySkippableRealtimeVoiceConsultTranscript("bye-bye")).toBe(
      "non-actionable-closing",
    );
    expect(classifySkippableRealtimeVoiceConsultTranscript("I'll be right back")).toBe(
      "non-actionable-closing",
    );
  });

  it("returns undefined for actionable transcript text", () => {
    expect(classifySkippableRealtimeVoiceConsultTranscript("check inventory levels")).toBeUndefined();
    expect(classifySkippableRealtimeVoiceConsultTranscript("what changed?")).toBeUndefined();
    // Closings framed as questions are not skipped.
    expect(classifySkippableRealtimeVoiceConsultTranscript("see you later?")).toBeUndefined();
  });
});
