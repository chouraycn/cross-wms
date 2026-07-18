// Provider 注册表测试，覆盖注册、注销、别名解析与国内 provider 中文别名。
import { afterEach, describe, expect, it } from "vitest";
import type { RealtimeVoiceProviderPlugin } from "../provider-types.js";
import {
  canonicalizeDomesticProviderAlias,
  canonicalizeRealtimeVoiceProviderId,
  clearRealtimeVoiceProviderRegistry,
  getRealtimeVoiceProvider,
  listRealtimeVoiceProviders,
  registerRealtimeVoiceProvider,
  unregisterRealtimeVoiceProvider,
} from "../provider-registry.js";

function makeProvider(id: string, aliases: string[] = []): RealtimeVoiceProviderPlugin {
  return {
    id,
    label: id,
    aliases,
    autoSelectOrder: 1,
    isConfigured: () => true,
    createBridge: () => {
      throw new Error("unused");
    },
  };
}

describe("realtime voice provider registry", () => {
  afterEach(() => {
    clearRealtimeVoiceProviderRegistry();
  });

  it("registers and lists providers", () => {
    registerRealtimeVoiceProvider(makeProvider("openai"));
    registerRealtimeVoiceProvider(makeProvider("azure"));
    const providers = listRealtimeVoiceProviders();
    expect(providers.map((p) => p.id)).toEqual(["openai", "azure"]);
  });

  it("unregisters a provider by id", () => {
    registerRealtimeVoiceProvider(makeProvider("openai"));
    expect(listRealtimeVoiceProviders().length).toBe(1);
    unregisterRealtimeVoiceProvider("openai");
    expect(listRealtimeVoiceProviders().length).toBe(0);
  });

  it("resolves providers by canonical id and declared aliases", () => {
    registerRealtimeVoiceProvider(makeProvider("openai", ["oai", "gpt-realtime"]));
    expect(getRealtimeVoiceProvider("openai")?.id).toBe("openai");
    expect(getRealtimeVoiceProvider("oai")?.id).toBe("openai");
    expect(getRealtimeVoiceProvider("gpt-realtime")?.id).toBe("openai");
    expect(getRealtimeVoiceProvider("unknown")).toBeUndefined();
  });

  it("canonicalizes domestic provider aliases including Chinese names", () => {
    registerRealtimeVoiceProvider(makeProvider("aliyun"));
    registerRealtimeVoiceProvider(makeProvider("tencent"));
    registerRealtimeVoiceProvider(makeProvider("xfyun"));

    expect(canonicalizeDomesticProviderAlias("aliyun")).toBe("aliyun");
    expect(canonicalizeDomesticProviderAlias("aliyun-voice")).toBe("aliyun");
    expect(canonicalizeDomesticProviderAlias("阿里云")).toBe("aliyun");
    expect(canonicalizeDomesticProviderAlias("tencent-cloud")).toBe("tencent");
    expect(canonicalizeDomesticProviderAlias("腾讯云")).toBe("tencent");
    expect(canonicalizeDomesticProviderAlias("iflytek")).toBe("xfyun");
    expect(canonicalizeDomesticProviderAlias("讯飞")).toBe("xfyun");
    expect(canonicalizeDomesticProviderAlias("讯飞语音")).toBe("xfyun");
  });

  it("canonicalizes provider ids through the registry", () => {
    registerRealtimeVoiceProvider(makeProvider("aliyun", []));
    expect(canonicalizeRealtimeVoiceProviderId("aliyun")).toBe("aliyun");
    expect(canonicalizeRealtimeVoiceProviderId("阿里云")).toBe("aliyun");
    // Unknown ids stay normalized (lowercased).
    expect(canonicalizeRealtimeVoiceProviderId("Unknown")).toBe("unknown");
    expect(canonicalizeRealtimeVoiceProviderId(undefined)).toBeUndefined();
  });
});
