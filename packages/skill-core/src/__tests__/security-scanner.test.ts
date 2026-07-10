/**
 * SecurityScanner 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityScanner, securityScanner } from '../security-scanner.js';

describe('SecurityScanner', () => {
  let scanner: SecurityScanner;

  beforeEach(() => {
    scanner = new SecurityScanner();
  });

  it('should pass on safe content', () => {
    const result = scanner.scan('console.log("hello world");');
    expect(result.safe).toBe(true);
    expect(result.threats).toHaveLength(0);
  });

  it('should detect eval execution', () => {
    const result = scanner.scan('const x = eval(userInput);');
    expect(result.safe).toBe(false);
    expect(result.threats.some((t) => t.category === 'code-execution')).toBe(true);
  });

  it('should detect hardcoded secrets', () => {
    const result = scanner.scan('const api_key = "sk-1234567890123456";');
    expect(result.safe).toBe(false);
    expect(result.threats.some((t) => t.category === 'secrets')).toBe(true);
  });

  it('should respect strict mode', () => {
    const content = 'fetch("https://example.com");';
    const nonStrictResult = scanner.scan(content);
    const strictResult = scanner.scan(content, { strictMode: true });

    expect(nonStrictResult.safe).toBe(true);
    expect(strictResult.safe).toBe(false);
  });

  it('should support custom patterns', () => {
    const customScanner = new SecurityScanner({
      customPatterns: [
        {
          id: 'custom',
          name: 'Custom Pattern',
          severity: 'high',
          category: 'custom',
          description: 'Custom dangerous pattern',
          regex: /dangerousFunction\(\)/g,
        },
      ],
    });

    const result = customScanner.scan('dangerousFunction();');
    // 非严格模式下，high 级别自定义规则仅会被记录为威胁但不使结果变 unsafe
    // （仅 critical 级威胁或在 strictMode 下才会将 safe 置为 false）
    expect(result.safe).toBe(true);
    expect(result.threats.some((t) => t.id.startsWith('custom'))).toBe(true);
  });

  it('should generate human-readable report', () => {
    scanner.scan('eval("bad");');
    const report = scanner.generateReport(scanner.scan('eval("bad");'));

    expect(report).toContain('Security Scan Report');
    expect(report).toContain('UNSAFE');
  });

  it('singleton securityScanner should be available', () => {
    expect(securityScanner).toBeInstanceOf(SecurityScanner);
  });
});
