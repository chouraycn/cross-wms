import { describe, it, expect, vi } from 'vitest';
import { sendMessage } from '../_stub_parent__infra__outbound__message.js';

describe('plugins/_stub_parent__infra__outbound__message', () => {
  describe('sendMessage (no-op stub)', () => {
    it('返回 ok=false', async () => {
      const result = await sendMessage({
        to: 'user-1',
        content: 'hello',
        channel: 'slack',
      });
      expect(result.ok).toBe(false);
    });

    it('返回包含未实现错误信息', async () => {
      const result = await sendMessage({
        to: 'user-1',
        content: 'hello',
        channel: 'slack',
      });
      expect(result.error).toContain('not implemented');
      expect(result.error).toContain('sendMessage');
    });

    it('返回 Promise 对象', () => {
      const promise = sendMessage({
        to: 'u',
        content: 'c',
        channel: 'ch',
      });
      expect(promise).toBeInstanceOf(Promise);
      return promise.then(() => undefined);
    });

    it('忽略 params 中的所有字段（返回固定结果）', async () => {
      const r1 = await sendMessage({ to: 'a', content: 'x', channel: 'slack' });
      const r2 = await sendMessage({
        to: 'b',
        content: 'y',
        channel: 'email',
        accountId: 'acc-1',
        threadId: 42,
        replyTo: { id: 'msg-1' },
      });
      expect(r1).toEqual(r2);
    });

    it('不抛出异常（始终 resolve）', async () => {
      await expect(
        sendMessage({ to: '', content: '', channel: '' }),
      ).resolves.not.toThrow();
    });

    it('params 中的额外字段不影响结果', async () => {
      const result = await sendMessage({
        to: 'u',
        content: 'c',
        channel: 'ch',
        custom: 'field',
        nested: { a: 1 },
      } as never);
      expect(result.ok).toBe(false);
    });

    it('不调用任何外部依赖（纯空操作）', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await sendMessage({ to: 'u', content: 'c', channel: 'ch' });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('返回结果不包含 messageId/channel/result 字段', async () => {
      const result = await sendMessage({
        to: 'u',
        content: 'c',
        channel: 'slack',
      });
      expect(result.messageId).toBeUndefined();
      expect(result.channel).toBeUndefined();
      expect(result.result).toBeUndefined();
    });

    it('多次调用返回等价结果', async () => {
      const a = await sendMessage({ to: 'u', content: 'c', channel: 'ch' });
      const b = await sendMessage({ to: 'u', content: 'c', channel: 'ch' });
      expect(a).toEqual(b);
    });
  });
});
