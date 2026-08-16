// channelSeam unit tests (P1b): provider registry, dispatch through the seam,
// and the wecom/wechat provider branches (webhook / app-message / demo / missing-openid).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  channelProviderRegistry,
  dispatchChannelProbe,
  dispatchChannelSend,
  feishuChannelProvider,
  wechatChannelProvider,
  wecomChannelProvider,
  type ChannelProvider,
  type ChannelSendInput,
} from '../channelSeam.js';

vi.mock('../../../extensions/wecom/index.js', () => ({
  sendWeComMessage: vi.fn(),
  sendWeComWebhook: vi.fn(),
  probeWeCom: vi.fn(),
}));
vi.mock('../../../extensions/wechat/index.js', () => ({
  sendWeChatCustomerMessage: vi.fn(),
  probeWeChat: vi.fn(),
}));
vi.mock('../../../extensions/feishu/index.js', () => ({
  sendMessageFeishu: vi.fn(),
}));

import { sendWeComMessage, sendWeComWebhook, probeWeCom } from '../../../extensions/wecom/index.js';
import { sendWeChatCustomerMessage, probeWeChat } from '../../../extensions/wechat/index.js';
import { sendMessageFeishu } from '../../../extensions/feishu/index.js';

const baseInput: ChannelSendInput = { tenantId: 't1', channel: 'x', config: {}, content: 'hello' };

describe('channelSeam — registry & dispatch', () => {
  beforeEach(() => {
    channelProviderRegistry.clear();
    vi.clearAllMocks();
  });

  it('register / get / list / unregister / clear', () => {
    const fake: ChannelProvider = {
      channel: 'fake',
      send: async () => ({ success: true }),
    };
    const unregister = channelProviderRegistry.register(fake);
    expect(channelProviderRegistry.get('fake')).toBe(fake);
    expect(channelProviderRegistry.list()).toEqual(['fake']);
    unregister();
    expect(channelProviderRegistry.get('fake')).toBeUndefined();
    channelProviderRegistry.register(fake);
    channelProviderRegistry.clear();
    expect(channelProviderRegistry.list()).toEqual([]);
  });

  it('dispatch uses the registry and returns null for unregistered channels', async () => {
    const fake: ChannelProvider = {
      channel: 'fake',
      send: async (input) => ({ success: true, messageId: `mid-${input.channel}` }),
    };
    channelProviderRegistry.register(fake);
    const result = await dispatchChannelSend({ ...baseInput, channel: 'fake' });
    expect(result).toEqual({ success: true, messageId: 'mid-fake' });
    expect(await dispatchChannelSend({ ...baseInput, channel: 'nope' })).toBeNull();
  });

  it('registerBuiltin providers are present after module load (wecom/wechat/feishu)', async () => {
    // 模块加载时已注册内置 provider；清空后重新注册验证幂等
    channelProviderRegistry.clear();
    const { registerBuiltinChannelProviders } = await import('../channelSeam.js');
    registerBuiltinChannelProviders();
    expect(channelProviderRegistry.list().sort()).toEqual(['feishu', 'wechat', 'wecom']);
  });
});

describe('channelSeam — wecomChannelProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('webhook branch: uses sendWeComWebhook and maps result', async () => {
    vi.mocked(sendWeComWebhook).mockResolvedValue({ success: true, messageId: 'w1', error: null });
    const r = await wecomChannelProvider.send({
      ...baseInput,
      channel: 'wecom',
      config: { webhook_url: 'https://qyapi.weixin.qq.com/hook' },
      content: 'hi',
    });
    expect(sendWeComWebhook).toHaveBeenCalledWith('https://qyapi.weixin.qq.com/hook', {
      msgtype: 'text',
      content: 'hi',
    });
    expect(r).toEqual({ success: true, messageId: 'w1', error: null });
  });

  it('app-message branch: uses sendWeComMessage with account + markdown', async () => {
    vi.mocked(sendWeComMessage).mockResolvedValue({ success: false, error: 'token 失效' });
    const r = await wecomChannelProvider.send({
      ...baseInput,
      channel: 'wecom',
      config: { corp_id: 'cid', corp_secret: 'sec', agent_id: '1000002' },
      toUser: 'user1',
      content: 'markdown 内容',
    });
    expect(sendWeComMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        account: { corpId: 'cid', corpSecret: 'sec', agentId: '1000002', token: undefined, encodingAesKey: undefined },
        toUser: 'user1',
        msgtype: 'markdown',
        markdown: 'markdown 内容',
      }),
    );
    expect(r).toEqual({ success: false, error: 'token 失效' });
  });

  it('no-credential branch: demo success without calling senders', async () => {
    const r = await wecomChannelProvider.send({ ...baseInput, channel: 'wecom', config: {}, content: 'x' });
    expect(r).toEqual({ success: true, messageId: null, error: null });
    expect(sendWeComWebhook).not.toHaveBeenCalled();
    expect(sendWeComMessage).not.toHaveBeenCalled();
  });
});

