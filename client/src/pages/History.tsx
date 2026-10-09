/**
 * History page: evaluation run history, restyled on the Astryx `table-filter`
 * template — a token-style filter bar, a data table, and a row detail pane.
 *
 * Filter state, fetching, pagination, and action handlers are unchanged from
 * the previous revision; this file is styling/structure only.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as stylex from '@stylexjs/stylex';
// Astryx building blocks, per the table-filter template.
import { HStack, LayoutPanel, StackItem, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button as AstryxButton } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon as AstryxIcon } from '@astryxdesign/core/Icon';
import { Badge as AstryxBadge } from '@astryxdesign/core/Badge';
import { Selector } from '@astryxdesign/core/Selector';
import { ComplexSelector } from '@astryxdesign/core/ComplexSelector';
import { Slider } from '@astryxdesign/core/Slider';
import { Divider } from '@astryxdesign/core/Divider';
import { Section } from '@astryxdesign/core/Section';
import { EmptyState as AstryxEmptyState } from '@astryxdesign/core/EmptyState';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { ResizeHandle, useResizable } from '@astryxdesign/core/Resizable';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import type { TableColumn, TablePlugin } from '@astryxdesign/core/Table';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { colorVars } from '@astryxdesign/core/theme/tokens.stylex';
import { MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
// App pieces: filter state, fetching, and handlers stay as-is.
import {
  deleteEvaluation,
  evaluationReport,
  listEvaluations,
  providersApi,
  rerunEvaluation,
  type EvaluationFilters,
  type EvaluationStatus,
  type EvaluationSummary,
  type Paginated,
} from '../lib/api';
import { DOMAINS, TASK_TYPES } from '../lib/options';
import {
  ConfirmDialog,
  ErrorState,
  Field,
  Input,
  LoadingState,
  ProgressBar,
  SearchInput,
  toast,
} from '../components/ui';
import SampleDataBanner, { hasSampleData } from '../components/SampleDataBanner';
import { formatDate, truncate, useDebouncedValue } from '../lib/utils';

const PAGE_SIZE = 10;
const STATUSES: EvaluationStatus[] = ['completed', 'running', 'failed', 'partial'];

// Compact surface: phones and coarse-pointer tablets get the detail pane as a
// bottom sheet instead of a docked, resizable column.
const COMPACT_SURFACE_QUERY =
  '(max-width: 768px), (max-width: 1024px) and (pointer: coarse) and (hover: none)';

function statusTone(s: EvaluationStatus): 'success' | 'info' | 'error' | 'warning' {
  switch (s) {
    case 'completed':
      return 'success';
    case 'running':
      return 'info';
    case 'failed':
      return 'error';
    case 'partial':
      return 'warning';
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The Astryx Table is typed over Record<string, unknown>; intersecting keeps
 * every EvaluationSummary field typed while satisfying the constraint. The
 * cast at the call site is presentation-only — no data is reshaped.
 */
type HistoryRow = EvaluationSummary & Record<string, unknown>;

const styles = stylex.create({
  // The fill a filter chip switches to once it carries a value — the same
  // overlay the template's set selectors use, so set chips and the active
  // table row land on one value.
  filterFill: {
    backgroundColor: colorVars['--color-overlay-pressed'],
  },
  // The date popover holds two date inputs side by side; without a stated
  // width it would hug the trigger.
  filterPopover: {
    width: 320,
  },
  clickableRow: {
    cursor: 'pointer',
  },
  // One step past hover in the same neutral ramp, marking the row whose
  // details are open.
  activeRow: {
    backgroundColor: colorVars['--color-overlay-pressed'],
    '--table-row-overlay': colorVars['--color-overlay-pressed'],
  },
});

interface ModelOption {
  id: string;
  label: string;
  providerName: string;
}

/**
 * One categorical filter rendered as a token chip: unset, the closed trigger
 * reads as the bare field name; set, it expands to the whole clause
 * ("Status is completed") with a clear beside it.
 */
