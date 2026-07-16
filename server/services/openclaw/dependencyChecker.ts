import { promisify } from 'util';
import { execFile } from 'child_process';
import { SkillRequires, SkillInstallStep } from './skillMetadata';

const execFileAsync = promisify(execFile);

export interface DependencyCheckResult {
  skillId: string;
  skillName: string;
  allSatisfied: boolean;
  bins: { name: string; found: boolean; path?: string }[];
  anyBins: { name: string; found: boolean; path?: string }[];
  env: { name: string; found: boolean; value?: string }[];
  installSteps: SkillInstallStep[];
  missingBins: string[];
  missingEnv: string[];
}

export interface BinSearchResult {
  found: boolean;
  path?: string;
}

async function searchBinary(name: string): Promise<BinSearchResult> {
  try {
    const result = await execFileAsync('which', [name]);
    return { found: true, path: result.stdout.trim() };
  } catch {
    return { found: false };
  }
}

async function checkEnvVar(name: string): Promise<{ found: boolean; value?: string }> {
  const value = process.env[name];
  return { found: !!value, value };
}

export async function checkSkillDependencies(skillId: string, skillName: string, requires: SkillRequires | undefined, installSteps: SkillInstallStep[]): Promise<DependencyCheckResult> {
  const bins = requires?.bins || [];
  const anyBins = requires?.anyBins || [];
  const env = requires?.env || [];

  const binResults = await Promise.all(
    bins.map(async (name) => ({ name, ...await searchBinary(name) }))
  );

  const anyBinResults = await Promise.all(
    anyBins.map(async (name) => ({ name, ...await searchBinary(name) }))
  );

  const envResults = await Promise.all(
    env.map(async (name) => ({ name, ...await checkEnvVar(name) }))
  );

  const missingBins = binResults.filter(r => !r.found).map(r => r.name);
  const missingEnv = envResults.filter(r => !r.found).map(r => r.name);

  const anyBinsSatisfied = anyBins.length === 0 || anyBinResults.some(r => r.found);

  const allSatisfied = missingBins.length === 0 && missingEnv.length === 0 && anyBinsSatisfied;

  return {
    skillId,
    skillName,
    allSatisfied,
    bins: binResults,
    anyBins: anyBinResults,
    env: envResults,
    installSteps,
    missingBins,
    missingEnv,
  };
}

export async function checkAllSkillsDependencies(skills: Array<{ id: string; name: string; requires?: SkillRequires; installSteps?: SkillInstallStep[] }>): Promise<DependencyCheckResult[]> {
  return Promise.all(
    skills.map(skill =>
      checkSkillDependencies(
        skill.id,
        skill.name,
        skill.requires,
        skill.installSteps || []
      )
    )
  );
}

export function generateInstallCommands(installSteps: SkillInstallStep[]): string[] {
  const commands: string[] = [];
  for (const step of installSteps) {
    switch (step.type) {
      case 'brew':
        commands.push(`brew install ${step.name}${step.version ? `@${step.version}` : ''}`);
        break;
      case 'node':
        commands.push(`npm install -g ${step.name}${step.version ? `@${step.version}` : ''}`);
        break;
      case 'pip':
        commands.push(`pip install ${step.name}${step.version ? `==${step.version}` : ''}`);
        break;
      case 'go':
        commands.push(`go install ${step.name}${step.version ? `@${step.version}` : ''}`);
        break;
      case 'cargo':
        commands.push(`cargo install ${step.name}`);
        break;
      case 'bash':
        commands.push(step.args?.join(' ') || '');
        break;
      case 'download':
        commands.push(`# Download: ${step.url || step.name}`);
        break;
    }
  }
  return commands;
}
