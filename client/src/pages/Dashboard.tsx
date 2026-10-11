/**
 * Dashboard — reliability analytics across all evaluations.
 * Restyled on the Astryx `dashboard-comparison` template: filter bar + metric
 * tiles with sparklines + period deltas + breakdown sections.
 *
 * All data hooks, fetches, handlers, and routes are unchanged from the
 * previous revision; this file is styling/structure only. All figures come
 * from getDashboard(); nothing is invented — where the API returns nothing
 * the existing Unavailable/empty-state conventions are used.
 */
import { useEffect, useId, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as stylex from '@stylexjs/stylex';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
// Astryx building blocks, per the dashboard-comparison template.
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Grid } from '@astryxdesign/core/Grid';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { Divider } from '@astryxdesign/core/Divider';
import { Badge } from '@astryxdesign/core/Badge';
import type { BadgeVariant } from '@astryxdesign/core/Badge';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Selector } from '@astryxdesign/core/Selector';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Table, proportional, pixel } from '@astryxdesign/core/Table';
import type { TableColumn } from '@astryxdesign/core/Table';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  PlusIcon,
  ChartBarIcon,
  PresentationChartLineIcon,
  TableCellsIcon,
  ClockIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import { StopIcon } from '@heroicons/react/24/solid';
import {
  getDashboard,
  type DashboardData,
  type EvaluationStatus,
  type EvaluationSummary,
} from '../lib/api';
import SampleDataBanner, { hasSampleData } from '../components/SampleDataBanner';
import {
  ChartTooltip,
  ErrorState,
  LoadingState,
  PageHeader,
  Reveal,
} from '../components/ui';
import { cn } from '../lib/utils';
import { formatDate, formatMs, formatInr, truncate } from '../lib/utils';
import { usePrefersReducedMotion } from '../lib/motion';

// Chart series: solid medium blue + light blue (dark-mode palette).
const INK = '#3b82f6';
const SLATE = '#93c5fd';
const GRID_STROKE = '#26262c';
const TICK_STYLE = { fontSize: 12, fill: '#a8a29e' };

/** Animated number that eases from 0 to the target — respects reduced motion. */
function useCountUp(target: number, duration = 900): number {
  const reducedMotion = usePrefersReducedMotion();
  const [value, setValue] = useState(reducedMotion ? target : 0);
  useEffect(() => {
    if (reducedMotion) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reducedMotion]);
  return value;
}

function statusVariant(s: EvaluationStatus): BadgeVariant {
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

/** Minimal inline sparkline with a soft fill — screen-reader labelled. */
function Sparkline({ points, stroke, label }: { points: number[]; stroke: string; label: string }) {
  const gid = useId();
  if (points.length < 2) return null;
  const w = 120;
  const h = 36;
  const pad = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points.map(
    (p, i) =>
      [
        pad + (i / (points.length - 1)) * (w - pad * 2),
        h - pad - ((p - min) / span) * (h - pad * 2),
      ] as const,
  );
  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [fx] = coords[0];
  const [lx, ly] = coords[coords.length - 1];
  const area = `${d} L${lx.toFixed(1)},${h} L${fx.toFixed(1)},${h} Z`;
  const first = points[0];
  const last = points[points.length - 1];
  const direction = last > first ? 'trending up' : last < first ? 'trending down' : 'steady';
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-9 w-28 shrink-0"
      role="img"
      aria-label={`${label}: ${direction}, from ${Math.round(first)} to ${Math.round(last)}`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.5} fill={stroke} />
    </svg>
  );
}

// ============= PERIOD DELTAS =============

/**
 * Honest period-over-period deltas in percentage points, derived from the
 * measured daily trend points. A delta is null (rendered as "—") when the
 * series is too short for that window — gaps stay gaps, never zeros.
 */
