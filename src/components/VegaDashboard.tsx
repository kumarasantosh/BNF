'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import Card from './ui/Card';
import LoadingSpinner from './ui/LoadingSpinner';
import { SourceBadge } from './ui/Badge';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import type { VegaApiResponse, VegaHistoryRow, VegaMetricRow, VegaTrendSignal } from '@/lib/types';

const POLL_INTERVAL_MS = 60_000;

const TREND_STYLES: Record<VegaTrendSignal, string> = {
  BULLISH: 'border-green-500/30 bg-green-500/15 text-green-400',
  BEARISH: 'border-red-500/30 bg-red-500/15 text-red-400',
  'SIDEWAYS BULLISH': 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  'SIDEWAYS BEARISH': 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  SIDEWAYS: 'border-slate-500/25 bg-slate-500/10 text-slate-300',
};

async function fetchVegaDashboard(): Promise<VegaApiResponse> {
  const res = await fetch('/api/nse/vega', { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}

function VegaTrendBadge({ trend }: { trend: VegaTrendSignal | null }) {
  if (!trend) return <span className="text-slate-600">-</span>;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        TREND_STYLES[trend],
      )}
    >
      {trend}
    </span>
  );
}

function signedValueClass(value: number | null) {
  if (value == null || Math.abs(value) < 0.01) return 'text-slate-400';
  return value > 0 ? 'text-green-400' : 'text-red-400';
}

function MetricValue({ value, decimals = 2 }: { value: number | null; decimals?: number }) {
  return (
    <span className={cn('font-mono text-xs font-semibold', signedValueClass(value))}>
      {formatNumber(value, decimals)}
    </span>
  );
}

function SummaryTable({ rows }: { rows: VegaMetricRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#2a2d3e]">
      <table className="dashboard-table w-full table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-[25%]" />
          <col className="w-[18%]" />
          <col className="w-[18%]" />
          <col className="w-[15%]" />
          <col className="w-[24%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-[#2a2d3e] bg-[#0f1117]">
            <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              NIFTY
            </th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Call Vega
            </th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Put Vega
            </th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Diff
            </th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Trend
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-[#2a2d3e] last:border-b-0">
              <td className="whitespace-nowrap px-3 py-3 text-xs font-bold text-slate-300">
                {row.label}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right">
                <MetricValue value={row.callVega} />
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right">
                <MetricValue value={row.putVega} />
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right">
                <MetricValue value={row.diff} />
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-center">
                <VegaTrendBadge trend={row.trend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-[#2a2d3e] bg-[#11131b] px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-slate-200">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="font-mono" style={{ color: item.color }}>
          {item.name}: {formatNumber(Number(item.value))}
        </p>
      ))}
      <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
        {payload[0]?.payload?.trend}
      </p>
    </div>
  );
}

function VegaChart({ history }: { history: VegaHistoryRow[] }) {
  return (
    <div className="h-[360px] min-h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={history} margin={{ top: 12, right: 18, bottom: 6, left: 0 }}>
          <CartesianGrid stroke="#2a2d3e" strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={{ stroke: '#2a2d3e' }}
            tickLine={false}
            minTickGap={18}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={{ stroke: '#2a2d3e' }}
            tickLine={false}
            width={42}
          />
          <ReferenceLine y={0} stroke="#64748b" strokeOpacity={0.55} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="callVega"
            name="Call Vega"
            stroke="#16a34a"
            strokeWidth={2.5}
            dot={{ r: 2, strokeWidth: 1 }}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="putVega"
            name="Put Vega"
            stroke="#dc2626"
            strokeWidth={2.5}
            dot={{ r: 2, strokeWidth: 1 }}
            activeDot={{ r: 4 }}
          />
          </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HistoryTable({ rows }: { rows: VegaHistoryRow[] }) {
  const tableRows = useMemo(() => [...rows].reverse(), [rows]);

  return (
    <div className="max-h-[360px] overflow-auto rounded-lg border border-[#2a2d3e]">
      <table className="dashboard-table w-full min-w-[520px] border-collapse text-left">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-[#2a2d3e] bg-[#0f1117]">
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Time
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Call Vega
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Put Vega
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Diff
            </th>
            <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Trend
            </th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row) => (
            <tr key={row.capturedAt} className="border-b border-[#2a2d3e] last:border-b-0">
              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-bold text-slate-300">
                {row.time}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                <MetricValue value={row.callVega} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                <MetricValue value={row.putVega} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                <MetricValue value={row.diff} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-center">
                <VegaTrendBadge trend={row.trend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function VegaDashboard() {
  const { data, error, isError, isFetching, isLoading, refetch, dataUpdatedAt } =
    useQuery<VegaApiResponse, Error>({
      queryKey: ['nse-vega'],
      queryFn: fetchVegaDashboard,
      refetchInterval: POLL_INTERVAL_MS,
      placeholderData: (prev) => prev,
    });

  const dashboard = data?.data;
  const currentTrend = dashboard?.summary.find((row) => row.label === 'DIFFERENCE')?.trend ?? null;
  const lastUpdated = data?.lastUpdated
    ? formatDateTime(data.lastUpdated)
    : dataUpdatedAt
    ? formatDateTime(new Date(dataUpdatedAt).toISOString())
    : null;

  return (
    <Card
      title="ATM +/- 12 Vega Trend"
      titleRight={
        <div className="flex items-center gap-3">
          {data?.source && <SourceBadge source={data.source} />}
          {lastUpdated && (
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <Clock className="h-3 w-3" />
              {lastUpdated}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh now"
            className="rounded p-1 text-slate-500 transition-colors hover:text-blue-400 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      {isError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Failed to refresh vega data</p>
            <p className="mt-0.5 text-red-400/70">{error?.message}</p>
          </div>
        </div>
      )}

      {data?.warning && !isError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{data.warning}</p>
        </div>
      )}

      {isLoading && (
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner size="lg" label="Fetching NSE option-chain data..." />
        </div>
      )}

      {dashboard && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-wrap gap-2 text-[11px] text-slate-400">
              <span className="rounded border border-[#2a2d3e] bg-[#0f1117] px-2 py-1 font-semibold text-slate-200">
                {dashboard.symbol}
              </span>
              <span className="rounded border border-[#2a2d3e] bg-[#0f1117] px-2 py-1">
                Expiry {dashboard.expiryDate ?? '-'}
              </span>
              <span className="rounded border border-[#2a2d3e] bg-[#0f1117] px-2 py-1">
                ATM {formatNumber(dashboard.atmStrike, 0)}
              </span>
              <span className="rounded border border-[#2a2d3e] bg-[#0f1117] px-2 py-1">
                Spot {formatNumber(dashboard.underlyingValue)}
              </span>
              <span className="rounded border border-[#2a2d3e] bg-[#0f1117] px-2 py-1">
                {dashboard.selectedStrikeCount} strikes
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Current Day Trend
              </span>
              <VegaTrendBadge trend={currentTrend} />
            </div>
          </div>

          <SummaryTable rows={dashboard.summary} />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.75fr)]">
            <VegaChart history={dashboard.history} />
            <HistoryTable rows={dashboard.history} />
          </div>

          <p className="text-[10px] text-slate-600">
            Captures from {dashboard.config.captureStartTime} IST and auto-refreshes every 60 seconds.
          </p>
        </div>
      )}
    </Card>
  );
}
