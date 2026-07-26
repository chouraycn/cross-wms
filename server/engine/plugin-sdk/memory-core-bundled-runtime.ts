export type ShortTermDreamingStatsEntry = {
  key: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  recallCount: number;
  dailyCount: number;
  groundedCount: number;
  totalSignalCount: number;
  lightHits: number;
  remHits: number;
  phaseHitCount: number;
  promotedAt?: string;
  lastRecalledAt?: string;
};

export type ShortTermDreamingStats = {
  shortTermCount: number;
  recallSignalCount: number;
  dailySignalCount: number;
  groundedSignalCount: number;
  totalSignalCount: number;
  phaseSignalCount: number;
  lightPhaseHitCount: number;
  remPhaseHitCount: number;
  promotedTotal: number;
  promotedToday: number;
  storePath: string;
  phaseSignalPath: string;
  phaseSignalError?: string;
  lastPromotedAt?: string;
  shortTermEntries: ShortTermDreamingStatsEntry[];
  signalEntries: ShortTermDreamingStatsEntry[];
  promotedEntries: ShortTermDreamingStatsEntry[];
};

type GroundedRemPreviewItem = {
  text: string;
  refs: string[];
};

type GroundedRemCandidate = GroundedRemPreviewItem & {
  lean: "likely_durable" | "unclear" | "likely_situational";
};

type GroundedRemFilePreview = {
  path: string;
  facts: GroundedRemPreviewItem[];
  reflections: GroundedRemPreviewItem[];
  memoryImplications: GroundedRemPreviewItem[];
  candidates: GroundedRemCandidate[];
  renderedMarkdown: string;
};

type GroundedRemPreviewResult = {
  workspaceDir: string;
  scannedFiles: number;
  files: GroundedRemFilePreview[];
};

type RemDreamingPreview = {
  sourceEntryCount: number;
  reflections: string[];
  candidateTruths: Array<{
    snippet: string;
    confidence: number;
    evidence: string;
  }>;
  candidateKeys: string[];
  bodyLines: string[];
};

type PromotionCandidate = {
  key: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  recallCount: number;
  uniqueQueries: number;
  avgScore: number;
  maxScore: number;
  ageDays: number;
  firstRecalledAt: string;
  lastRecalledAt: string;
  promotedAt?: string;
};

type RemHarnessPreviewResult = {
  workspaceDir: string;
  nowMs: number;
  remConfig: {
    enabled: boolean;
    lookbackDays: number;
    limit: number;
    minPatternStrength: number;
  };
  deepConfig: {
    minScore: number;
    minRecallCount: number;
    minUniqueQueries: number;
    recencyHalfLifeDays: number;
    maxAgeDays?: number;
  };
  recallEntryCount: number;
  remSkipped: boolean;
  rem: RemDreamingPreview;
  groundedInputPaths: string[];
  grounded: GroundedRemPreviewResult | null;
  deep: {
    candidateLimit?: number;
    candidateCount: number;
    truncated: boolean;
    candidates: PromotionCandidate[];
  };
};

type RepairDreamingArtifactsResult = {
  changed: boolean;
  archiveDir?: string;
  archivedDreamsDiary: boolean;
  archivedSessionCorpus: boolean;
  archivedSessionIngestion: boolean;
  archivedPaths: string[];
  warnings: string[];
};

type EmbeddingProviderResult = {
  provider: object | null;
  requestedProvider: string;
  fallbackFrom?: string;
  fallbackReason?: string;
  providerUnavailableReason?: string;
  runtime?: object;
};

export type {
  GroundedRemPreviewItem,
  GroundedRemCandidate,
  GroundedRemFilePreview,
  GroundedRemPreviewResult,
  RemDreamingPreview,
  PromotionCandidate,
  RemHarnessPreviewResult,
  RepairDreamingArtifactsResult,
  EmbeddingProviderResult,
};
