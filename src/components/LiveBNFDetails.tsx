'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import { formatNumber, formatDateTime } from '@/lib/utils';
import type { BNFApiResponse, BNFInstrumentData } from '@/lib/types';
import Card from './ui/Card';
import LoadingSpinner from './ui/LoadingSpinner';
import { SignalBadge, BreakoutBadge, SourceBadge } from './ui/Badge';

// ── Data fetcher (client → Next.js API route → Firstock) ──────────────────────
async function fetchBNFDetails(): Promise<BNFApiResponse> {
  const res = await fetch('/api/firstock/bnf', { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Table row ─────────────────────────────────────────────────────────────────
function DataRow({ row, isEven }: { row: BNFInstrumentData; isEven: boolean }) {
  const isBNF = row.instrument === 'BNF';

  return (
    <tr
      className={`border-b border-[#2a2d3e] transition-colors hover:bg-white/[0.03] ${
        isEven ? 'bg-white/[0.01]' : ''
      } ${isBNF ? 'bg-blue-500/5' : ''}`}
    >
      {/* Instrument */}
      <td className="whitespace-nowrap px-4 py-2.5">
        <span className={`text-xs font-bold ${isBNF ? 'text-blue-400' : 'text-slate-200'}`}>
          {row.instrument}
        </span>
      </td>

      {/* CMP */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs text-slate-200">
        {formatNumber(row.cmp)}
      </td>

      {/* Future */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs">
        <span
          className={
            row.future != null && row.cmp != null
              ? row.future > row.cmp
                ? 'text-green-400'
                : row.future < row.cmp
                ? 'text-red-400'
                : 'text-slate-400'
              : 'text-slate-600'
          }
        >
          {formatNumber(row.future)}
        </span>
      </td>

      {/* Max Pain */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs text-slate-400">
        {formatNumber(row.maxPain)}
      </td>

      {/* Signal 2h */}
      <td className="whitespace-nowrap px-4 py-2.5 text-center">
        <SignalBadge signal={row.signal2h} size="sm" />
      </td>

      {/* Strike */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs text-slate-400">
        {formatNumber(row.strike, 0)}
      </td>

      {/* Entry ~5% */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs text-amber-400">
        {formatNumber(row.entry5pct)}
      </td>

      {/* Breakout */}
      <td className="whitespace-nowrap px-4 py-2.5 text-center">
        <BreakoutBadge breakout={row.breakout} />
      </td>
    </tr>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 60_000; // 1 minute

export default function LiveBNFDetails() {
  const { data, error, isLoading, isFetching, isError, dataUpdatedAt, refetch } =
    useQuery<BNFApiResponse, Error>({
      queryKey: ['bnf-live'],
      queryFn: fetchBNFDetails,
      refetchInterval: POLL_INTERVAL_MS,
      // Keep previous data visible on refetch / error
      placeholderData: (prev) => prev,
    });

  const lastUpdated = data?.lastUpdated
    ? formatDateTime(data.lastUpdated)
    : dataUpdatedAt
    ? formatDateTime(new Date(dataUpdatedAt).toISOString())
    : null;

  return (
    <Card
      title="Live Bank Nifty Details"
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
            className="rounded p-1 text-slate-500 hover:text-blue-400 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      {/* Error banner — shown alongside last known data if available */}
      {isError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Failed to refresh data</p>
            <p className="mt-0.5 text-red-400/70">{(error as Error)?.message}</p>
            {data && (
              <p className="mt-1 text-red-400/50">
                Showing last successful data from {lastUpdated}.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner size="lg" label="Fetching Bank Nifty data…" />
        </div>
      )}

      {/* Data table */}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-[#2a2d3e]">
          <table className="dashboard-table w-full min-w-[700px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#2a2d3e] bg-[#0f1117]">
                {[
                  { label: 'Instrument', align: 'left' },
                  { label: 'CMP', align: 'right' },
                  { label: 'Future', align: 'right' },
                  { label: 'Max Pain', align: 'right' },
                  { label: 'Signal 2H', align: 'center' },
                  { label: 'Strike', align: 'right' },
                  { label: 'Entry ~5%', align: 'right' },
                  { label: 'Breakout', align: 'center' },
                ].map(({ label, align }) => (
                  <th
                    key={label}
                    className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 text-${align}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.map((row, i) => (
                <DataRow key={row.instrument} row={row} isEven={i % 2 === 0} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Poll info footer */}
      <p className="mt-3 text-[10px] text-slate-600">
        Auto-refreshes every 60 seconds.{' '}
        {data?.source === 'mock' && data.warning ? (
          <span className="text-amber-500/80">{data.warning}</span>
        ) : data?.source === 'mock' ? (
          <span className="text-amber-500/70">
            Mock data — configure Firstock credentials in <code>.env.local</code> for live data.
          </span>
        ) : null}
      </p>
    </Card>
  );
}
