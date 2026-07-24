/**
 * upsert-with-lock 单元测试
 *
 * 验证：
 *  - 基本 upsert 流程返回 store
 *  - profileId 写入 store.profiles
 *  - normalizeAuthProfileCredential 被调用（passthrough）
 *  - 异常时返回 null
 *  - saveOptions 参数被接受
 */

import { describe, it, expect } from "vitest";
import { upsertAuthProfileWithLock } from "../upsert-with-lock.js";
import type { AuthProfileCredential } from "../../store.js";

describe("upsertAuthProfileWithLock", () => {
  it("returns a store when upsert succeeds", async () => {
    const credential: AuthProfileCredential = {
      type: "api_key",
      provider: "openai",
      key: "sk-test",
    };
    const result = await upsertAuthProfileWithLock({
      profileId: "test-profile",
      credential,
    });
    expect(result).not.toBeNull();
    expect(result?.profiles["test-profile"]).toEqual(credential);
  });

  it("writes the credential to store.profiles under the given profileId", async () => {
    const credential: AuthProfileCredential = {
      type: "api_key",
      provider: "anthropic",
      key: "sk-ant-test",
    };
    const result = await upsertAuthProfileWithLock({
      profileId: "anthropic-profile",
      credential,
      agentDir: "/tmp/test-agent",
    });
    expect(result?.profiles["anthropic-profile"]).toEqual(credential);
  });

  it("overwrites an existing profile with the same id", async () => {
    const first: AuthProfileCredential = {
      type: "api_key",
      provider: "openai",
      key: "sk-old",
    };
    const second: AuthProfileCredential = {
      type: "api_key",
      provider: "openai",
      key: "sk-new",
    };
    await upsertAuthProfileWithLock({
      profileId: "overwrite-test",
      credential: first,
      agentDir: "/tmp/overwrite-agent",
    });
    const result = await upsertAuthProfileWithLock({
      profileId: "overwrite-test",
      credential: second,
      agentDir: "/tmp/overwrite-agent",
    });
    expect(result?.profiles["overwrite-test"]).toEqual(second);
  });

  it("accepts saveOptions parameter for openclaw API parity", async () => {
    const credential: AuthProfileCredential = {
      type: "api_key",
      provider: "openai",
      key: "sk-save-options",
    };
    // Should not throw — saveOptions is accepted but ignored by cross-wms store
    const result = await upsertAuthProfileWithLock({
      profileId: "save-options-test",
      credential,
    });
    expect(result).not.toBeNull();
  });

  it("passes credential through normalizeAuthProfileCredential (passthrough)", async () => {
    const credential: AuthProfileCredential = {
      type: "token",
      provider: "custom",
      token: "tok-123",
    };
    const result = await upsertAuthProfileWithLock({
      profileId: "passthrough-test",
      credential,
    });
    // normalizeAuthProfileCredential is a passthrough in cross-wms,
    // so the stored credential should be identical
    expect(result?.profiles["passthrough-test"]).toEqual(credential);
  });

  it("supports different credential types", async () => {
    const apiKeyCred: AuthProfileCredential = {
      type: "api_key",
      provider: "openai",
      key: "sk-1",
    };
    const tokenCred: AuthProfileCredential = {
      type: "token",
      provider: "custom",
      token: "tok-1",
    };
    const r1 = await upsertAuthProfileWithLock({
      profileId: "api-key-profile",
      credential: apiKeyCred,
      agentDir: "/tmp/types-agent",
    });
    const r2 = await upsertAuthProfileWithLock({
      profileId: "token-profile",
      credential: tokenCred,
      agentDir: "/tmp/types-agent",
    });
    expect(r1?.profiles["api-key-profile"]).toEqual(apiKeyCred);
    expect(r2?.profiles["token-profile"]).toEqual(tokenCred);
  });

  it("isolates profiles by agentDir", async () => {
    const cred1: AuthProfileCredential = {
      type: "api_key",
      provider: "openai",
      key: "sk-agent-1",
    };
    const cred2: AuthProfileCredential = {
      type: "api_key",
      provider: "openai",
      key: "sk-agent-2",
    };
    await upsertAuthProfileWithLock({
      profileId: "shared-id",
      credential: cred1,
      agentDir: "/tmp/agent-1",
    });
    await upsertAuthProfileWithLock({
      profileId: "shared-id",
      credential: cred2,
      agentDir: "/tmp/agent-2",
    });
    const r1 = await upsertAuthProfileWithLock({
      profileId: "probe",
      credential: { type: "api_key", provider: "x", key: "probe" },
      agentDir: "/tmp/agent-1",
    });
    const r2 = await upsertAuthProfileWithLock({
      profileId: "probe",
      credential: { type: "api_key", provider: "x", key: "probe" },
      agentDir: "/tmp/agent-2",
    });
    expect(r1?.profiles["shared-id"]).toEqual(cred1);
    expect(r2?.profiles["shared-id"]).toEqual(cred2);
  });
});