interface PeriodDeltas {
  dd: number | null;
  ww: number | null;
  mm: number | null;
  yy: number | null;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function periodDeltas(points: number[]): PeriodDeltas {
  return {
    dd: points.length >= 2 ? points[points.length - 1] - points[points.length - 2] : null,
    ww: points.length >= 14 ? mean(points.slice(-7)) - mean(points.slice(-14, -7)) : null,
    mm: points.length >= 60 ? mean(points.slice(-30)) - mean(points.slice(-60, -30)) : null,
    // The dashboard history window is far shorter than a year — y/y has no
    // data home and stays blank rather than inventing a comparison.
    yy: null,
  };
}

function DeltaValue({ label, value }: { label: string; value: number | null }) {
  const sign = value != null && value > 0 ? '+' : '';
  return (
    <Text type="body" weight="bold" color="primary" hasTabularNumbers>
      {value == null ? '—' : `${sign}${value.toFixed(1)} pts`}{' '}
      <Text type="inherit" weight="normal" color="secondary">
        {label}
      </Text>
    </Text>
  );
}

/** Metric tile with sparkline + four period deltas, per the template. */
function TrendMetricCard({
  label,
  displayValue,
  points,
  deltas,
  higherIsBetter,
}: {
  label: string;
  displayValue: React.ReactNode;
  points: number[];
  deltas: PeriodDeltas;
  higherIsBetter: boolean;
}) {
  const anchor = deltas.ww ?? deltas.dd;
  const trendUp = anchor == null ? null : anchor >= 0;
  const favorable = trendUp == null ? null : higherIsBetter ? trendUp : !trendUp;
  const stroke = favorable === false ? SLATE : INK;
  return (
    <Card padding={4}>
      <VStack gap={4}>
        <VStack gap={1}>
          <Text type="label" color="secondary">
            {label}
          </Text>
          <HStack gap={2} vAlign="center">
            {/* Sized as the card's hero number, but demoted in the document
                outline: these sit under the section's h2, not beside the
                page's h1. */}
            <Heading level={1} accessibilityLevel={3} className="tabular-nums">
              {displayValue}
            </Heading>
            {trendUp != null && (
              <Icon
                icon={trendUp ? ArrowUpIcon : ArrowDownIcon}
                size="sm"
                color={favorable ? 'success' : 'error'}
              />
            )}
          </HStack>
        </VStack>
        {points.length >= 2 && <Sparkline points={points} stroke={stroke} label={`${label} trend`} />}
        <Grid columns={2} gap={2}>
          <DeltaValue label="d/d" value={deltas.dd} />
          <DeltaValue label="w/w" value={deltas.ww} />
          <DeltaValue label="m/m" value={deltas.mm} />
          <DeltaValue label="y/y" value={deltas.yy} />
        </Grid>
      </VStack>
    </Card>
  );
}

/** Plain count tile — no trend series exists for these metrics, so no
 *  sparkline or deltas; inventing them would be fabrication. */
function CountMetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card padding={4}>
      <VStack gap={1}>
        <Text type="label" color="secondary">
          {label}
        </Text>
        <Heading level={1} accessibilityLevel={3} className="tabular-nums">
          {value}
        </Heading>
        {sub && (
          <Text type="supporting" color="secondary">
            {sub}
          </Text>
        )}
      </VStack>
    </Card>
  );
}

// Grid's `columns` prop carries a single minWidth, so the roomier track floor
// for wide viewports rides in as an xstyle override: Grid routes its track
// template through a CSS var and applies `xstyle` last, so this wins. Below
// the breakpoint the value is left unset and the `columns` prop stands.
// (minWidth 240 keeps the 320px phone safe: 320 − 2×16 page padding = 288.)
const METRICS_WIDE = '@media (min-width: 900px)';

const metricsGridStyles = stylex.create({
  grid: {
    gridTemplateColumns: {
      default: null,
      [METRICS_WIDE]: 'repeat(auto-fit, minmax(320px, 1fr))',
    },
  },
});

// ============= SECTION HEADING =============

