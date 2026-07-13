// Tests for the skill runtime-requirement detection utility.
import { describe, expect, it } from 'vitest';
import { detectSkillRuntimeRequirements, type SkillRuntimeRequirement } from '../utils/skillDependency';

describe('detectSkillRuntimeRequirements', () => {
  it('returns "available" when no requirements are declared', () => {
    expect(detectSkillRuntimeRequirements(undefined).status).toBe('available');
    expect(detectSkillRuntimeRequirements([]).status).toBe('available');
  });

  it('reports known binaries as available', () => {
    const reqs: SkillRuntimeRequirement[] = [{ name: 'git', type: 'binary' }];
    const report = detectSkillRuntimeRequirements(reqs);
    expect(report.status).toBe('available');
    expect(report.details[0].status).toBe('available');
  });

  it('reports unknown binaries as "unknown" (not "missing")', () => {
    const reqs: SkillRuntimeRequirement[] = [{ name: 'very-obscure-tool', type: 'binary' }];
    const report = detectSkillRuntimeRequirements(reqs);
    expect(report.status).toBe('unknown');
    expect(report.details[0].status).toBe('unknown');
  });

  it('reports missing env vars as "missing"', () => {
    const prevValue = process.env.SKILL_DEP_TEST_MISSING;
    delete process.env.SKILL_DEP_TEST_MISSING;
    const reqs: SkillRuntimeRequirement[] = [
      { name: 'SKILL_DEP_TEST_MISSING', type: 'env' },
    ];
    const report = detectSkillRuntimeRequirements(reqs);
    expect(report.status).toBe('missing');
    expect(report.details[0].status).toBe('missing');
    expect(report.details[0].reason).toContain('not set');
    if (prevValue !== undefined) process.env.SKILL_DEP_TEST_MISSING = prevValue;
  });

  it('reports set env vars as "available"', () => {
    process.env.SKILL_DEP_TEST_PRESENT = 'value';
    const reqs: SkillRuntimeRequirement[] = [
      { name: 'SKILL_DEP_TEST_PRESENT', type: 'env' },
    ];
    const report = detectSkillRuntimeRequirements(reqs);
    expect(report.status).toBe('available');
    delete process.env.SKILL_DEP_TEST_PRESENT;
  });

  it('aggregates mixed status: missing wins over unknown', () => {
    const prev = process.env.SKILL_DEP_MIXED_TEST;
    delete process.env.SKILL_DEP_MIXED_TEST;
    const reqs: SkillRuntimeRequirement[] = [
      { name: 'very-obscure-tool', type: 'binary' },
      { name: 'SKILL_DEP_MIXED_TEST', type: 'env' },
    ];
    const report = detectSkillRuntimeRequirements(reqs);
    expect(report.status).toBe('missing');
    if (prev !== undefined) process.env.SKILL_DEP_MIXED_TEST = prev;
  });
});
