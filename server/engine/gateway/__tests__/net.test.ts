// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  normalizeHostHeader,
  isLoopbackAddress,
  isPrivateOrLoopbackAddress,
  resolveClientIp,
  resolveRequestClientIp,
  resolveGatewayBindHost,
  resolveGatewayListenHosts,
  isSecureWebSocketUrl,
  isLocalishHost,
} from '../net.js';

describe('net 工具函数', () => {
  describe('normalizeHostHeader', () => {
    it('应将主机名转为小写并去除端口', () => {
      expect(normalizeHostHeader('Example.COM:8080')).toBe('example.com');
    });

    it('应去除 IPv6 方括号但保留无端口的纯地址', () => {
      expect(normalizeHostHeader('[::1]')).toBe('::1');
    });

    it('应去除纯 IPv6 方括号包裹（无端口）', () => {
      expect(normalizeHostHeader('[::1]')).toBe('::1');
    });

    it('应保留包含端口的 IPv6 地址（多冒号）不截断端口', () => {
      // 含多个冒号视为完整 IPv6，不当作端口截断
      expect(normalizeHostHeader('::1')).toBe('::1');
    });

    it('IPv6 + 端口形式 [::1]:3000 因含 :: 不做端口截断', () => {
      // 实现中仅当整个字符串为 [...] 时才去方括号；含 :: 时不截断端口
      // 因此 [::1]:3000 保持原样（这是实现的既有行为）
      expect(normalizeHostHeader('[::1]:3000')).toBe('[::1]:3000');
    });

    it('应去除尾部点号', () => {
      expect(normalizeHostHeader('example.com.')).toBe('example.com');
    });

    it('应处理空字符串', () => {
      expect(normalizeHostHeader('')).toBe('');
    });

    it('应处理带空白的主机头', () => {
      expect(normalizeHostHeader('  Example.COM  ')).toBe('example.com');
    });
  });

  describe('isLoopbackAddress', () => {
    it('应识别 127.0.0.1', () => {
      expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    });

    it('应识别 ::1', () => {
      expect(isLoopbackAddress('::1')).toBe(true);
    });

    it('应识别 127.x.x.x 段', () => {
      expect(isLoopbackAddress('127.0.0.5')).toBe(true);
      expect(isLoopbackAddress('127.255.255.255')).toBe(true);
    });

    it('应识别大小写混合与空白', () => {
      expect(isLoopbackAddress('  127.0.0.1  ')).toBe(true);
    });

    it('应拒绝非 loopback 地址', () => {
      expect(isLoopbackAddress('10.0.0.1')).toBe(false);
      expect(isLoopbackAddress('8.8.8.8')).toBe(false);
    });
  });

  describe('isPrivateOrLoopbackAddress', () => {
    it('应识别 loopback 地址', () => {
      expect(isPrivateOrLoopbackAddress('127.0.0.1')).toBe(true);
    });

    it('应识别 10.x 私有段', () => {
      expect(isPrivateOrLoopbackAddress('10.0.0.1')).toBe(true);
    });

    it('应识别 172.16-31.x 私有段', () => {
      expect(isPrivateOrLoopbackAddress('172.16.0.1')).toBe(true);
      expect(isPrivateOrLoopbackAddress('172.31.255.255')).toBe(true);
      expect(isPrivateOrLoopbackAddress('172.15.0.1')).toBe(false);
      expect(isPrivateOrLoopbackAddress('172.32.0.1')).toBe(false);
    });

    it('应识别 192.168.x 私有段', () => {
      expect(isPrivateOrLoopbackAddress('192.168.1.1')).toBe(true);
    });

    it('应识别 169.254.x 链路本地段', () => {
      expect(isPrivateOrLoopbackAddress('169.254.1.1')).toBe(true);
    });

    it('应识别 IPv6 私有/loopback 段', () => {
      expect(isPrivateOrLoopbackAddress('::1')).toBe(true);
      expect(isPrivateOrLoopbackAddress('fc00::1')).toBe(true);
      expect(isPrivateOrLoopbackAddress('fd00::1')).toBe(true);
      expect(isPrivateOrLoopbackAddress('fe80::1')).toBe(true);
    });

    it('应拒绝公网地址', () => {
      expect(isPrivateOrLoopbackAddress('8.8.8.8')).toBe(false);
      expect(isPrivateOrLoopbackAddress('1.1.1.1')).toBe(false);
    });
  });

  describe('resolveClientIp', () => {
    it('无 forwarded-for 时应返回 remoteAddr', () => {
      expect(resolveClientIp({ remoteAddr: '203.0.113.1' })).toBe('203.0.113.1');
    });

    it('无 forwarded-for 但允许 real-ip 时应返回 realIp', () => {
      expect(
        resolveClientIp({
          remoteAddr: '203.0.113.1',
          realIp: '198.51.100.7',
          allowRealIpFallback: true,
        }),
      ).toBe('198.51.100.7');
    });

    it('无 forwarded-for 且未允许 real-ip 时不应返回 realIp', () => {
      expect(
        resolveClientIp({
          remoteAddr: '203.0.113.1',
          realIp: '198.51.100.7',
        }),
      ).toBe('203.0.113.1');
    });

    it('无 trustedProxies 时应返回 forwarded-for 的第一个 hop', () => {
      expect(
        resolveClientIp({
          forwardedFor: '203.0.113.5, 10.0.0.1',
        }),
      ).toBe('203.0.113.5');
    });

    it('trustedProxies 配置时应回退到第一个非可信 hop', () => {
      expect(
        resolveClientIp({
          forwardedFor: '203.0.113.5, 10.0.0.1, 127.0.0.1',
          trustedProxies: ['127.0.0.1', '10.0.0.1'],
        }),
      ).toBe('203.0.113.5');
    });

    it('所有 hop 均可信时应返回第一个 hop', () => {
      expect(
        resolveClientIp({
          forwardedFor: '10.0.0.1, 10.0.0.2',
          trustedProxies: ['10.0.0.1', '10.0.0.2'],
        }),
      ).toBe('10.0.0.1');
    });

    it('forwarded-for 为空白字符串时应返回 remoteAddr', () => {
      expect(
        resolveClientIp({
          remoteAddr: '203.0.113.1',
          forwardedFor: '   ',
        }),
      ).toBe('203.0.113.1');
    });
  });

  describe('resolveRequestClientIp', () => {
    it('应从 headers 中解析 x-forwarded-for', () => {
      const req = {
        headers: { 'x-forwarded-for': '203.0.113.7' },
        socket: { remoteAddress: '127.0.0.1' },
      };
      expect(resolveRequestClientIp(req)).toBe('203.0.113.7');
    });

    it('headers 中有数组形式 x-forwarded-for 时应忽略并返回 remoteAddr', () => {
      const req = {
        headers: { 'x-forwarded-for': ['203.0.113.7', '10.0.0.1'] },
        socket: { remoteAddress: '127.0.0.1' },
      };
      expect(resolveRequestClientIp(req)).toBe('127.0.0.1');
    });

    it('无 forwarded-for 但有 x-real-ip 且允许 fallback 时应返回 real-ip', () => {
      const req = {
        headers: { 'x-real-ip': '198.51.100.9' },
        socket: { remoteAddress: '127.0.0.1' },
      };
      expect(resolveRequestClientIp(req, undefined, true)).toBe('198.51.100.9');
    });

    it('无任何代理头时应返回 socket.remoteAddress', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '192.0.2.3' },
      };
      expect(resolveRequestClientIp(req)).toBe('192.0.2.3');
    });
  });

  describe('resolveGatewayBindHost', () => {
    it('loopback 应返回 127.0.0.1', () => {
      expect(resolveGatewayBindHost('loopback')).toBe('127.0.0.1');
    });

    it('lan 应返回 0.0.0.0', () => {
      expect(resolveGatewayBindHost('lan')).toBe('0.0.0.0');
    });

    it('tailnet 应返回 0.0.0.0', () => {
      expect(resolveGatewayBindHost('tailnet')).toBe('0.0.0.0');
    });

    it('auto 应返回 127.0.0.1', () => {
      expect(resolveGatewayBindHost('auto')).toBe('127.0.0.1');
    });

    it('custom 无 host 应回退到 127.0.0.1', () => {
      expect(resolveGatewayBindHost('custom')).toBe('127.0.0.1');
    });

    it('custom 有 host 应返回该 host', () => {
      expect(resolveGatewayBindHost('custom', '192.168.1.10')).toBe('192.168.1.10');
    });
  });

  describe('resolveGatewayListenHosts', () => {
    it('127.0.0.1 应仅返回 loopback 单元素数组', () => {
      expect(resolveGatewayListenHosts('127.0.0.1')).toEqual(['127.0.0.1']);
    });

    it('其他 host 应返回单元素数组', () => {
      expect(resolveGatewayListenHosts('0.0.0.0')).toEqual(['0.0.0.0']);
    });
  });

  describe('isSecureWebSocketUrl', () => {
    it('wss:// 应返回 true', () => {
      expect(isSecureWebSocketUrl('wss://example.com')).toBe(true);
    });

    it('ws:// 公网 host 应返回 false', () => {
      expect(isSecureWebSocketUrl('ws://example.com')).toBe(false);
    });

    it('ws:// loopback 应返回 true', () => {
      expect(isSecureWebSocketUrl('ws://127.0.0.1:3000')).toBe(true);
    });

    it('ws:// 私有段在 allowPrivateWs=true 时应返回 true', () => {
      expect(isSecureWebSocketUrl('ws://192.168.1.1', { allowPrivateWs: true })).toBe(true);
    });

    it('ws:// 私有段在未启用 allowPrivateWs 时应返回 false', () => {
      expect(isSecureWebSocketUrl('ws://192.168.1.1')).toBe(false);
    });

    it('ws:// ts.net 后缀应返回 true', () => {
      expect(isSecureWebSocketUrl('ws://host.ts.net')).toBe(true);
    });

    it('ws:// .local 后缀应返回 true', () => {
      expect(isSecureWebSocketUrl('ws://host.local')).toBe(true);
    });

    it('非 ws/wss 协议应返回 false', () => {
      expect(isSecureWebSocketUrl('http://example.com')).toBe(false);
    });

    it('无效 URL 应返回 false', () => {
      expect(isSecureWebSocketUrl('ws://[invalid')).toBe(false);
    });
  });

  describe('isLocalishHost', () => {
    it('应识别 loopback', () => {
      expect(isLocalishHost('127.0.0.1')).toBe(true);
    });

    it('应识别 ts.net 后缀', () => {
      expect(isLocalishHost('machine.ts.net')).toBe(true);
    });

    it('应识别 .local 后缀', () => {
      expect(isLocalishHost('raspberry.local')).toBe(true);
    });

    it('应识别私有 IP', () => {
      expect(isLocalishHost('10.0.0.1')).toBe(true);
    });

    it('应拒绝公网 host', () => {
      expect(isLocalishHost('example.com')).toBe(false);
    });
  });
});
