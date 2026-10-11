import { ModelMetadata } from './types';
import { OpenAICompatibleAdapter } from './openai';
import { POLLINATIONS_FALLBACK_MODELS } from './registry';
import { isPaidOnlyModel } from './pollinationsTiers';

/**
 * Pollinations provider — a free multi-model gateway.
 *
 * One API key (free at https://enter.pollinations.ai, no credit card)
 * unlocks 40+ text models from OpenAI, Anthropic, Google, DeepSeek, Qwen,
 * xAI and others through a single OpenAI-compatible endpoint.
 *
 * The model catalog is fetched live from the Pollinations registry and
 * cached for 6 hours, so new models appear without code changes. A curated
 * static fallback keeps the provider working when the registry is
 * unreachable.
 *
 * Pricing is denominated in Pollen credits. Per-token Pollen prices are read
 * live from https://gen.pollinations.ai/text/models (same 6h cache) and
 * converted to USD at the $2-pack rate ($2 = 2.5 Pollen → $0.80/pollen).
 * Models with no listed price are free-tier and cost 0. Prices change over
 * time — the UI labels all figures as approximate.
 */

export const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai';
const MODELS_URL = `${POLLINATIONS_BASE_URL}/v1/models`;
const PRICING_URL = `${POLLINATIONS_BASE_URL}/text/models`;
/**
 * OpenAI-compatible chat endpoint. Note: this is intentionally different
 * from the legacy text.pollinations.ai host — the full registry model keys
 * (e.g. "openai/gpt-5.4-nano") are only served by the v1 API on
 * gen.pollinations.ai, which requires the user's API key.
 */
export const POLLINATIONS_CHAT_BASE_URL = 'https://gen.pollinations.ai/v1';
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

export interface PollinationsTextModel {
  /** API model id, e.g. "openai/gpt-5.4-nano" (aliases also accepted). */
  modelKey: string;
  displayName: string;
  contextLength?: number;
  speed: 'fast' | 'medium' | 'slow';
  /** Registry category: text | image | video | audio | ... */
  category: string;
  /** Company namespace from the model id prefix, e.g. "openai". */
  company: string;
  /** True when the model needs purchased Pollen (not free grants). */
  paidOnly: boolean;
}

/** "openai/gpt-5.4-nano" -> "openai"; ids without a slash -> "community". */
export function companyOfModelId(modelKey: string): string {
  const slash = modelKey.indexOf('/');
  return slash > 0 ? modelKey.slice(0, slash) : 'community';
}

let liveCache: { fetchedAt: number; models: PollinationsTextModel[] } | null = null;

/**
 * Live model catalog from the Pollinations registry (all categories).
 * Cached for 6h; falls back to the curated static list on any failure.
 */
export async function getPollinationsModels(): Promise<PollinationsTextModel[]> {
  if (liveCache && Date.now() - liveCache.fetchedAt < CATALOG_TTL_MS) {
    return liveCache.models;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(MODELS_URL, { signal: controller.signal });
      if (!res.ok) throw new Error(`registry responded HTTP ${res.status}`);
      const json: any = await res.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      const models: PollinationsTextModel[] = [];
      for (const m of data) {
        const id = typeof m.id === 'string' && m.id ? m.id : null;
        if (!id) continue;
        models.push({
          modelKey: id,
          displayName: typeof m.title === 'string' && m.title ? m.title : id,
          contextLength: typeof m.context_length === 'number' ? m.context_length : undefined,
          speed: 'medium',
          category: typeof m.category === 'string' && m.category ? m.category : 'text',
          company: companyOfModelId(id),
          paidOnly: isPaidOnlyModel(id),
        });
      }
      if (models.length === 0) throw new Error('registry returned no models');
      liveCache = { fetchedAt: Date.now(), models };
      return models;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return liveCache?.models ?? POLLINATIONS_FALLBACK_MODELS;
  }
}

/**
 * Live text-model catalog (evaluations only run text models).
 * Kept for the evaluation runner; the model browser uses getPollinationsModels().
 */
export async function getPollinationsTextModels(): Promise<PollinationsTextModel[]> {
  return (await getPollinationsModels()).filter((m) => m.category === 'text');
}

/** True for curated ids and any id seen in the live catalog cache. */
export function isPollinationsModelKey(modelKey: string): boolean {
  if (POLLINATIONS_FALLBACK_MODELS.some((m) => m.modelKey === modelKey)) return true;
  return liveCache?.models.some((m) => m.modelKey === modelKey) ?? false;
}

// ---------------------------------------------------------------------------
// Live per-token pricing (Pollen), from https://gen.pollinations.ai/text/models
// ---------------------------------------------------------------------------