function FilterSelector({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}) {
  return (
    <Selector
      label={`${label} filter`}
      isLabelHidden
      placeholder={label}
      size="sm"
      hasClear
      options={options}
      value={value === '' ? null : value}
      renderValue={(option) => `${label} is ${option.label ?? option.value}`}
      xstyle={value === '' ? undefined : styles.filterFill}
      onChange={(next) => onChange(next ?? '')}
    />
  );
}

export default function History() {
  const navigate = useNavigate();

  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [providerByModel, setProviderByModel] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    providersApi
      .list()
      .then((providers) => {
        if (cancelled) return;
        const byModel: Record<string, string> = {};
        const options: ModelOption[] = providers.flatMap((p) =>
          p.models.map((m) => {
            byModel[m.id] = m.providerName;
            return { id: m.id, label: `${m.providerName} — ${m.displayName}`, providerName: m.providerName };
          }),
        );
        setProviderByModel(byModel);
        setModelOptions(options);
      })
      .catch(() => {
        // Model filter is a convenience; history still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [domain, setDomain] = useState('');
  const [model, setModel] = useState('');
  const [taskType, setTaskType] = useState('');
  const [status, setStatus] = useState('');
  const [minReliability, setMinReliability] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<Paginated<EvaluationSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<{ id: string; action: 'rerun' | 'report' } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filters = useMemo<EvaluationFilters>(() => {
    const minNum = minReliability === '' ? NaN : Number(minReliability);
    return {
      q: debouncedSearch.trim() || undefined,
      domain: domain || undefined,
      model: model || undefined,
      taskType: taskType || undefined,
      status: status || undefined,
      minReliability:
        Number.isNaN(minNum) ? undefined : Math.max(0, Math.min(100, minNum)),
      from: from || undefined,
      to: to || undefined,
      page,
      pageSize: PAGE_SIZE,
    };
  }, [debouncedSearch, domain, model, taskType, status, minReliability, from, to, page]);

  // Reset to the first page whenever any filter changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, domain, model, taskType, status, minReliability, from, to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listEvaluations(filters)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load evaluations.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, refreshKey]);

  const resetFilters = () => {
    setSearch('');
    setDomain('');
    setModel('');
    setTaskType('');
    setStatus('');
    setMinReliability('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const handleRerun = async (id: string) => {
    setBusy({ id, action: 'rerun' });
    try {
      await rerunEvaluation(id);
      toast('Re-run queued', { tone: 'success' });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to queue re-run.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleReport = async (e: EvaluationSummary) => {
    setBusy({ id: e.id, action: 'report' });
    try {
      await evaluationReport(e.id, `Reliability Report — ${e.domain}`);
      toast('Report generated', { tone: 'success' });
      navigate('/reports');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to generate report.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteEvaluation(deleteId);
      toast('Evaluation deleted', { tone: 'success' });
      setDeleteId(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to delete evaluation.', { tone: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = useMemo(() => (result?.items ?? []) as HistoryRow[], [result]);

  const providersLabel = (e: EvaluationSummary): string =>
    e.models.map((modelId) => providerByModel[modelId] ?? modelId).join(', ');

  const hasFilters =
    search !== '' ||
    domain !== '' ||
    model !== '' ||
    taskType !== '' ||
    status !== '' ||
    minReliability !== '' ||
    from !== '' ||
    to !== '';

  // --- Min-reliability slider --------------------------------------------------
  // Dragging updates a draft; the committed filter waits for onChangeEnd so a
  // server refetch doesn't fire on every pointer move.
  const relNum = Number(minReliability);
  const relCommitted =
    minReliability === '' || Number.isNaN(relNum) ? 0 : Math.max(0, Math.min(100, relNum));
  const [relDraft, setRelDraft] = useState(relCommitted);
  useEffect(() => {
    setRelDraft(relCommitted);
  }, [relCommitted]);
  const commitRel = (v: number) => setMinReliability(v <= 0 ? '' : String(Math.round(v)));

  const dateLabel =
    from === '' && to === ''
      ? undefined
      : from !== '' && to !== ''
        ? `Date ${from} – ${to}`
        : from !== ''
          ? `Date from ${from}`
          : `Date to ${to}`;

  // --- Detail pane ---------------------------------------------------------------
  /** Row whose details are open in the end panel. Independent of pagination. */
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeEvaluation = rows.find((e) => e.id === activeId) ?? null;

  const isCompactSurface = useMediaQuery(COMPACT_SURFACE_QUERY);
  const detailWidth = useResizable({
    defaultSize: 380,
    minSize: 320,
    maxSize: 560,
  });

  const detailBody =
    activeEvaluation == null ? null : (
      <VStack gap={0}>
        <Section
          variant="transparent"
          padding={4}
          paddingBlockStart={isCompactSurface ? 6 : 4}
        >
          <VStack gap={4}>
            <HStack gap={2}>
              <StackItem size="fill">
                <VStack gap={2}>
                  <HStack gap={2} vAlign="center">
                    <AstryxBadge
                      variant={statusTone(activeEvaluation.status)}
                      label={capitalize(activeEvaluation.status)}
                    />
                    <Text type="supporting" color="secondary">
                      {formatDate(activeEvaluation.createdAt)}
                    </Text>
                  </HStack>
                  <Heading level={2}>{truncate(activeEvaluation.prompt, 120)}</Heading>
                </VStack>
              </StackItem>
              <IconButton
                label="Close details"
                variant="ghost"
                size="sm"
                icon={<AstryxIcon icon={XMarkIcon} size="sm" />}
                onClick={() => setActiveId(null)}
              />
            </HStack>

            <VStack gap={2}>
              <AstryxButton
                label="View results"
                variant="primary"
                size="sm"
                width="100%"
                onClick={() => navigate(`/evaluate/${activeEvaluation.id}/results`)}
              />
              <HStack gap={2}>
                <AstryxButton
                  label="Compare"
                  variant="secondary"
                  size="sm"
                  width="100%"
                  onClick={() => navigate(`/compare?eval=${activeEvaluation.id}`)}
                />
                <AstryxButton
                  label="Run again"
                  variant="secondary"
                  size="sm"
                  width="100%"
                  isLoading={busy?.id === activeEvaluation.id && busy.action === 'rerun'}
                  onClick={() => void handleRerun(activeEvaluation.id)}
                />
              </HStack>
              <HStack gap={2}>
                <AstryxButton
                  label="Report"
                  variant="secondary"
                  size="sm"
                  width="100%"
                  isLoading={busy?.id === activeEvaluation.id && busy.action === 'report'}
                  onClick={() => void handleReport(activeEvaluation)}
                />
                <AstryxButton
                  label="Delete"
                  variant="destructive"
                  size="sm"
                  width="100%"
                  onClick={() => setDeleteId(activeEvaluation.id)}
                />
              </HStack>
            </VStack>
          </VStack>
        </Section>

        <Divider />

        <Section variant="transparent" padding={4}>
          <MetadataList columns="single" label={{ position: 'start', width: 104 }}>
            <MetadataListItem label="Prompt">
              <Text type="body">{activeEvaluation.prompt}</Text>
            </MetadataListItem>
            <MetadataListItem label="Domain">
              <Text type="body">{activeEvaluation.domain}</Text>
            </MetadataListItem>
            <MetadataListItem label="Task type">
              <Text type="body">{activeEvaluation.taskType}</Text>
            </MetadataListItem>
            <MetadataListItem label="Models">
              <Text type="body">{providersLabel(activeEvaluation)}</Text>
            </MetadataListItem>
            <MetadataListItem label="Reliability">
              <Text type="body" hasTabularNumbers>
                {activeEvaluation.reliability ?? 'Unavailable'}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Consistency">
              <Text type="body" hasTabularNumbers>
                {activeEvaluation.consistency ?? '—'}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Conflicts">
              <Text type="body" hasTabularNumbers>
                {activeEvaluation.conflicts}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Created">
              <Text type="body">{formatDate(activeEvaluation.createdAt)}</Text>
            </MetadataListItem>
            <MetadataListItem label="Status">
              <AstryxBadge
                variant={statusTone(activeEvaluation.status)}
                label={capitalize(activeEvaluation.status)}
              />
            </MetadataListItem>
          </MetadataList>
        </Section>
      </VStack>
    );

  // With a pointer the details are a resizable column beside the table; on a
  // compact surface the same body opens as a bottom sheet instead.
  const detailPanel =
    activeEvaluation == null || isCompactSurface ? null : (
      <>
        <ResizeHandle
          resizable={detailWidth.props}
          isReversed
          isAlwaysVisible={false}
          label="Resize evaluation details"
        />
        <LayoutPanel
          resizable={detailWidth.props}
          hasDivider
          padding={0}
          label="Evaluation details"
          className="sticky top-[88px] max-h-[calc(100vh-7rem)] shrink-0 overflow-y-auto"
        >
          {detailBody}
        </LayoutPanel>
      </>
    );

  const detailSheet = (
    <BottomSheet
      isOpen={isCompactSurface && activeEvaluation != null}
      onOpenChange={(open) => {
        if (!open) setActiveId(null);
      }}
      label="Evaluation details"
      height="tall"
    >
      {detailBody}
    </BottomSheet>
  );

  // --- Table -----------------------------------------------------------------------
  const columns = useMemo<TableColumn<HistoryRow>[]>(
    () => [
      {
        key: 'prompt',
        header: 'Prompt',
        width: proportional(2, { minWidth: 240 }),
        renderCell: (e) => (
          <Link
            to={`/evaluate/${e.id}/results`}
            className="font-medium text-brand-700 hover:underline dark:text-brand-400"
            title={e.prompt}
          >
            {truncate(e.prompt, 90)}
          </Link>
        ),
      },
      {
        key: 'models',
        header: 'Models',
        width: proportional(1, { minWidth: 180 }),
        renderCell: (e) => {
          const label = providersLabel(e);
          return (
            <span title={label} className="block max-w-[180px] truncate">
              {label}
            </span>
          );
        },
      },
      {
        key: 'reliability',
        header: 'Reliability',
        width: pixel(170),
        align: 'center',
        renderCell: (e) => (
          <div className="flex min-w-[140px] items-center justify-center gap-2">
            {e.reliability != null ? (
              <>
                <ProgressBar value={e.reliability} className="w-20" />
                <span className="whitespace-nowrap font-medium tabular-nums">{e.reliability}</span>
              </>
            ) : (
              <span className="text-sm italic text-stone-400 dark:text-stone-500">Unavailable</span>
            )}
          </div>
        ),
      },
      {
        key: 'consistency',
        header: 'Consistency',
        width: pixel(110),
        align: 'center',
        renderCell: (e) => <span className="font-medium tabular-nums">{e.consistency}</span>,
      },
      {
        key: 'conflicts',
        header: 'Conflicts',
        width: pixel(110),
        align: 'center',
        renderCell: (e) => (
          <AstryxBadge variant={e.conflicts > 0 ? 'warning' : 'neutral'} label={String(e.conflicts)} />
        ),
      },
      {
        key: 'createdAt',
        header: 'Date',
        width: pixel(140),
        renderCell: (e) => <span className="whitespace-nowrap">{formatDate(e.createdAt)}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        width: pixel(130),
        renderCell: (e) => (
          <AstryxBadge variant={statusTone(e.status)} label={capitalize(e.status)} />
        ),
      },
    ],
    [providerByModel],
  );

  /**
   * Opens the detail pane for the clicked row. There is no first-class row
   * activation plugin, so this reaches the `<tr>` through transformBodyRow.
   * Cell links and buttons own their own clicks and never open the pane.
   */
  const rowActivationPlugin = useMemo<TablePlugin<HistoryRow>>(
    () => ({
      transformBodyRow: (props, item) => {
        const isActive = item.id === activeId;
        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            tabIndex: 0,
            'aria-current': isActive ? true : undefined,
            onClick: (event) => {
              if (
                (event.target as HTMLElement).closest('input, button, a, select, textarea') != null
              ) {
                return;
              }
              setActiveId(item.id);
            },
            onKeyDown: (event) => {
              // Only when the row itself has focus, so a control inside the
              // row keeps its own keys.
              if (event.target !== event.currentTarget) {
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setActiveId(item.id);
              }
            },
          },
          xstyle: isActive
            ? [...props.xstyle, styles.clickableRow, styles.activeRow]
            : [...props.xstyle, styles.clickableRow],
        };
      },
    }),
    [activeId],
  );

  const plugins = useMemo<Record<string, TablePlugin<HistoryRow>>>(
    () => ({ rowActivation: rowActivationPlugin }),
    [rowActivationPlugin],
  );

  return (
    <div data-astryx-theme="stone" data-astryx-media="dark">
      <VStack gap={4}>
        <HStack gap={3} vAlign="center">
          <StackItem size="fill">
            <VStack gap={1}>
              <Heading level={1}>History</Heading>
              <Text type="supporting" color="secondary">
                Browse, filter, and manage every evaluation.
              </Text>
            </VStack>
          </StackItem>
          <AstryxButton
            label="New evaluation"
            variant="primary"
            icon={<AstryxIcon icon={PlusIcon} size="sm" />}
            onClick={() => navigate('/evaluate/models')}
          />
        </HStack>

        {result && hasSampleData(result.items) && <SampleDataBanner />}

        <HStack gap={2} vAlign="center" wrap="wrap">
          <div style={{ width: 240 }}>
            <SearchInput
              id="history-search"
              aria-label="Search prompts"
              placeholder="Search prompts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch('')}
            />
          </div>
          <FilterSelector
            label="Domain"
            value={domain}
            onChange={setDomain}
            options={DOMAINS.map((d) => ({ value: d, label: d }))}
          />
          <FilterSelector
            label="Model"
            value={model}
            onChange={setModel}
            options={modelOptions.map((m) => ({ value: m.id, label: m.label }))}
          />
          <FilterSelector
            label="Task type"
            value={taskType}
            onChange={setTaskType}
            options={TASK_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <FilterSelector
            label="Status"
            value={status}
            onChange={setStatus}
            options={STATUSES.map((s) => ({ value: s, label: capitalize(s) }))}
          />
          <ComplexSelector<number>
            label="Minimum reliability filter"
            isLabelHidden
            placeholder="Min reliability"
            triggerLabel={
              minReliability === '' ? undefined : `Min reliability ≥ ${relCommitted}`
            }
            size="sm"
            value={relDraft}
            onChange={commitRel}
            contentXstyle={styles.filterPopover}
            xstyle={minReliability === '' ? undefined : styles.filterFill}
          >
            {(draft, commit, close) => (
              <VStack gap={4}>
                <VStack gap={0}>
                  <Text type="label">Minimum reliability</Text>
                  <Text type="large" hasTabularNumbers>
                    {draft}%
                  </Text>
                </VStack>
                <VStack gap={1}>
                  <Slider
                    label="Minimum reliability"
                    isLabelHidden
                    value={draft}
                    min={0}
                    max={100}
                    step={1}
                    valueDisplay="none"
                    width="100%"
                    onChange={setRelDraft}
                    onChangeEnd={commit}
                  />
                  <HStack hAlign="between" vAlign="center">
                    <Text type="supporting" color="secondary">
                      0
                    </Text>
                    <Text type="supporting" color="secondary">
                      100
                    </Text>
                  </HStack>
                </VStack>
                <Divider />
                <HStack gap={2} hAlign="between" vAlign="center">
                  <AstryxButton
                    label="Clear"
                    variant="ghost"
                    size="sm"
                    isDisabled={minReliability === ''}
                    onClick={() => commit(0)}
                  />
                  <AstryxButton label="Done" variant="secondary" size="sm" onClick={close} />
                </HStack>
              </VStack>
            )}
          </ComplexSelector>
          <ComplexSelector<{ from: string; to: string }>
            label="Date range filter"
            isLabelHidden
            placeholder="Date"
            triggerLabel={dateLabel}
            size="sm"
            value={{ from, to }}
            onChange={(next) => {
              setFrom(next.from);
              setTo(next.to);
            }}
            contentXstyle={styles.filterPopover}
            xstyle={from === '' && to === '' ? undefined : styles.filterFill}
          >
            {(range, setRange, close) => (
              <VStack gap={4}>
                <Text type="label">Date range</Text>
                <HStack gap={3}>
                  <StackItem size="fill">
                    <Field label="From" htmlFor="history-from">
                      <Input
                        id="history-from"
                        type="date"
                        value={range.from}
                        onChange={(e) => setRange({ ...range, from: e.target.value })}
                      />
                    </Field>
                  </StackItem>
                  <StackItem size="fill">
                    <Field label="To" htmlFor="history-to">
                      <Input
                        id="history-to"
                        type="date"
                        value={range.to}
                        onChange={(e) => setRange({ ...range, to: e.target.value })}
                      />
                    </Field>
                  </StackItem>
                </HStack>
                <Divider />
                <HStack gap={2} hAlign="between" vAlign="center">
                  <AstryxButton
                    label="Clear"
                    variant="ghost"
                    size="sm"
                    isDisabled={from === '' && to === ''}
                    onClick={() => setRange({ from: '', to: '' })}
                  />
                  <AstryxButton label="Done" variant="secondary" size="sm" onClick={close} />
                </HStack>
              </VStack>
            )}
          </ComplexSelector>

          <StackItem size="fill">
            <HStack gap={2} vAlign="center" hAlign="end">
              <span aria-live="polite">
                <Text type="supporting" color="secondary">
                  {loading
                    ? 'Loading evaluations…'
                    : `${result?.items.length ?? 0} of ${total} evaluations`}
                </Text>
              </span>
              {hasFilters && (
                <AstryxButton
                  label="Clear all"
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                />
              )}
            </HStack>
          </StackItem>
        </HStack>
      </VStack>

      <div className="my-4">
        <Divider />
      </div>

      <div>
        {loading && <LoadingState label="Loading evaluations…" rows={4} />}
        {!loading && error && (
          <ErrorState message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
        )}
        {!loading && !error && result && result.items.length === 0 && (
          <AstryxEmptyState
            icon={<AstryxIcon icon={MagnifyingGlassIcon} size="lg" />}
            title="No evaluations found"
            description="Try adjusting filters, or run your first evaluation."
            actions={
              <AstryxButton
                label="New evaluation"
                variant="primary"
                onClick={() => navigate('/evaluate/models')}
              />
            }
          />
        )}
        {!loading && !error && result && result.items.length > 0 && (
          <HStack gap={0} vAlign="start">
            <StackItem size="fill">
              <VStack gap={4}>
                <div className="overflow-x-auto">
                  <Table<HistoryRow>
                    aria-label="Evaluation history"
                    data={rows}
                    columns={columns}
                    idKey="id"
                    dividers="rows"
                    hasHover
                    verticalAlign="top"
                    plugins={plugins}
                    rowCount={total}
                  />
                </div>
                <nav aria-label="Pagination">
                  <HStack hAlign="between" vAlign="center">
                    <AstryxButton
                      label="Previous"
                      variant="secondary"
                      size="sm"
                      isDisabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    />
                    <Text type="supporting" color="secondary">
                      Page {page} of {totalPages}
                    </Text>
                    <AstryxButton
                      label="Next"
                      variant="secondary"
                      size="sm"
                      isDisabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    />
                  </HStack>
                </nav>
              </VStack>
            </StackItem>
            {detailPanel}
          </HStack>
        )}
      </div>

      {detailSheet}

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete evaluation"
        description="This will permanently delete this evaluation and its results. This action cannot be undone."
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
