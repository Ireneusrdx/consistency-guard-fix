/**
 * Model selection: pick which models to compare in the next evaluation.
 *
 * Models are grouped by AI company (official logos, premium browser feel)
 * and can be narrowed with the tier filter (free / paid Pollen), the
 * modality filter (text / image / video / audio) and search.
 * Only text models can be selected — evaluations send chat prompts.
 * Selection persists to localStorage.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  SearchInput,
  Dropdown,
  Badge,
  LoadingState,
  EmptyState,
  ErrorState,
  PageHeader,
  Icon,
} from '../components/ui';
import { providersApi, toApiError } from '../lib/api';
import { cn } from '../lib/utils';
import { getCompany, compareCompanies } from '../assets/logos/companies';

const STORAGE_KEY = 'cg_selected_models';

type TierFilter = 'all' | 'free' | 'paid';
type ModalityFilter = 'all' | 'text' | 'image' | 'video' | 'audio';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  providerId: string;
  /** Registry category: text | image | video | audio | ... */
  category: string;
  /** Company namespace from the model id, e.g. "openai". */
  company: string;
  /** True when the model needs purchased Pollen (not free grants). */
  paidOnly: boolean;
}

function readStoredSelection(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function loadModels(): Promise<ModelOption[]> {
  const providers = (await providersApi.list()).filter((p) => p.id === 'pollinations');
  return providers.flatMap((p) =>
    p.models.map((m) => ({
      id: m.id,
      name: m.displayName,
      provider: m.providerName,
      providerId: m.providerId,
      category: m.category ?? 'text',
      company: m.company ?? 'community',
      // Unknown tier is treated as paid — safer than promising "free".
      paidOnly: m.paidOnly ?? true,
    })),
  );
}

const MODALITY_LABELS: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  '3d': '3D',
  realtime: 'Realtime',
  embedding: 'Embedding',
};

