export type {
  CommandParameter,
  CommandOutputSpec,
  SkillCommandSpec,
  SkillCommandDispatchSpec,
  CommandCategory,
  SearchCommandsOptions,
  ValidationResult,
} from "./command-specs.js";

export {
  registerCommandSpec,
  unregisterCommandSpec,
  getCommandSpec,
  getSkillCommands,
  getAllCommandSpecs,
  listCommandCategories,
  addCommandCategory,
  searchCommands,
  validateCommandParams,
  formatCommandHelp,
  clearCommandRegistry,
} from "./command-specs.js";

export type {
  DispatchRequest,
  DispatchResponse,
  CommandHandler,
} from "./command-dispatch.js";

export {
  dispatchCommand,
  registerCommandHandler,
  unregisterCommandHandler,
  hasCommandHandler,
  listAvailableCommands,
  clearCommandHandlers,
} from "./command-dispatch.js";

export type {
  SkillIndexEntry,
  SearchMode,
  SearchOptions,
  SearchResult,
  SearchIndex,
} from "./skill-index.js";

export {
  isSkillRuntimeVisible,
  isSkillPromptVisible,
  isSkillUserInvocable,
  filterPromptVisibleSkillEntries,
  filterUserInvocableSkillEntries,
  buildSkillIndexEntries,
  findSkillByNormalizedName,
  searchSkills,
  searchSkillsWithScores,
  combinedSearch,
  fuzzySearch,
  semanticSearch,
  suggestSkills,
  findRelatedSkills,
  buildSkillIndex,
} from "./skill-index.js";

export type {
  FilterOperator,
  FilterCondition,
  FilterExpression,
} from "./filter.js";

export {
  normalizeSkillFilter,
  normalizeSkillFilterForComparison,
  matchesSkillFilter,
  skillMatchesFilter,
  normalizeSkillName,
  matchCondition,
  evaluateFilter,
  createRegexFilter,
  createContainsFilter,
  createOrFilter,
  createAndFilter,
  filterByPattern,
  filterByRange,
} from "./filter.js";
