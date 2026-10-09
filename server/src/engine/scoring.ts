import { jaccardSimilarity, contentTokens, tokenSet } from './normalize';

/**
 * Reliability scoring engine.
 *
 * Default weights (from the evaluation methodology — configurable without
 * rewriting scoring logic):
 *   accuracy            35%
 *   consistency         20%
 *   relevance           15%
 *   completeness        10%
 *   grounding           10%
 *   instructionFollowing 10%
 *
 * METHODOLOGY NOTE: "accuracy" is Ground-Truth Accuracy ONLY when a verified
 * reference answer exists. For open-ended evaluation the accuracy slot is
 * marked isEstimated and derived from cross-model semantic agreement, and the
 * UI must label the analysis "Cross-Model / Evidence-Based Reliability".
 *
 * JUDGE NOTE (2026-10-08): relevance, completeness, and instruction-following
 * are now graded by an LLM judge against a written rubric (see judge.ts),
 * replacing the old keyword-overlap and regex heuristics. Exact measurable
 * constraints (word limits, JSON validity, list markers) are checked
 * deterministically via checkFormatGates() — never left to the judge.
 * When a reference answer exists, accuracy is reference-guided judge grading;
 * otherwise the cross-model-agreement estimate is kept. If the judge call
 * fails, the pipeline falls back to the legacy heuristics transparently.
 */

export interface ScoringWeights {
  accuracy: number;
  consistency: number;
  relevance: number;
  completeness: number;
  grounding: number;
  instructionFollowing: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  accuracy: 0.35,
  consistency: 0.2,
  relevance: 0.15,
  completeness: 0.1,
  grounding: 0.1,
  instructionFollowing: 0.1,
};

export function normalizeWeights(w: Partial<ScoringWeights>): ScoringWeights {
  const merged: ScoringWeights = { ...DEFAULT_WEIGHTS, ...w };
  for (const [k, v] of Object.entries(merged)) {
    if (typeof v !== 'number' || v < 0) {
      throw new Error(`Scoring weight "${k}" must be a non-negative number.`);
    }
  }
  const total = Object.values(merged).reduce((a, b) => a + b, 0);
  if (total <= 0) throw new Error('Scoring weights must sum to a positive value.');
  const out = {} as ScoringWeights;
  for (const k of Object.keys(merged) as (keyof ScoringWeights)[]) {
    out[k] = merged[k] / total;
  }
  return out;
}

export interface MetricValues {
  accuracy: number | null; // null when no ground truth
  accuracyIsEstimated: boolean;
  consistency: number;
  relevance: number;
  completeness: number;
  grounding: number;
  instructionFollowing: number;
}

export interface ReliabilityResult {
  score: number; // 0..100
  breakdown: Record<keyof ScoringWeights, number>;
  accuracyIsEstimated: boolean;
  explanation: string[];
}

/** Keyword overlap between prompt and response — 0..100. */
export function calculateRelevance(prompt: string, response: string): number {
  const promptTokens = tokenSet(prompt);
  const responseTokens = tokenSet(response);
  if (promptTokens.size === 0) return 50;
  let hits = 0;
  for (const t of promptTokens) if (responseTokens.has(t)) hits++;
  // Length-normalized: penalize very short responses that happen to match.
  const coverage = hits / promptTokens.size;
  const lengthFactor = Math.min(1, response.split(/\s+/).length / 40);
  return Math.round(Math.min(1, coverage * (0.6 + 0.4 * lengthFactor)) * 100);
}

