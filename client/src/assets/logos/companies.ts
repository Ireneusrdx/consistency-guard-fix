/**
 * Company metadata for the model browser: display names + official logos.
 * Logos are bundled locally (no hotlinking). Companies without a bundled
 * logo fall back to a monogram badge rendered by the UI.
 */
import openaiLogo from './openai.svg';
import anthropicLogo from './anthropic.svg';
import googleLogo from './google.svg';
import metaLogo from './meta.svg';
import mistralaiLogo from './mistralai.svg';
import xaiLogo from './x-ai.svg';
import deepseekLogo from './deepseek.svg';
import qwenLogo from './qwen.svg';
import minimaxLogo from './minimax.svg';
import microsoftLogo from './microsoft.svg';
import amazonLogo from './amazon.svg';
import nvidiaLogo from './nvidia.svg';
import perplexityLogo from './perplexity.svg';

export interface CompanyMeta {
  /** Display name, e.g. "OpenAI". */
  name: string;
  /** Bundled logo URL, if we have the official mark. */
  logo?: string;
}

/**
 * Model-id prefix (namespace before the first "/") -> company.
 * Covers every company in the Pollinations registry; unknown prefixes fall
 * back to a title-cased name with a monogram badge.
 */
const COMPANIES: Record<string, CompanyMeta> = {
  openai: { name: 'OpenAI', logo: openaiLogo },
  anthropic: { name: 'Anthropic', logo: anthropicLogo },
  google: { name: 'Google', logo: googleLogo },
  meta: { name: 'Meta', logo: metaLogo },
  mistralai: { name: 'Mistral AI', logo: mistralaiLogo },
  'x-ai': { name: 'xAI', logo: xaiLogo },
  deepseek: { name: 'DeepSeek', logo: deepseekLogo },
  qwen: { name: 'Qwen', logo: qwenLogo },
  'tongyi-mai': { name: 'Tongyi' },
  moonshotai: { name: 'Moonshot AI' },
  minimax: { name: 'MiniMax', logo: minimaxLogo },
  'z-ai': { name: 'Zhipu AI' },
  microsoft: { name: 'Microsoft', logo: microsoftLogo },
  amazon: { name: 'Amazon', logo: amazonLogo },
  cohere: { name: 'Cohere' },
  nvidia: { name: 'NVIDIA', logo: nvidiaLogo },
  'black-forest-labs': { name: 'Black Forest Labs' },
  assemblyai: { name: 'AssemblyAI' },
  inclusionai: { name: 'Inclusion AI' },
  stepfun: { name: 'StepFun' },
  perplexity: { name: 'Perplexity', logo: perplexityLogo },
  pollinations: { name: 'Pollinations' },
  alibaba: { name: 'Alibaba' },
  bytedance: { name: 'ByteDance' },
  tencent: { name: 'Tencent' },
  meituan: { name: 'Meituan' },
  liquid: { name: 'Liquid AI' },
  'nex-agi': { name: 'Nex AGI' },
  poolside: { name: 'Poolside' },
  thinkingmachines: { name: 'Thinking Machines' },
  elevenlabs: { name: 'ElevenLabs' },
  'stability-ai': { name: 'Stability AI' },
  krea: { name: 'Krea' },
  ideogram: { name: 'Ideogram' },
  'ideogram-ai': { name: 'Ideogram' },
  recraft: { name: 'Recraft' },
  pruna: { name: 'Pruna' },
  prunaai: { name: 'Pruna' },
  heygen: { name: 'HeyGen' },
  sesame: { name: 'Sesame' },
  'fish-audio': { name: 'Fish Audio' },
  hexgrad: { name: 'Hexgrad' },
  jaredpalmer: { name: 'Jared Palmer' },
  lykon: { name: 'Lykon' },
  respan: { name: 'Respan' },
  typesafe: { name: 'TypeSafe' },
  community: { name: 'Community' },
};

function titleCasePrefix(prefix: string): string {
  return prefix
    .split(/[-_]/)
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' ');
}

/** Resolve company metadata for a model-id prefix; never returns undefined. */
export function getCompany(prefix: string): CompanyMeta {
  return COMPANIES[prefix] ?? { name: titleCasePrefix(prefix) };
}

/**
 * Sort weight for company sections: major labs first (alphabetical), then
 * everyone else alphabetically, "Community" always last.
 */
const FEATURED = [
  'openai',
  'anthropic',
  'google',
  'x-ai',
  'meta',
  'mistralai',
  'deepseek',
  'qwen',
  'microsoft',
  'nvidia',
  'amazon',
];

export function compareCompanies(a: string, b: string): number {
  if (a === 'community') return 1;
  if (b === 'community') return -1;
  const ai = FEATURED.indexOf(a);
  const bi = FEATURED.indexOf(b);
  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }
  return getCompany(a).name.localeCompare(getCompany(b).name);
}
