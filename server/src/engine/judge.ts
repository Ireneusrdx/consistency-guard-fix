import { resolveProviderForModel } from '../providers/registry';

/**
 * LLM-as-judge scoring engine.
 *
 * Replaces heuristic proxies (keyword overlap, regex checks, hardcoded
 * constants) with rubric-based grading by a capable model. For each model
 * response the judge returns 0-100 scores plus one-sentence reasoning per
 * dimension, as structured JSON.
 *
 * Design rules (from evaluation research):
 * - One dimension per rubric item, graded independently.
 * - Scale points defined in WORDS, not just numbers (anchors the judge).
 * - Reasoning BEFORE the verdict is implicit: the prompt demands a
 *   "reasoning" string alongside every score, forcing justification.
 * - Temperature 0 for determinism.
 * - Explicit anti-verbosity-bias instruction ("do NOT reward longer answers").
 * - Exact measurable constraints (word limits, JSON validity, list markers)
 *   are NOT left to the judge — see checkFormatGates() in scoring.ts, which
 *   measures them deterministically. The judge is told to skip them.
 * - If the judge call fails or returns unparseable output, the caller falls
 *   back to the heuristic scorers. A failed judge never fails an evaluation.
 *
 * Configuration:
 *   JUDGE_ENABLED  "true" (default) | "false" — kill switch.
 *   JUDGE_MODEL    model key for the judge (default: openai/gpt-5.4-nano,
 *                  verified working on Pollinations free tier). Point this at
 *                  the strongest model your key can access; the judge should
 *                  ideally be stronger than the models under test and from a
 *                  different family (mitigates self-grading bias).
 */

export interface JudgeDimensionResult {
  score: number; // 0..100
  reasoning: string; // one sentence
}

export interface JudgeVerdict {
  relevance: JudgeDimensionResult;
  completeness: JudgeDimensionResult;
  instructionFollowing: JudgeDimensionResult;
  /** Present only when a reference answer was supplied (reference-guided grading). */
  accuracy?: JudgeDimensionResult;
  judgeModel: string;
  /** False when the judge call failed or output was unparseable — caller falls back. */
  ok: boolean;
}