/** Coverage of prompt aspects + adequate elaboration — 0..100. */
export function calculateCompleteness(prompt: string, response: string): number {
  const aspects = prompt
    .split(/[,;]|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  const responseTokens = tokenSet(response);
  let covered = 0;
  for (const aspect of aspects.slice(0, 8)) {
    const aspectTokens = contentTokens(aspect);
    if (aspectTokens.length === 0) continue;
    const hit = aspectTokens.filter((t) => responseTokens.has(t)).length;
    if (hit / aspectTokens.length >= 0.4) covered++;
  }
  const aspectScore = aspects.length === 0 ? 0.7 : covered / Math.min(8, aspects.length);
  const wordCount = response.split(/\s+/).length;
  const lengthScore = wordCount < 20 ? 0.3 : wordCount < 60 ? 0.6 : wordCount < 400 ? 1 : 0.85;
  return Math.round((0.6 * aspectScore + 0.4 * lengthScore) * 100);
}

/** Share of claims with retrieved evidence support — 0..100. */
export function calculateGrounding(supportedClaims: number, totalClaims: number): number {
  if (totalClaims === 0) return 50; // no claims extracted → neutral, flagged in explanation
  return Math.round((supportedClaims / totalClaims) * 100);
}

/**
 * Instruction following — 0..100. Checks explicit constraints in the prompt:
 * requested output format (JSON, bullets, numbered list), word limits,
 * language/format keywords, and system instructions.
 */
export function calculateInstructionFollowing(
  prompt: string,
  response: string,
  systemInstructions?: string,
): number {
  const combined = `${prompt}\n${systemInstructions ?? ''}`.toLowerCase();
  const checks: boolean[] = [];

  if (/\bjson\b/.test(combined)) {
    checks.push(/\{[\s\S]*\}/.test(response));
  }
  if (/\b(bullets?|bulleted|bullet points?)\b/.test(combined)) {
    checks.push(/^[ \t]*[-*•]/m.test(response));
  }
  if (/\b(numbered|number lists?|step-by-step|steps)\b/.test(combined)) {
    checks.push(/^\s*\d+[.)]/m.test(response));
  }
  const wordLimit = combined.match(/(?:under|less than|max(?:imum)?|no more than)\s+(\d+)\s+words?/);
  if (wordLimit) {
    const limit = parseInt(wordLimit[1], 10);
    checks.push(response.split(/\s+/).length <= limit * 1.15);
  }
  if (/\b(code|function|python|javascript|typescript|sql)\b/.test(combined)) {
    checks.push(/```/.test(response) || /\b(function|def|const|=>|SELECT)\b/.test(response));
  }

  if (checks.length === 0) {
    // No explicit constraints → base score on responsiveness, not perfect.
    return response.trim().length > 50 ? 78 : 55;
  }
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}

/**
 * Deterministic format gates — exact, measurable constraints checked in code,
 * NEVER left to an LLM judge (models are notoriously bad at counting words
 * or validating JSON). Each gate is pass/fail. The evaluation pipeline uses
 * failed gates to cap the instruction-following score and surfaces them in
 * explanations, rather than folding them into a fake numeric score.
 */
export interface FormatGate {
  name: string;
  passed: boolean;
  detail: string;
}

export function checkFormatGates(prompt: string, response: string, systemInstructions?: string): FormatGate[] {
  const combined = `${prompt}\n${systemInstructions ?? ''}`.toLowerCase();
  const gates: FormatGate[] = [];

  const wordLimit = combined.match(/(?:under|less than|max(?:imum)?|no more than)\s+(\d+)\s+words?/);
  if (wordLimit) {
    const limit = parseInt(wordLimit[1], 10);
    const words = response.split(/\s+/).filter(Boolean).length;
    gates.push({
      name: `word limit (${limit})`,
      passed: words <= limit,
      detail: words <= limit ? `Response is ${words} words.` : `Response is ${words} words, over the ${limit}-word limit.`,
    });
  }
  if (/\bjson\b/.test(combined)) {
    let valid = false;
    try {
      const s = response.indexOf('{');
      const e = response.lastIndexOf('}');
      if (s !== -1 && e > s) {
        JSON.parse(response.slice(s, e + 1));
        valid = true;
      }
    } catch {
      valid = false;
    }
    gates.push({ name: 'valid JSON', passed: valid, detail: valid ? 'Response contains valid JSON.' : 'Prompt requested JSON but the response has none or it is malformed.' });
  }
  if (/\b(bullets?|bulleted|bullet points?)\b/.test(combined)) {
    const has = /^[ \t]*[-*•]/m.test(response);
    gates.push({ name: 'bullet list', passed: has, detail: has ? 'Response uses bullets.' : 'Prompt requested bullets but none were found.' });
  }
  if (/\b(numbered|number lists?|step-by-step|steps)\b/.test(combined)) {
    const has = /^\s*\d+[.)]/m.test(response);
    gates.push({ name: 'numbered list', passed: has, detail: has ? 'Response uses a numbered list.' : 'Prompt requested a numbered list but none was found.' });
  }
  if (/\b(code|function|python|javascript|typescript|sql)\b/.test(combined)) {
    const has = /```/.test(response) || /\b(function|def|const|=>|SELECT)\b/.test(response);
    gates.push({ name: 'code formatting', passed: has, detail: has ? 'Response includes code.' : 'Prompt asked for code but none was found.' });
  }
  return gates;
}

/** When any explicit measurable constraint is violated, instruction-following
 *  cannot score "good" — cap it at 59 (top of "Partial"). */
export function applyGateCap(judgeScore: number, gates: FormatGate[]): number {
  if (gates.some((g) => !g.passed)) return Math.min(judgeScore, 59);
  return judgeScore;
}

/** Ground-truth accuracy via semantic similarity to a reference answer — 0..100.
 *  Heuristic fallback: prefer the LLM judge's reference-guided accuracy when
 *  the judge is available (see evaluation.ts). */
export function calculateGroundTruthAccuracy(response: string, referenceAnswer: string): number {
  if (!referenceAnswer.trim()) return 0;
  return Math.round(jaccardSimilarity(response, referenceAnswer) * 100);
}

/** Hallucination risk — 0..100, higher is riskier. */
export function calculateHallucinationRisk(
  contradictedClaims: number,
  totalClaims: number,
  uncertaintyScore: number,
  highConfidenceWeakEvidence: boolean,
): number {
  const contradictionRate = totalClaims === 0 ? 0 : contradictedClaims / totalClaims;
  let risk = contradictionRate * 60 + (uncertaintyScore / 100) * 20;
  if (highConfidenceWeakEvidence) risk += 20;
  return Math.round(Math.min(100, risk));
}

export function calculateReliability(metrics: MetricValues, weights: ScoringWeights): ReliabilityResult {
  const w = normalizeWeights(weights);
  const breakdown: Record<keyof ScoringWeights, number> = {
    accuracy: metrics.accuracy ?? 0,
    consistency: metrics.consistency,
    relevance: metrics.relevance,
    completeness: metrics.completeness,
    grounding: metrics.grounding,
    instructionFollowing: metrics.instructionFollowing,
  };
  // When there is no ground truth, accuracy is estimated from cross-model
  // agreement and down-weighted transparency is preserved via the flag.
  const score = Math.round(
    breakdown.accuracy * w.accuracy +
      breakdown.consistency * w.consistency +
      breakdown.relevance * w.relevance +
      breakdown.completeness * w.completeness +
      breakdown.grounding * w.grounding +
      breakdown.instructionFollowing * w.instructionFollowing,
  );
  const explanation: string[] = [];
  if (metrics.accuracyIsEstimated) {
    explanation.push(
      'No verified reference answer was provided, so "accuracy" is an estimate from cross-model semantic agreement — not ground-truth accuracy.',
    );
  } else {
    explanation.push('Accuracy is ground-truth accuracy measured against the provided reference answer.');
  }
  explanation.push(
    `Consistency ${breakdown.consistency}/100 from repeated runs; grounding ${breakdown.grounding}/100 from evidence-supported claims.`,
  );
  return { score, breakdown, accuracyIsEstimated: metrics.accuracyIsEstimated, explanation };
}