/** Per-token prices in Pollen credits, as published by Pollinations. */
export interface PollenPricing {
  promptPerToken: number;
  completionPerToken: number;
}

/**
 * Pollen → USD conversion. $2 buys 2.5 Pollen = $0.80/pollen — the smallest
 * pack and the rate matching a typical first purchase. Larger packs are
 * cheaper per Pollen (down to $0.50 at $100), so this errs on the side of a
 * slightly conservative (higher) estimate. Documented, not fabricated.
 */
export const POLLEN_USD_RATE = 0.8;

const PRICING_TTL_MS = 6 * 60 * 60 * 1000;
let pricingCache: { fetchedAt: number; byModel: Map<string, PollenPricing> } | null = null;

/**
 * Ensures the live pricing cache is warm. No-op when the cache is fresh;
 * never throws — on failure the previous cache (if any) is kept and cost
 * estimates fall back to 0 rather than fabricated numbers.
 */
export async function ensurePollinationsPricing(): Promise<void> {
  if (pricingCache && Date.now() - pricingCache.fetchedAt < PRICING_TTL_MS) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(PRICING_URL, { signal: controller.signal });
      if (!res.ok) throw new Error(`pricing responded HTTP ${res.status}`);
      const json: unknown = await res.json();
      const list = Array.isArray(json) ? json : [];
      const byModel = new Map<string, PollenPricing>();
      for (const m of list) {
        const rec = m as Record<string, unknown>;
        const name = typeof rec.name === 'string' ? rec.name : null;
        const pricing = rec.pricing as Record<string, unknown> | undefined;
        if (!name || !pricing || pricing.currency !== 'pollen') continue;
        const prompt = parseFloat(String(pricing.promptTextTokens ?? ''));
        const completion = parseFloat(String(pricing.completionTextTokens ?? ''));
        // Models with no parseable price are free-tier — skipped (cost 0).
        if (!Number.isFinite(prompt) || !Number.isFinite(completion)) continue;
        const entry: PollenPricing = { promptPerToken: prompt, completionPerToken: completion };
        byModel.set(name, entry);
        // Aliases (e.g. "openai" → "openai/gpt-5.4-nano") share the same price.
        const aliases = Array.isArray(rec.aliases) ? rec.aliases : [];
        for (const a of aliases) {
          if (typeof a === 'string' && a && !byModel.has(a)) byModel.set(a, entry);
        }
      }
      if (byModel.size === 0) throw new Error('pricing returned no priced models');
      pricingCache = { fetchedAt: Date.now(), byModel };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Keep stale cache if present; otherwise pricing stays unavailable.
  }
}

/**
 * Pollen cost for one completed call. Returns null when the model has no
 * listed price (free-tier) or the pricing cache hasn't loaded — callers turn
 * that into 0, never into a guess.
 */
export function pollenCostFor(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = pricingCache?.byModel.get(model);
  if (!p) return null;
  return inputTokens * p.promptPerToken + outputTokens * p.completionPerToken;
}

/** Live per-1k-token USD prices for a model, or undefined when unpriced. */
export function usdCostPer1k(model: string): { input: number; output: number } | undefined {
  const p = pricingCache?.byModel.get(model);
  if (!p) return undefined;
  return {
    input: p.promptPerToken * 1000 * POLLEN_USD_RATE,
    output: p.completionPerToken * 1000 * POLLEN_USD_RATE,
  };
}

export class PollinationsAdapter extends OpenAICompatibleAdapter {
  readonly id = 'pollinations';
  readonly displayName = 'Pollinations';
  protected baseUrl = POLLINATIONS_CHAT_BASE_URL;

  /**
   * Real cost estimate in USD, from live Pollinations per-token Pollen prices
   * (converted at $0.80/pollen). Free-tier / unpriced models return 0.
   * Returns 0 — never a guess — when the pricing cache hasn't loaded.
   */
  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pollen = pollenCostFor(model, inputTokens, outputTokens);
    if (pollen === null) return 0;
    return pollen * POLLEN_USD_RATE;
  }

  getModelMetadata(model: string): ModelMetadata {
    const base = super.getModelMetadata(model);
    const known =
      liveCache?.models.find((m) => m.modelKey === model) ??
      POLLINATIONS_FALLBACK_MODELS.find((m) => m.modelKey === model);
    const liveCost = usdCostPer1k(model);
    return {
      ...base,
      providerId: this.id,
      displayName: known?.displayName ?? base.displayName,
      contextLength: known?.contextLength ?? base.contextLength,
      costPer1kInputUsd: liveCost?.input,
      costPer1kOutputUsd: liveCost?.output,
      speed: known?.speed ?? base.speed,
    };
  }
}