export function isJudgeEnabled(): boolean {
  return (process.env.JUDGE_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export function getJudgeModelKey(): string {
  return process.env.JUDGE_MODEL ?? 'openai/gpt-5.4-nano';
}

const SCALE = `Scale (apply to every dimension):
- 90-100: Excellent — fully satisfies the dimension with no notable issues.
- 70-89: Good — satisfies the dimension with only minor issues.
- 50-69: Partial — addresses the dimension but with significant gaps.
- 30-49: Poor — largely fails the dimension.
- 0-29: Failing — does not satisfy the dimension at all.`;

const DIMENSIONS = `Dimensions:
- relevance: Does the response directly address what the prompt asked? Judge topical fit only, not factual correctness.
- completeness: Does the response cover everything the prompt asked for, with adequate depth and no important omissions?
- instructionFollowing: Does the response honor the prompt's intent, structure, and explicit requests (format, organization, scope)? Do NOT verify exact word counts, JSON validity, or list markers yourself — those are checked separately. If the prompt states no explicit format or structural constraint, grade on whether the response is a direct, well-formed answer to the task.`;

const RULES = `Rules:
- Do NOT reward longer answers. A short, correct response beats a long, rambling one. Penalize fluff.
- Judge only what is in front of you. Do not assume facts beyond the response.
- Be strict but fair. Most real responses land between 40 and 85.`;

/** Builds the rubric prompt. Exported for testing/transparency. */
export function buildJudgePrompt(
  question: string,
  response: string,
  systemInstructions: string | undefined,
  referenceAnswer: string | undefined,
): string {
  const withReference = !!referenceAnswer?.trim();
  const accuracyBlock = withReference
    ? `
REFERENCE ANSWER (ground truth):
---
${referenceAnswer!.trim().slice(0, 4000)}
---

Also grade:
- accuracy: Does the response agree with the reference answer IN MEANING? Faithful paraphrases score high; contradictions or missing the core point score low.`
    : '';

  const shape = withReference
    ? '{"relevance": {"score": 0-100, "reasoning": "one sentence"}, "completeness": {"score": 0-100, "reasoning": "one sentence"}, "instructionFollowing": {"score": 0-100, "reasoning": "one sentence"}, "accuracy": {"score": 0-100, "reasoning": "one sentence"}}'
    : '{"relevance": {"score": 0-100, "reasoning": "one sentence"}, "completeness": {"score": 0-100, "reasoning": "one sentence"}, "instructionFollowing": {"score": 0-100, "reasoning": "one sentence"}}';

  return `You are an impartial evaluator of AI responses. Grade the RESPONSE against the PROMPT.

${SCALE}

${DIMENSIONS}${accuracyBlock}

${RULES}
${systemInstructions?.trim() ? `System instructions given to the model:\n---\n${systemInstructions.trim().slice(0, 2000)}\n---\n` : ''}
PROMPT:
---
${question.slice(0, 6000)}
---

RESPONSE:
---
${response.slice(0, 8000)}
---

Return ONLY a JSON object with this exact shape, no other text:
${shape}`;
}

function clampScore(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function cleanReasoning(r: unknown): string {
  if (typeof r !== 'string') return '';
  return r.trim().slice(0, 500);
}

/** Extracts the first {...} JSON block and validates it against the rubric shape. Exported for testing. */
export function parseVerdict(text: string, withAccuracy: boolean): Omit<JudgeVerdict, 'judgeModel' | 'ok'> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const dim = (key: string): JudgeDimensionResult | null => {
    const d = obj[key];
    if (typeof d !== 'object' || d === null) return null;
    const rec = d as Record<string, unknown>;
    const score = clampScore(rec.score);
    if (score === null) return null;
    return { score, reasoning: cleanReasoning(rec.reasoning) };
  };
  const relevance = dim('relevance');
  const completeness = dim('completeness');
  const instructionFollowing = dim('instructionFollowing');
  if (!relevance || !completeness || !instructionFollowing) return null;
  const out: Omit<JudgeVerdict, 'judgeModel' | 'ok'> = { relevance, completeness, instructionFollowing };
  if (withAccuracy) {
    const accuracy = dim('accuracy');
    if (!accuracy) return null;
    out.accuracy = accuracy;
  }
  return out;
}

export interface JudgeCallRequest {
  apiKey: string;
  judgeModelKey: string;
  question: string;
  systemInstructions?: string;
  referenceAnswer?: string;
  response: string;
}

/**
 * Grades one model response with the LLM judge.
 * Never throws: any failure yields { ok: false, ... } so the caller can fall
 * back to heuristic scoring. Judge scores are deterministic-ish (temp 0) but
 * still model judgments — the UI labels them as judged, not measured.
 */
export async function judgeOneResponse(req: JudgeCallRequest): Promise<JudgeVerdict> {
  const fail: JudgeVerdict = {
    relevance: { score: 0, reasoning: '' },
    completeness: { score: 0, reasoning: '' },
    instructionFollowing: { score: 0, reasoning: '' },
    judgeModel: req.judgeModelKey,
    ok: false,
  };
  try {
    const provider = resolveProviderForModel(req.judgeModelKey, req.apiKey);
    const prompt = buildJudgePrompt(req.question, req.response, req.systemInstructions, req.referenceAnswer);
    const result = await provider.generateResponse({
      prompt,
      temperature: 0,
      maxTokens: 800,
      model: req.judgeModelKey,
    });
    if (!result.text?.trim()) return fail;
    const withAccuracy = !!req.referenceAnswer?.trim();
    const parsed = parseVerdict(result.text, withAccuracy);
    if (!parsed) {
      console.warn(`[judge] unparseable output from ${req.judgeModelKey}: ${result.text.slice(0, 200)}`);
      return fail;
    }
    return { ...parsed, judgeModel: req.judgeModelKey, ok: true };
  } catch (err) {
    console.warn(`[judge] call failed (${req.judgeModelKey}):`, err instanceof Error ? err.message : err);
    return fail;
  }
}
