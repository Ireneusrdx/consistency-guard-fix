/**
 * Deterministic scoring metrics for Consistency Guard.
 *
 * Every function in this module is a pure, explainable computation over text:
 * no LLM calls, no embeddings, no external models. Scores produced here can
 * be traced back to the exact formula in the code, which is the point — the
 * user asked for logical judging, not AI grading AI.
 *
 * Measures provided:
 *  - TF-IDF cosine similarity  (rare, informative words count more)
 *  - ROUGE-L                   (longest-common-subsequence phrasing overlap)
 *  - Normalized Levenshtein    (word-level edit distance, good for short answers)
 *  - Jaccard                   (reused from normalize.ts)
 *  - Claim clustering          (which claims recur across runs)
 *  - Numeric/date agreement     (numbers that change across runs = inconsistency)
 *  - Adversarial probes        (paraphrase, distractor, constraint-conflict)
 */

import {
  contentTokens,
  tokenSet,
  jaccardSimilarity,
  extractNumbers,
  extractYears,
} from './normalize';
import type { ExtractedClaim } from './claims';

// ---------------------------------------------------------------------------
// TF-IDF cosine similarity
// ---------------------------------------------------------------------------

/** Term frequencies for one document. */
function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const n = tokens.length || 1;
  for (const [k, v] of tf) tf.set(k, v / n);
  return tf;
}

/** Document frequencies across a corpus (each doc = token array). */
export function documentFrequencies(corpus: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of corpus) {
    for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return df;
}

/**
 * TF-IDF cosine similarity in [0,1]. Rare terms (low document frequency)
 * carry more weight, so two answers sharing distinctive vocabulary score
 * higher than two answers sharing only common words.
 *
 * `corpus` should be every run's content tokens across the evaluation; when
 * omitted, IDF falls back to a uniform weight (equivalent to plain cosine).
 */
