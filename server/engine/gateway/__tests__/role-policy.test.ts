// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  parseGatewayRole,
  roleCanSkipDeviceIdentity,
  isRoleAuthorizedForMethod,
} from '../role-policy.js';

describe('role-policy', () => {
  describe('parseGatewayRole', () => {
    it('"operator" 应解析为 operator 角色', () => {
      expect(parseGatewayRole('operator')).toBe('operator');
    });

    it('"node" 应解析为 node 角色', () => {
      expect(parseGatewayRole('node')).toBe('node');
    });

    it('非法字符串应返回 null', () => {
      expect(parseGatewayRole('admin')).toBeNull();
      expect(parseGatewayRole('user')).toBeNull();
    });

    it('非字符串应返回 null', () => {
      expect(parseGatewayRole(undefined)).toBeNull();
      expect(parseGatewayRole(123)).toBeNull();
      expect(parseGatewayRole(null)).toBeNull();
    });

    it('空字符串应返回 null', () => {
      expect(parseGatewayRole('')).toBeNull();
    });
  });

  describe('roleCanSkipDeviceIdentity', () => {
    it('operator + sharedAuthOk=true 应返回 true', () => {
      expect(roleCanSkipDeviceIdentity('operator', true)).toBe(true);
    });

    it('operator + sharedAuthOk=false 应返回 false', () => {
      expect(roleCanSkipDeviceIdentity('operator', false)).toBe(false);
    });

    it('node + sharedAuthOk=true 应返回 false', () => {
      expect(roleCanSkipDeviceIdentity('node', true)).toBe(false);
    });

    it('node + sharedAuthOk=false 应返回 false', () => {
      expect(roleCanSkipDeviceIdentity('node', false)).toBe(false);
    });
  });

  describe('isRoleAuthorizedForMethod', () => {
    it('node 角色应授权 node-role 方法', () => {
      // node.event 是 node-role 方法
      expect(isRoleAuthorizedForMethod('node', 'node.event')).toBe(true);
    });

    it('operator 角色不应授权 node-role 方法', () => {
      expect(isRoleAuthorizedForMethod('operator', 'node.event')).toBe(false);
    });

    it('operator 角色应授权 operator 方法', () => {
      // health 是 operator 方法
      expect(isRoleAuthorizedForMethod('operator', 'health')).toBe(true);
    });

    it('node 角色不应授权 operator 方法', () => {
      expect(isRoleAuthorizedForMethod('node', 'health')).toBe(false);
    });

    it('未知方法应归为 operator 方法', () => {
      expect(isRoleAuthorizedForMethod('operator', 'unknown.method')).toBe(true);
      expect(isRoleAuthorizedForMethod('node', 'unknown.method')).toBe(false);
    });
  });
});