// AspectRatio takes its width from the container, and as a flex child its own
// `width: 100%` would resolve against the whole header row. Pinning a width
// here gives it the definite box it needs and makes the tile a 32px square.
const sectionIconStyles = stylex.create({
  tile: {
    width: 'var(--spacing-8)',
    backgroundColor: 'var(--color-background-muted)',
    borderRadius: 'var(--radius-element)',
  },
});

function SectionHeading({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: typeof ChartBarIcon;
}) {
  return (
    <HStack hAlign="between" vAlign="center" gap={3}>
      <HStack gap={3} vAlign="center">
        {icon ? (
          <AspectRatio ratio={1} fit="center" xstyle={sectionIconStyles.tile}>
            <Icon icon={icon} size="sm" color="secondary" />
          </AspectRatio>
        ) : null}
        <Heading level={2}>{title}</Heading>
      </HStack>
      {hint ? (
        <Text type="supporting" color="secondary">
          {hint}
        </Text>
      ) : null}
    </HStack>
  );
}

// Icon's `color` prop only takes semantic names, but the legend swatch must
// match the exact chart series color — inline color required (same pattern as
// the shipped dashboard templates).
function LegendDot({ color, label }: { color: string; label: string }) {
  const dotStyle: CSSProperties = { color };
  return (
    <HStack gap={2} vAlign="center">
      <Icon icon={StopIcon} size="xsm" style={dotStyle} />
      <Text type="supporting" color="secondary">
        {label}
      </Text>
    </HStack>
  );
}

// ============= TREND CHARTS =============

