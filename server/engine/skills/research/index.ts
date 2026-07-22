export type {
  SkillUsageSignal,
  UsagePattern,
  SkillSuggestion,
  SignalAnalysisResult,
  UsageStats,
} from "./signals.js";

export {
  recordSkillUsage,
  analyzeUsageSignals,
  getTopUsedSkills,
  getUnderusedSkills,
  detectUsagePatterns,
  generateSkillSuggestions,
  clearUsageSignals,
  getUsageStats,
} from "./signals.js";

export type {
  CapturedConversation,
  CapturedMessage,
  PotentialSkillNeed,
} from "./autocapture.js";

export {
  captureConversation,
  summarizeCapturedConversations,
  detectPotentialSkillNeeds,
  getCapturedConversations,
  clearCapturedConversations,
} from "./autocapture.js";

export {
  extractKeywords,
  detectIntent,
  extractToolMentions,
  computeTextSimilarity,
  tokenize,
} from "./text.js";