describe('channelSeam — wechatChannelProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('credential branch: uses sendWeChatCustomerMessage', async () => {
    vi.mocked(sendWeChatCustomerMessage).mockResolvedValue({ success: true, messageId: 'm1', error: null });
    const r = await wechatChannelProvider.send({
      ...baseInput,
      channel: 'wechat',
      config: { app_id: 'wx', app_secret: 's', openid: 'o1' },
      content: 'hi',
    });
    expect(sendWeChatCustomerMessage).toHaveBeenCalledWith({
      account: { appId: 'wx', appSecret: 's' },
      toUser: 'o1',
      msgtype: 'text',
      content: 'hi',
    });
    expect(r).toEqual({ success: true, messageId: 'm1', error: null });
  });

  it('missing openid: fails loud even with credentials', async () => {
    const r = await wechatChannelProvider.send({
      ...baseInput,
      channel: 'wechat',
      config: { app_id: 'wx', app_secret: 's' },
      content: 'hi',
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('openid');
    expect(sendWeChatCustomerMessage).not.toHaveBeenCalled();
  });

  it('no-credential branch: demo success when openid present', async () => {
    const r = await wechatChannelProvider.send({
      ...baseInput,
      channel: 'wechat',
      config: { openid: 'o1' },
      content: 'hi',
    });
    expect(r).toEqual({ success: true, messageId: null, error: null });
    expect(sendWeChatCustomerMessage).not.toHaveBeenCalled();
  });
});

describe('channelSeam — feishuChannelProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('no-credential / no-recipient branch: demo success without calling sender', async () => {
    const r = await feishuChannelProvider.send({ ...baseInput, channel: 'feishu', config: {}, content: 'hi' });
    expect(r).toEqual({ success: true, messageId: null, error: null });
    expect(sendMessageFeishu).not.toHaveBeenCalled();
  });

  it('credential branch: calls sendMessageFeishu and maps messageId', async () => {
    vi.mocked(sendMessageFeishu).mockResolvedValue({
      messageId: 'om_1',
      chatId: 'oc_1',
      receipt: { kind: 'post', messageId: 'om_1' },
    });
    const r = await feishuChannelProvider.send({
      ...baseInput,
      channel: 'feishu',
      config: { app_id: 'cli_x', app_secret: 's' },
      toUser: 'ou_user',
      content: 'hi',
    });
    expect(sendMessageFeishu).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ou_user', text: 'hi', cfg: expect.objectContaining({ app_id: 'cli_x' }) }),
    );
    expect(r).toEqual({ success: true, messageId: 'om_1', error: null });
  });

  it('maps sendMessageFeishu throw to failed result', async () => {
    vi.mocked(sendMessageFeishu).mockRejectedValue(new Error('token 失效'));
    const r = await feishuChannelProvider.send({
      ...baseInput,
      channel: 'feishu',
      config: { app_id: 'cli_x', app_secret: 's' },
      toUser: 'ou_user',
      content: 'hi',
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('token 失效');
  });
});

describe('channelSeam — probe seam', () => {
  beforeEach(() => {
    channelProviderRegistry.clear();
    vi.clearAllMocks();
  });

  it('dispatchChannelProbe returns null for unregistered or probe-less providers', () => {
    const fake: ChannelProvider = { channel: 'fake', send: async () => ({ success: true }) };
    channelProviderRegistry.register(fake);
    expect(dispatchChannelProbe('fake', {})).toBeNull();
    expect(dispatchChannelProbe('nope', {})).toBeNull();
  });

  it('wecom/wechat probes wrap the extension probe functions', async () => {
    vi.mocked(probeWeCom).mockResolvedValue({ ok: true });
    vi.mocked(probeWeChat).mockResolvedValue({ ok: false, error: 'bad secret' });
    channelProviderRegistry.clear();
    const { registerBuiltinChannelProviders } = await import('../channelSeam.js');
    registerBuiltinChannelProviders();

    const wecom = await dispatchChannelProbe('wecom', { corp_id: 'cid', corp_secret: 'sec', agent_id: '1' });
    expect(wecom).toEqual({ ok: true });
    expect(probeWeCom).toHaveBeenCalledWith(expect.objectContaining({ corpId: 'cid', corpSecret: 'sec' }));

    const wechat = await dispatchChannelProbe('wechat', { app_id: 'wx', app_secret: 'bad' });
    expect(wechat).toEqual({ ok: false, error: 'bad secret' });
    expect(probeWeChat).toHaveBeenCalledWith({ appId: 'wx', appSecret: 'bad' });
  });
});