function TrendChartCard({
  title,
  description,
  summary,
  data,
  dataKey,
  name,
  stroke,
}: {
  title: string;
  description: string;
  summary: string;
  data: { date: string; reliability: number | null; consistency: number | null }[];
  dataKey: 'reliability' | 'consistency';
  name: string;
  stroke: string;
}) {
  return (
    <Card padding={6}>
      <VStack gap={4}>
        <VStack gap={1}>
          {/* Card-title sizing, but h3 in the outline — under the "Trends" h2. */}
          <Heading level={4} accessibilityLevel={3}>
            {title}
          </Heading>
          <Text type="supporting" color="secondary">
            {description}
          </Text>
        </VStack>
        <div role="img" aria-label={`${title}. ${summary}`}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="date"
                tick={TICK_STYLE}
                tickFormatter={(d: string) => d.slice(5)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis domain={[0, 100]} tick={TICK_STYLE} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey={dataKey}
                name={name}
                stroke={stroke}
                strokeWidth={2}
                fill={stroke}
                fillOpacity={0.12}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <Text type="supporting" color="secondary">
          {summary}
        </Text>
      </VStack>
    </Card>
  );
}

// ============= BREAKDOWN =============

const BREAKDOWN_TABS = [
  { id: 'usage', label: 'Model usage' },
  { id: 'domain', label: 'Domains' },
  { id: 'cost', label: 'Cost' },
  { id: 'latency', label: 'Latency' },
] as const;

type BreakdownTabId = (typeof BREAKDOWN_TABS)[number]['id'];

function BreakdownCard({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<BreakdownTabId>('usage');

  const activeData =
    tab === 'usage'
      ? data.modelUsage
      : tab === 'domain'
        ? data.domainPerformance
        : tab === 'cost'
          ? data.costByModel
          : data.latencyByModel;
  const hasData = activeData.length > 0;

  const summaries: Record<BreakdownTabId, string> = {
    usage:
      data.modelUsage.length > 0
        ? `Most evaluated: ${data.modelUsage[0]?.model ?? '—'} (${data.modelUsage[0]?.evaluations ?? 0} runs).`
        : 'No evaluations recorded yet.',
    domain:
      data.domainPerformance.length > 0
        ? `Strongest domain: ${[...data.domainPerformance].sort((a, b) => (b.reliability ?? -1) - (a.reliability ?? -1))[0]?.domain ?? '—'}.`
        : 'No domain measurements yet.',
    cost:
      data.costByModel.length > 0
        ? `Total estimated spend: ${formatInr(data.costByModel.reduce((a, c) => a + c.costUsd, 0))}.`
        : 'No cost data recorded yet.',
    latency:
      data.latencyByModel.length > 0
        ? `Fastest model: ${[...data.latencyByModel].sort((a, b) => a.avgMs - b.avgMs)[0]?.model ?? '—'}.`
        : 'No latency data recorded yet.',
  };

  return (
    <Card padding={6}>
      <VStack gap={4}>
        <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
          {/* Card-title sizing, but h3 in the outline — under the "Breakdown" h2. */}
          <Heading level={4} accessibilityLevel={3}>
            Breakdown
          </Heading>
          <div role="tablist" aria-label="Breakdown views" className="flex flex-wrap gap-1">
            {BREAKDOWN_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-stone-400',
                  tab === t.id
                    ? 'bg-stone-600 text-white'
                    : 'text-stone-400 hover:bg-stone-800 hover:text-stone-100',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </HStack>
        <Text type="supporting" color="secondary">
          Where your evaluations, spend, and latency go.
        </Text>
        {hasData ? (
          <div
            role="tabpanel"
            aria-label={BREAKDOWN_TABS.find((t) => t.id === tab)?.label}
          >
            <ResponsiveContainer width="100%" height={260}>
              {tab === 'usage' ? (
                <BarChart data={data.modelUsage} layout="vertical" margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                  <XAxis type="number" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="model" width={130} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="evaluations" name="Evaluations" fill={INK} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              ) : tab === 'domain' ? (
                <BarChart data={data.domainPerformance} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="domain" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="reliability" name="Reliability" fill={INK} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="consistency" name="Consistency" fill={SLATE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              ) : tab === 'cost' ? (
                <BarChart data={data.costByModel} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="model" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK_STYLE} tickFormatter={(v: number) => formatInr(v)} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip formatter={(v) => [formatInr(v as number), 'Cost']} />} />
                  <Bar dataKey="costUsd" name="Cost" fill={INK} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              ) : (
                <BarChart data={data.latencyByModel} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="model" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK_STYLE} tickFormatter={(v: number) => formatMs(v)} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip formatter={(v) => [formatMs(v), 'Avg latency']} />} />
                  <Bar dataKey="avgMs" name="Avg latency" fill={SLATE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              )}
            </ResponsiveContainer>
            {tab === 'domain' && (
              <HStack gap={5} vAlign="center" wrap="wrap" className="mt-3">
                <LegendDot color={INK} label="Reliability" />
                <LegendDot color={SLATE} label="Consistency" />
              </HStack>
            )}
          </div>
        ) : (
          <div className="flex min-h-[260px] items-center justify-center">
            <EmptyState
              title="No data yet"
              description={
                tab === 'cost'
                  ? 'Cost estimates will appear here once evaluations record token usage.'
                  : 'Run an evaluation to start building this breakdown.'
              }
            />
          </div>
        )}
        <Text type="supporting" color="secondary">
          {summaries[tab]}
        </Text>
      </VStack>
    </Card>
  );
}

// ============= RECENT EVALUATIONS =============

// Astryx Table rows must extend Record<string, unknown>; the intersection
// keeps the typed EvaluationSummary fields while satisfying the constraint.
type RecentEvalRow = EvaluationSummary & Record<string, unknown>;

const recentColumns: TableColumn<RecentEvalRow>[] = [
  {
    key: 'question',
    header: 'Question',
    width: proportional(2),
    renderCell: (e: RecentEvalRow) => (
      <Link
        to={`/evaluate/${e.id}/results`}
        className="font-medium text-brand-700 hover:underline dark:text-brand-400"
        title={e.prompt}
      >
        {truncate(e.prompt, 80)}
      </Link>
    ),
  },
  {
    key: 'models',
    header: 'Models',
    width: pixel(110),
    renderCell: (e: RecentEvalRow) => (
      <Badge variant="neutral" label={`${e.models.length} model${e.models.length === 1 ? '' : 's'}`} />
    ),
  },
  {
    key: 'reliability',
    header: 'Reliability',
    width: proportional(1),
    renderCell: (e: RecentEvalRow) =>
      e.reliability != null ? (
        <HStack gap={2} vAlign="center">
          <div style={{ minWidth: 110, flex: 1 }}>
            <ProgressBar
              value={e.reliability}
              max={100}
              label={`Reliability ${e.reliability} of 100`}
              isLabelHidden
            />
          </div>
          <Text type="body" weight="medium" hasTabularNumbers>
            {e.reliability}
          </Text>
        </HStack>
      ) : (
        <span className="text-sm italic text-stone-400 dark:text-stone-500">Unavailable</span>
      ),
  },
  {
    key: 'date',
    header: 'Date',
    width: pixel(120),
    renderCell: (e: RecentEvalRow) => (
      <Text type="body" hasTabularNumbers>
        {formatDate(e.createdAt)}
      </Text>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: pixel(110),
    renderCell: (e: RecentEvalRow) => (
      <Badge variant={statusVariant(e.status)} label={e.status.charAt(0).toUpperCase() + e.status.slice(1)} />
    ),
  },
];

// ============= FILTER BAR =============

// The dashboard API returns all-time aggregates, so the range filter is
// presentational: it annotates the view (per the template's documented
// pattern) rather than re-slicing the data. Wiring it to a ranged query is
// the seam a consumer replaces.
type DateRange = '7d' | '30d' | '90d' | 'all';

const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

function labelFor(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? '';
}

// ============= MAIN =============

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>('all');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getDashboard());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hooks must run on every render — before any early return.
  const reliabilityCount = useCountUp(data?.avgReliability ?? 0);
  const consistencyCount = useCountUp(data?.avgConsistency ?? 0);

  if (loading) {
    return (
      <div data-astryx-theme="stone" data-astryx-media="dark">
        <PageHeader title="Dashboard" description="Reliability analytics across all your evaluations." />
        <LoadingState label="Loading dashboard…" rows={5} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div data-astryx-theme="stone" data-astryx-media="dark">
        <PageHeader title="Dashboard" description="Reliability analytics across all your evaluations." />
        <ErrorState message={error ?? 'Failed to load dashboard data.'} onRetry={load} />
      </div>
    );
  }

  const summary = [
    `Across ${data.totalEvaluations} evaluations and ${data.modelsTested} models`,
    `${data.conflictsDetected} conflicts detected`,
    `${data.claimsVerified} claims verified`,
    labelFor(RANGE_OPTIONS, range),
  ].join(' · ');

  // Sparklines and deltas only include measured points — gaps stay gaps.
  const reliabilityPoints = data.reliabilityTrend
    .map((t) => t.reliability)
    .filter((v): v is number => v != null);
  const consistencyPoints = data.consistencyTrend
    .map((t) => t.consistency)
    .filter((v): v is number => v != null);
  const reliabilityDeltas = periodDeltas(reliabilityPoints);
  const consistencyDeltas = periodDeltas(consistencyPoints);

  return (
    <div data-astryx-theme="stone" data-astryx-media="dark">
      <Reveal>
        <Reveal.Item>
          <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
            <VStack gap={1}>
              <Heading level={1}>Dashboard</Heading>
              <Text type="supporting" color="secondary">
                Reliability analytics across all your evaluations · {summary}
              </Text>
            </VStack>
            <HStack gap={2} vAlign="center">
              <Selector
                label="Date range"
                isLabelHidden
                options={RANGE_OPTIONS}
                value={range}
                onChange={(v) => setRange(v as DateRange)}
              />
              <Button
                label="Run new evaluation"
                variant="primary"
                icon={<Icon icon={PlusIcon} size="sm" />}
                onClick={() => navigate('/evaluate/models')}
              />
            </HStack>
          </HStack>
          {hasSampleData(data.recent) && (
            <div className="mt-4">
              <SampleDataBanner />
            </div>
          )}
          <Divider className="my-6" />
        </Reveal.Item>

        <Reveal.Item>
          <VStack gap={6}>
            <SectionHeading
              title="Key metrics"
              hint="Change vs. prior day, week, month, and year"
              icon={ChartBarIcon}
            />
            <Grid
              columns={{ minWidth: 240, repeat: 'fit' }}
              gap={3}
              xstyle={metricsGridStyles.grid}
            >
              <TrendMetricCard
                label="Avg reliability"
                displayValue={data.avgReliability != null ? `${reliabilityCount}%` : 'Unavailable'}
                points={reliabilityPoints}
                deltas={reliabilityDeltas}
                higherIsBetter
              />
              <TrendMetricCard
                label="Avg consistency"
                displayValue={data.avgConsistency != null ? `${consistencyCount}%` : 'Unavailable'}
                points={consistencyPoints}
                deltas={consistencyDeltas}
                higherIsBetter
              />
              <CountMetricCard
                label="Evaluations run"
                value={data.totalEvaluations}
                sub={`${data.modelsTested} models tested`}
              />
              <CountMetricCard
                label="Models tested"
                value={data.modelsTested}
                sub="Unique models evaluated"
              />
              <CountMetricCard
                label="Conflicts detected"
                value={data.conflictsDetected}
                sub={`Across ${data.totalEvaluations} evaluations`}
              />
              <CountMetricCard
                label="Claims verified"
                value={data.claimsVerified}
                sub={`${data.reportsGenerated} reports generated`}
              />
            </Grid>
          </VStack>
        </Reveal.Item>

        <Reveal.Item>
          <VStack gap={6} className="mt-10">
            <SectionHeading
              title="Trends"
              hint="Daily averages across evaluations"
              icon={PresentationChartLineIcon}
            />
            <Grid columns={{ minWidth: 260, repeat: 'fit' }} gap={4}>
              <TrendChartCard
                title="Reliability over time"
                description="Average reliability across evaluations per day."
                summary={
                  reliabilityPoints.length > 0
                    ? `Reliability is currently ${reliabilityPoints[reliabilityPoints.length - 1]}%.`
                    : 'No reliability measurements yet.'
                }
                data={data.reliabilityTrend}
                dataKey="reliability"
                name="Reliability"
                stroke={INK}
              />
              <TrendChartCard
                title="Consistency over time"
                description="Average cross-run consistency per day."
                summary={
                  consistencyPoints.length > 0
                    ? `Consistency is currently ${consistencyPoints[consistencyPoints.length - 1]}%.`
                    : 'No consistency measurements yet.'
                }
                data={data.consistencyTrend}
                dataKey="consistency"
                name="Consistency"
                stroke={SLATE}
              />
            </Grid>
          </VStack>
        </Reveal.Item>

        <Reveal.Item>
          <VStack gap={6} className="mt-10">
            <SectionHeading
              title="Breakdown"
              hint="Where your evaluations, spend, and latency go"
              icon={TableCellsIcon}
            />
            <BreakdownCard data={data} />
          </VStack>
        </Reveal.Item>

        <Reveal.Item>
          <VStack gap={6} className="mt-10">
            <SectionHeading
              title="Recent evaluations"
              hint="Your latest evaluation runs"
              icon={ClockIcon}
            />
            <Card padding={6}>
              {data.recent.length === 0 ? (
                <EmptyState
                  title="No evaluations yet"
                  description="Run your first evaluation to start building your reliability history."
                  icon={<Icon icon={BeakerIcon} size="lg" />}
                  actions={
                    <Button
                      label="Run evaluation"
                      variant="primary"
                      onClick={() => navigate('/evaluate/models')}
                    />
                  }
                />
              ) : (
                <Table<RecentEvalRow>
                  data={data.recent.map((e) => e as RecentEvalRow)}
                  columns={recentColumns}
                  idKey="id"
                  density="balanced"
                  dividers="rows"
                  hasHover
                />
              )}
            </Card>
          </VStack>
        </Reveal.Item>
      </Reveal>
    </div>
  );
}
