export type {
  CommandContext,
  CommandShape,
  SourceSpan,
  CommandStep,
  CommandOperatorKind,
  CommandOperator,
  CommandRisk,
  CommandExplanation,
  SyntaxError,
  SyntaxCheckResult,
  RiskLevel,
  SafetyAnalysisResult,
  ParsedArg,
  ArgsParseResult,
  PathResolutionResult,
  CommandPolicyAnalysis,
  CommandExplanationSummary,
} from "./types.js";

export {
  checkCommandSyntax,
  validateCommandStructure,
  formatSyntaxError,
} from "./syntax-check.js";

export {
  analyzeCommandSafety,
  isCommandSafe,
  assertCommandSafe,
  getRiskLevel,
} from "./safety-analysis.js";

export {
  parseCommandArgs,
  parseShellCommand,
  getFlagValue,
  hasFlag,
  getPositionalArgs,
  buildArgv,
} from "./args-parser.js";

export {
  resolveCommandPath,
  isPathSafe,
  assertPathSafe,
  resolveRelativePath,
  getPathComponents,
  isPathWithinBoundary,
  getRelativePathWithinBoundary,
  resolveHomePath,
  pathInHome,
} from "./path-resolver.js";