export function tfidfCosineSimilarity(
  a: string,
  b: string,
  corpus?: string[][],
): number {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const tfa = termFrequencies(ta);
  const tfb = termFrequencies(tb);
  const vocab = new Set([...tfa.keys(), ...tfb.keys()]);

  let idfOf: (t: string) => number;
  if (corpus && corpus.length > 0) {
    const df = documentFrequencies(corpus);
    const n = corpus.length;
    idfOf = (t) => Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1;
  } else {
    idfOf = () => 1;
  }

  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const t of vocab) {
    const w = idfOf(t);
    const va = (tfa.get(t) ?? 0) * w;
    const vb = (tfb.get(t) ?? 0) * w;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------------------------------------------------------------------------
// ROUGE-L (longest common subsequence F-measure)
// ---------------------------------------------------------------------------

function lcsLength(x: string[], y: string[]): number {
  const m = x.length;
  const n = y.length;
  if (m === 0 || n === 0) return 0;
  // Two-row DP to keep memory O(min(m,n)).
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      curr[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[n];
}

/**
 * ROUGE-L F1 in [0,1] over content tokens: LCS(candidate, reference) based
 * recall/precision harmonic mean. Rewards shared phrasing and word order,
 * unlike bag-of-words measures.
 */
export function rougeLScore(candidate: string, reference: string): number {
  const c = contentTokens(candidate);
  const r = contentTokens(reference);
  if (c.length === 0 || r.length === 0) return 0;
  const lcs = lcsLength(c, r);
  if (lcs === 0) return 0;
  const precision = lcs / c.length;
  const recall = lcs / r.length;
  return (2 * precision * recall) / (precision + recall);
}

// ---------------------------------------------------------------------------
// Normalized Levenshtein (word-level edit distance)
// ---------------------------------------------------------------------------

/**
 * 1 - (word-level edit distance / max token count), in [0,1].
 * Computed over content tokens so it stays cheap on long answers and focuses
 * on meaningful words. Best suited to short answers; for long-form text the
 * other measures dominate the composite.
 */
export function normalizedLevenshtein(a: string, b: string): number {
  const x = contentTokens(a);
  const y = contentTokens(b);
  const m = x.length;
  const n = y.length;
  if (m === 0 && n === 0) return 1;
  if (m === 0 || n === 0) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  const distance = prev[n];
  return 1 - distance / Math.max(m, n);
}

// ---------------------------------------------------------------------------
// Multi-measure similarity
// ---------------------------------------------------------------------------

export interface SimilarityMeasures {
  jaccard: number;
  tfidf: number;
  rougeL: number;
  levenshtein: number;
  /** Weighted composite: tfidf 0.35, rougeL 0.3, jaccard 0.25, levenshtein 0.1. */
  composite: number;
}

const W_TFIDF = 0.35;
const W_ROUGEL = 0.3;
const W_JACCARD = 0.25;
const W_LEV = 0.1;

/**
 * All four deterministic similarity measures between two texts, plus a
 * weighted composite. Each measure captures something different:
 *  - jaccard: shared vocabulary (bag of words)
 *  - tfidf: shared *distinctive* vocabulary
 *  - rougeL: shared phrasing / word order
 *  - levenshtein: fine-grained edit closeness (short answers)
 */
export function multiMeasureSimilarity(
  a: string,
  b: string,
  corpus?: string[][],
): SimilarityMeasures {
  const jaccard = jaccardSimilarity(a, b);
  const tfidf = tfidfCosineSimilarity(a, b, corpus);
  const rougeL = rougeLScore(a, b);
  const levenshtein = normalizedLevenshtein(a, b);
  const composite =
    W_TFIDF * tfidf + W_ROUGEL * rougeL + W_JACCARD * jaccard + W_LEV * levenshtein;
  return { jaccard, tfidf, rougeL, levenshtein, composite };
}

export interface SimilarityMatrixDetail {
  /** Pairwise composite similarity matrix (symmetric, diagonal 1). */
  composite: number[][];
  /** Mean pairwise score per measure, across all run pairs. */
  meanByMeasure: { jaccard: number; tfidf: number; rougeL: number; levenshtein: number; composite: number };
  pairCount: number;
}

/** Pairwise multi-measure similarity across all runs. */
export function detailedSimilarityMatrix(texts: string[]): SimilarityMatrixDetail {
  const n = texts.length;
  const corpus = texts.map(contentTokens);
  const composite: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const sums = { jaccard: 0, tfidf: 0, rougeL: 0, levenshtein: 0, composite: 0 };
  let pairCount = 0;
  for (let i = 0; i < n; i++) {
    composite[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const m = multiMeasureSimilarity(texts[i], texts[j], corpus);
      composite[i][j] = m.composite;
      composite[j][i] = m.composite;
      sums.jaccard += m.jaccard;
      sums.tfidf += m.tfidf;
      sums.rougeL += m.rougeL;
      sums.levenshtein += m.levenshtein;
      sums.composite += m.composite;
      pairCount++;
    }
  }
  const mean = (s: number) => (pairCount === 0 ? 1 : s / pairCount);
  return {
    composite,
    meanByMeasure: {
      jaccard: mean(sums.jaccard),
      tfidf: mean(sums.tfidf),
      rougeL: mean(sums.rougeL),
      levenshtein: mean(sums.levenshtein),
      composite: mean(sums.composite),
    },
    pairCount,
  };
}

// ---------------------------------------------------------------------------
// Claim clustering across runs
// ---------------------------------------------------------------------------

export interface ClaimCluster {
  /** Representative claim text (longest in the cluster). */
  representative: string;
  /** Indices into the flattened claim list. */
  claimIndices: number[];
  /** Distinct run indices containing a claim from this cluster. */
  runs: number[];
  /** runs.length / totalRuns — 1.0 means the claim appears in every run. */
  runCoverage: number;
}

function cleanToken(t: string): string {
  return t.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

function claimTextSimilarity(a: string, b: string): number {
  const sa = new Set([...tokenSet(a)].map(cleanToken).filter(Boolean));
  const sb = new Set([...tokenSet(b)].map(cleanToken).filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / Math.max(sa.size, sb.size);
}

/**
 * Greedy clustering of claims across runs: a claim joins the first cluster
 * whose representative overlaps it by >= threshold (default 0.5 token
 * overlap). Deterministic — no randomness, order-dependent but stable for a
 * given input order.
 */
export function clusterClaims(
  claimsPerRun: ExtractedClaim[][],
  threshold = 0.5,
): ClaimCluster[] {
  const flat: Array<{ claim: ExtractedClaim; run: number }> = [];
  claimsPerRun.forEach((claims, run) => {
    for (const claim of claims) flat.push({ claim, run });
  });
  const clusters: ClaimCluster[] = [];
  flat.forEach(({ claim, run }, idx) => {
    let placed = false;
    for (const c of clusters) {
      if (claimTextSimilarity(claim.text, c.representative) >= threshold) {
        c.claimIndices.push(idx);
        if (!c.runs.includes(run)) c.runs.push(run);
        if (claim.text.length > c.representative.length) c.representative = claim.text;
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ representative: claim.text, claimIndices: [idx], runs: [run], runCoverage: 0 });
    }
  });
  const totalRuns = claimsPerRun.length || 1;
  for (const c of clusters) {
    c.runs.sort((x, y) => x - y);
    c.runCoverage = c.runs.length / totalRuns;
  }
  return clusters;
}

export interface ClaimConsistencyDetail {
  /** 0..100 — share of claim clusters appearing in a majority of runs. */
  score: number;
  totalClusters: number;
  majorityClusters: number;
  explanation: string;
}

/**
 * Claim-level consistency: what fraction of the distinct claims made across
 * runs shows up in a majority of runs (>= 60% by default)? A model that
 * invents different facts each run scores low here even if its wording is
 * superficially similar.
 */
export function claimConsistencyScore(
  claimsPerRun: ExtractedClaim[][],
  majorityRatio = 0.6,
): ClaimConsistencyDetail {
  const clusters = clusterClaims(claimsPerRun);
  if (clusters.length === 0) {
    return {
      score: 100,
      totalClusters: 0,
      majorityClusters: 0,
      explanation: 'No factual claims extracted from any run — nothing to disagree on.',
    };
  }
  const majority = clusters.filter((c) => c.runCoverage >= majorityRatio).length;
  const score = Math.round((majority / clusters.length) * 100);
  return {
    score,
    totalClusters: clusters.length,
    majorityClusters: majority,
    explanation:
      `${majority}/${clusters.length} distinct claim(s) appear in a majority of runs ` +
      `(coverage >= ${Math.round(majorityRatio * 100)}%).`,
  };
}

// ---------------------------------------------------------------------------
// Numeric / date agreement across runs
// ---------------------------------------------------------------------------

export interface NumericAgreementDetail {
  /** 0..100, or null when no run contains any number/date. */
  score: number | null;
  explanation: string;
}

function numbersIn(text: string): string[] {
  const nums = extractNumbers(text).map((n) => `n:${n}`);
  const years = extractYears(text).map((y) => `y:${y}`);
  return [...new Set([...nums, ...years])];
}

/**
 * Agreement on concrete numbers and dates across runs. Each run's number-set
 * is compared pairwise with Jaccard; the mean is the score. A model that
 * quotes different figures each run fails here — this is the strongest
 * deterministic signal for factual questions.
 *
 * Returns null when no run contains any number or date (not applicable,
 * must not be scored as 0 or 100).
 */
export function numericAgreementScore(texts: string[]): NumericAgreementDetail {
  const sets = texts.map((t) => new Set(numbersIn(t)));
  const anyNumbers = sets.some((s) => s.size > 0);
  if (!anyNumbers) {
    return { score: null, explanation: 'No numbers or dates found in any run — not applicable.' };
  }
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const a = sets[i];
      const b = sets[j];
      if (a.size === 0 && b.size === 0) continue;
      let inter = 0;
      for (const v of a) if (b.has(v)) inter++;
      const union = new Set([...a, ...b]).size;
      sum += union === 0 ? 1 : inter / union;
      pairs++;
    }
  }
  const score = pairs === 0 ? 100 : Math.round((sum / pairs) * 100);
  return {
    score,
    explanation: `Number/date sets agree at ${score}/100 across ${pairs} run pair(s).`,
  };
}

// ---------------------------------------------------------------------------
// Adversarial probes (deterministic prompt perturbations)
// ---------------------------------------------------------------------------

/**
 * Deterministic paraphrases of a question — rule-based rewordings for common
 * question shapes, with generic fallbacks. No LLM involved, so these are
 * simple but honest: they test whether the model's answer is stable when the
 * same question is asked differently.
 */
export function paraphrasePrompt(prompt: string): string[] {
  const p = prompt.trim();
  const variants: string[] = [];

  const whatIs = p.match(/^what\s+(is|are|was|were)\s+(.+?)\??$/i);
  if (whatIs) {
    const subject = whatIs[2].trim();
    variants.push(`Define ${subject}.`);
    variants.push(`Explain ${subject}.`);
  }
  const howDoes = p.match(/^how\s+does\s+(.+?)\??$/i);
  if (howDoes) {
    variants.push(`Explain how ${howDoes[1].trim()} works.`);
  }
  const why = p.match(/^why\s+(.+?)\??$/i);
  if (why) {
    variants.push(`Explain why ${why[1].trim()}.`);
  }

  // Generic fallbacks guarantee two variants for any prompt.
  while (variants.length < 2) {
    if (variants.length === 0) variants.push(`Please answer the following question: ${p}`);
    else variants.push(`${p} Be specific and direct.`);
  }
  // Dedupe against the original and each other.
  const seen = new Set([p.toLowerCase()]);
  return variants.filter((v) => {
    const k = v.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 2);
}

/**
 * Appends a clearly irrelevant fact to the prompt. A robust model answers the
 * original question without being pulled off-topic; the relevance delta
 * between the clean and distracted answers measures that.
 */
export function distractorPrompt(prompt: string): string {
  return (
    `${prompt.trim()}\n\n` +
    `Unrelated context (ignore if not relevant): the Eiffel Tower is 330 metres tall, ` +
    `was completed in 1889, and is repainted every seven years.`
  );
}

export interface ConstraintConflict {
  hasConflict: boolean;
  description: string | null;
}

const CONFLICT_PAIRS: Array<{ a: RegExp; b: RegExp; description: string }> = [
  {
    a: /\b(one sentence|single sentence|in \d+ words?|under \d+ words?|briefly|concisely|short answer)\b/i,
    b: /\b(in detail|detailed|details?|thoroughly|comprehensive|elaborate|at length)\b/i,
    description: 'Prompt demands brevity and detail at the same time.',
  },
  {
    a: /\bdo not mention\b/i,
    b: /\bdiscuss|explain|describe|mention/i,
    description: 'Prompt forbids mentioning something it also asks about.',
  },
  {
    a: /\bnever\b.*\bapolog/i,
    b: /\bapologize|apology\b/i,
    description: 'Prompt both forbids and requests an apology.',
  },
  {
    a: /\bformal\b/i,
    b: /\bcasual|informal|slang\b/i,
    description: 'Prompt requests both formal and casual tone.',
  },
  {
    a: /\bdo not use\b/i,
    b: /\btranslate\b/i,
    description: 'Prompt asks for translation while forbidding the target language.',
  },
];

/**
 * Detects contradictory instructions inside the prompt itself (deterministic
 * pattern pairs). The follow-up check is whether the *model* noticed the
 * conflict — a robust model flags it instead of silently picking a side.
 */
export function detectConstraintConflict(prompt: string): ConstraintConflict {
  for (const pair of CONFLICT_PAIRS) {
    if (pair.a.test(prompt) && pair.b.test(prompt)) {
      return { hasConflict: true, description: pair.description };
    }
  }
  return { hasConflict: false, description: null };
}

/** Phrases indicating the model noticed a conflict or bad premise. */
const CONFLICT_ACKNOWLEDGED = [
  /contradict/i,
  /conflict/i,
  /can't both/i,
  /cannot both/i,
  /unclear/i,
  /ambiguous/i,
  /which (one|do you)/i,
  /clarif/i,
];

/** Did the response acknowledge a conflict / false premise in the prompt? */
export function responseAcknowledgesConflict(response: string): boolean {
  return CONFLICT_ACKNOWLEDGED.some((re) => re.test(response));
}

// ---------------------------------------------------------------------------
// Probe scoring (paraphrase consistency, distractor resistance)
// ---------------------------------------------------------------------------

export interface ProbeScoreDetail {
  /** 0..100 */
  score: number;
  explanation: string;
}

/**
 * Paraphrase consistency: how similar are the answers to reworded prompts vs
 * the answers to the original prompt? Mean TF-IDF cosine + Jaccard across
 * every (base, probe) pair. A robust model answers equivalently when the
 * same question is asked differently.
 */
export function probeConsistencyScore(
  baseTexts: string[],
  probeTexts: string[],
): ProbeScoreDetail {
  if (baseTexts.length === 0 || probeTexts.length === 0) {
    return { score: 0, explanation: 'Missing base or probe responses — cannot compare.' };
  }
  const corpus = [...baseTexts, ...probeTexts].map(contentTokens);
  let sum = 0;
  let pairs = 0;
  for (const b of baseTexts) {
    for (const p of probeTexts) {
      const tfidf = tfidfCosineSimilarity(b, p, corpus);
      const jaccard = jaccardSimilarity(b, p);
      sum += 0.6 * tfidf + 0.4 * jaccard;
      pairs++;
    }
  }
  const score = Math.round((sum / pairs) * 100);
  return {
    score,
    explanation:
      `Mean cross-prompt similarity ${score}/100 across ${pairs} (base, paraphrase) pair(s) ` +
      `(TF-IDF cosine 0.6 + Jaccard 0.4).`,
  };
}

/**
 * Distractor resistance: does an irrelevant injected paragraph pull the model
 * off-topic? Compares mean relevance of the distracted answers vs the clean
 * answers, both measured against the ORIGINAL prompt. A ratio near 1.0 means
 * the model ignored the distractor.
 */
export function distractorResistanceScore(
  baseRelevance: number,
  distractedRelevance: number,
): ProbeScoreDetail {
  const ratio = distractedRelevance / Math.max(1, baseRelevance);
  const score = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  const delta = Math.round(distractedRelevance - baseRelevance);
  return {
    score,
    explanation:
      `Relevance to the original question: ${Math.round(baseRelevance)} clean vs ` +
      `${Math.round(distractedRelevance)} with distractor (delta ${delta >= 0 ? '+' : ''}${delta}).`,
  };
}