function modalityLabel(category: string): string {
  return MODALITY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

// ------------------------------------------------------------------ marks --
function CompanyMark({ prefix, size = 'md' }: { prefix: string; size?: 'sm' | 'md' | 'lg' }) {
  const meta = getCompany(prefix);
  const dims =
    size === 'lg' ? 'h-10 w-10 rounded-xl' : size === 'sm' ? 'h-7 w-7 rounded-lg' : 'h-9 w-9 rounded-xl';
  const img = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center bg-white/[0.06] ring-1 ring-white/10',
        dims,
      )}
    >
      {meta.logo ? (
        <img src={meta.logo} alt="" className={cn('company-logo', img)} draggable={false} />
      ) : (
        <span className="font-bold text-stone-200">{meta.name.charAt(0)}</span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------- card --
function ModelCard({
  model,
  selected,
  onToggle,
}: {
  model: ModelOption;
  selected: boolean;
  onToggle: () => void;
}) {
  const evaluable = model.category === 'text';
  const free = !model.paidOnly;

  return (
    <div
      role="checkbox"
      aria-checked={selected}
      aria-disabled={!evaluable}
      tabIndex={evaluable ? 0 : -1}
      onClick={() => evaluable && onToggle()}
      onKeyDown={(e) => {
        if (!evaluable) return;
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        'rounded-xl border bg-white p-5 shadow-card outline-none transition-colors dark:bg-stone-900',
        evaluable
          ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400'
          : 'cursor-not-allowed opacity-60',
        selected
          ? 'border-[#25252a] ring-1 ring-[#25252a] dark:border-stone-400 dark:ring-stone-400'
          : 'border-[#e2e2e8] dark:border-stone-800',
        evaluable && !selected && 'hover:border-[#83838a] dark:hover:border-stone-700',
      )}
    >
      <div className="flex items-start gap-3">
        <CompanyMark prefix={model.company} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-stone-900 dark:text-white">{model.name}</p>
          <p className="mt-0.5 truncate text-sm text-stone-500 dark:text-stone-400">
            {getCompany(model.company).name}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
              selected
                ? 'border-[#25252a] bg-[#25252a] text-white dark:border-stone-400 dark:bg-stone-400'
                : 'border-[#83838a] text-transparent dark:border-stone-600',
            )}
          >
            <Icon name="check" className="h-4 w-4" />
          </span>
          <Badge tone={free ? 'success' : 'warning'}>{free ? 'FREE' : 'PAID'}</Badge>
        </div>
      </div>
      <p className="mt-3 truncate font-mono text-xs text-stone-400 dark:text-stone-500">{model.id}</p>
      {!evaluable && (
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-500">
          {modalityLabel(model.category)} model — evaluations run on text models
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- page --
export default function ModelSelection() {
  const navigate = useNavigate();

  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedIds, setSelectedIds] = useState<string[]>(() => readStoredSelection());
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [modalityFilter, setModalityFilter] = useState<ModalityFilter>('all');
  const [continueError, setContinueError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadModels().then(
      (list) => {
        if (!cancelled) setModels(list);
      },
      (e) => {
        if (!cancelled) setLoadError(toApiError(e).message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const tierCounts = useMemo(() => {
    const list = models ?? [];
    return {
      free: list.filter((m) => !m.paidOnly).length,
      paid: list.filter((m) => m.paidOnly).length,
    };
  }, [models]);

  const modalityOptions = useMemo(() => {
    const cats = new Map<string, number>();
    for (const m of models ?? []) cats.set(m.category, (cats.get(m.category) ?? 0) + 1);
    const order = ['text', 'image', 'video', 'audio', '3d', 'realtime', 'embedding'];
    const sorted = [...cats.keys()].sort(
      (a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)),
    );
    return sorted.map((c) => ({ value: c, label: `${modalityLabel(c)} (${cats.get(c)})` }));
  }, [models]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (models ?? []).filter((m) => {
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        getCompany(m.company).name.toLowerCase().includes(q);
      const matchesTier =
        tierFilter === 'all' || (tierFilter === 'free' ? !m.paidOnly : m.paidOnly);
      const matchesModality = modalityFilter === 'all' || m.category === modalityFilter;
      return matchesSearch && matchesTier && matchesModality;
    });
  }, [models, search, tierFilter, modalityFilter]);

  const groups = useMemo(() => {
    const byCompany = new Map<string, ModelOption[]>();
    for (const m of filtered) {
      const list = byCompany.get(m.company) ?? [];
      list.push(m);
      byCompany.set(m.company, list);
    }
    return [...byCompany.entries()]
      .sort(([a], [b]) => compareCompanies(a, b))
      .map(([company, list]) => ({
        company,
        meta: getCompany(company),
        models: list.sort((x, y) => x.name.localeCompare(y.name)),
      }));
  }, [filtered]);

  const evaluableFiltered = useMemo(() => filtered.filter((m) => m.category === 'text'), [filtered]);

  const toggle = (id: string) => {
    setContinueError(null);
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => {
    setContinueError(null);
    setSelectedIds(evaluableFiltered.map((m) => m.id));
  };

  const clear = () => {
    setSelectedIds([]);
  };

  const clearFilters = () => {
    setSearch('');
    setTierFilter('all');
    setModalityFilter('all');
  };

  const goContinue = () => {
    if (selectedIds.length === 0) {
      setContinueError('Select at least one model to continue');
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
    navigate('/evaluate/question');
  };

  const hasFilters = search.trim() !== '' || tierFilter !== 'all' || modalityFilter !== 'all';
  const companyCount = groups.length;

  return (
    <div className="pb-32">
      <PageHeader
        title="Choose Models"
        description="Pick the models to compare. The same question will be sent to each selected model."
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="model-search" className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-200">
            Search models
          </label>
          <SearchInput
            id="model-search"
            placeholder="Search by name, company or id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
          />
        </div>
        <div className="min-w-[170px]">
          <Dropdown
            id="tier-filter"
            label="Tier"
            value={tierFilter}
            onChange={(v) => setTierFilter(v as TierFilter)}
            options={[
              { value: 'all', label: `All tiers (${(models ?? []).length})` },
              { value: 'free', label: `Free (${tierCounts.free})` },
              { value: 'paid', label: `Paid (${tierCounts.paid})` },
            ]}
          />
        </div>
        <div className="min-w-[170px]">
          <Dropdown
            id="modality-filter"
            label="Modality"
            value={modalityFilter}
            onChange={(v) => setModalityFilter(v as ModalityFilter)}
            options={[{ value: 'all', label: `All modalities (${(models ?? []).length})` }, ...modalityOptions]}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={selectAll} disabled={evaluableFiltered.length === 0}>
            Select all
          </Button>
          <Button variant="ghost" onClick={clear} disabled={selectedIds.length === 0}>
            Clear
          </Button>
        </div>
      </div>

      {models === null && !loadError && <LoadingState label="Loading models…" />}
      {loadError && <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />}
      {models !== null && !loadError && filtered.length === 0 && (
        <EmptyState
          icon="search"
          title="No models found"
          description={
            hasFilters
              ? 'No models match your filters. Try clearing them.'
              : 'No models are available. Connect Pollinations first.'
          }
          action={
            hasFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
                Connect Pollinations
              </Button>
            )
          }
        />
      )}
      {models !== null && !loadError && filtered.length > 0 && (
        <>
          <p className="mb-6 text-sm text-stone-500 dark:text-stone-400" aria-live="polite">
            {filtered.length} model{filtered.length === 1 ? '' : 's'} · {companyCount} compan
            {companyCount === 1 ? 'y' : 'ies'}
            {tierFilter !== 'all' && (
              <> · {tierFilter === 'free' ? 'free tier' : 'paid tier'}</>
            )}
          </p>
          <div className="space-y-10">
            {groups.map(({ company, meta, models: list }) => (
              <section key={company} aria-label={meta.name}>
                <div className="mb-4 flex items-center gap-3">
                  <CompanyMark prefix={company} size="lg" />
                  <div>
                    <h2 className="text-lg font-bold text-stone-900 dark:text-white">{meta.name}</h2>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {list.length} model{list.length === 1 ? '' : 's'}
                      {(() => {
                        const f = list.filter((m) => !m.paidOnly).length;
                        const p = list.length - f;
                        if (f > 0 && p > 0) return ` · ${f} free · ${p} paid`;
                        return f > 0 ? ' · all free' : ' · all paid';
                      })()}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((model) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      selected={selectedIds.includes(model.id)}
                      onToggle={() => toggle(model.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {/* Selection bar — fixed functional layer. On desktop it starts after the
          sidebar (lg:left-64) so the side nav never covers it; on mobile it
          floats above the bottom nav (which is ~3.5rem + safe-area tall).
          Translucent material + edge fade per the design system, no hard divider. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-[#e2e2e8] bg-white dark:border-stone-800 dark:bg-stone-900 lg:bottom-0 lg:left-64">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-medium text-stone-900 dark:text-stone-100" aria-live="polite">
              {selectedIds.length} model{selectedIds.length === 1 ? '' : 's'} selected
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400">2+ models recommended for comparison</p>
            {continueError && (
              <p role="alert" className="mt-1 text-xs font-medium text-[#58413e] dark:text-red-400">
                {continueError}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={goContinue}>Continue to Question</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
