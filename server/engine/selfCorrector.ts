import { logger } from '../logger.js';
import { outputReviewer, type OutputQuality, type OutputReviewDecision } from './outputReviewer.js';

export interface SelfCorrectionInput {
  userQuestion: string;
  originalResponse: string;
  reviewDecision: OutputReviewDecision;
  modelConfig: unknown;
  apiMessages: Array<{ role: string; content: string }>;
}

export interface SelfCorrectionResult {
  corrected: boolean;
  response?: string;
  originalQuality: OutputQuality;
  finalQuality: OutputQuality;
  attempts: number;
  reviewDecisions: OutputReviewDecision[];
}

const MAX_CORRECTION_ATTEMPTS = 2;
const CORRECTION_TEMPERATURE_ADJUSTMENT = -0.1;

function buildCorrectionPrompt(
  userQuestion: string,
  originalResponse: string,
  reviewDecision: OutputReviewDecision,
): string {
  const issuesList = reviewDecision.issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n');
  return [
    'The previous response to the user was reviewed and found to have quality issues.',
    '',
    'User Question:',
    userQuestion,
    '',
    'Original Response:',
    originalResponse,
    '',
    'Quality Issues Found:',
    issuesList,
    '',
    'Suggestion:',
    reviewDecision.suggestion,
    '',
    'Please provide a corrected, improved response that addresses all of the above issues.',
    'Make sure the new response is accurate, complete, safe, and well-formatted.',
    'Do NOT mention that this is a correction or that there were issues with the previous response.',
    'Simply provide the best possible answer to the user\'s question.',
  ].join('\n');
}

export class SelfCorrector {
  private enabled: boolean;
  private maxAttempts: number;

  constructor(enabled: boolean = false, maxAttempts: number = MAX_CORRECTION_ATTEMPTS) {
    this.enabled = enabled;
    this.maxAttempts = maxAttempts;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getMaxAttempts(): number {
    return this.maxAttempts;
  }

  setMaxAttempts(maxAttempts: number): void {
    this.maxAttempts = Math.max(0, Math.min(5, maxAttempts));
  }

  async shouldAttemptCorrection(quality: OutputQuality): Promise<boolean> {
    if (!this.enabled) return false;
    return !outputReviewer.isQualityAcceptable(quality);
  }

  async attemptCorrection(
    input: SelfCorrectionInput,
    generateResponse: (messages: Array<{ role: string; content: string }>) => Promise<string>,
  ): Promise<SelfCorrectionResult> {
    const originalQuality = input.reviewDecision.quality;
    const reviewDecisions: OutputReviewDecision[] = [input.reviewDecision];

    if (!this.enabled || outputReviewer.isQualityAcceptable(originalQuality)) {
      return {
        corrected: false,
        originalQuality,
        finalQuality: originalQuality,
        attempts: 0,
        reviewDecisions,
      };
    }

    logger.info(`[SelfCorrector] Starting correction for quality ${originalQuality}`);

    let currentMessages = [...input.apiMessages];
    let bestResponse = input.originalResponse;
    let bestQuality = originalQuality;
    let attempts = 0;

    for (let i = 0; i < this.maxAttempts; i++) {
      attempts = i + 1;
      logger.info(`[SelfCorrector] Correction attempt ${attempts}/${this.maxAttempts}`);

      try {
        const correctionPrompt = buildCorrectionPrompt(
          input.userQuestion,
          bestResponse,
          reviewDecisions[reviewDecisions.length - 1],
        );

        const correctionMessages = [
          ...currentMessages,
          { role: 'user', content: correctionPrompt },
        ];

        const correctedResponse = await generateResponse(correctionMessages);

        const reviewResult = await outputReviewer.review({
          userQuestion: input.userQuestion,
          aiResponse: correctedResponse,
        });

        reviewDecisions.push(reviewResult);

        logger.info(`[SelfCorrector] Attempt ${attempts} quality: ${reviewResult.quality}`);

        const qualityScore = (q: OutputQuality) => ({ A: 4, B: 3, C: 2, D: 1 }[q]);

        if (qualityScore(reviewResult.quality) > qualityScore(bestQuality)) {
          bestResponse = correctedResponse;
          bestQuality = reviewResult.quality;
        }

        if (outputReviewer.isQualityAcceptable(reviewResult.quality)) {
          logger.info(`[SelfCorrector] Correction succeeded with quality ${reviewResult.quality}`);
          break;
        }

        currentMessages = correctionMessages;
      } catch (err) {
        logger.error(`[SelfCorrector] Correction attempt ${attempts} failed:`, err);
        break;
      }
    }

    const improved = bestQuality !== originalQuality;

    logger.info(`[SelfCorrector] Final result: ${originalQuality} -> ${bestQuality} (${improved ? 'improved' : 'no improvement'})`);

    return {
      corrected: improved,
      response: bestResponse,
      originalQuality,
      finalQuality: bestQuality,
      attempts,
      reviewDecisions,
    };
  }
}

export const selfCorrector = new SelfCorrector();
