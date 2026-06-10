'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { BANK_NIFTY_WEIGHTAGE } from '@/lib/weightageData';
import type { WeightageEntry } from '@/lib/types';
import Card from './ui/Card';
import LoadingSpinner from './ui/LoadingSpinner';
import { useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

type ChartMode = 'bar' | 'pie';

interface WeightageApiResponse {
  data: WeightageEntry[];
  source: 'supabase' | 'static';
  warning?: string;
}

async function fetchWeightage(): Promise<WeightageApiResponse> {
  const res = await fetch('/api/weightage', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#2a2d3e] bg-[#1a1d27] px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-white">{d.fullName}</p>
      <p className="mt-0.5 text-slate-400">
        Weightage: <span className="text-blue-400 font-bold">{d.weightage}%</span>
      </p>
    </div>
  );
}

// ── Pie custom label ───────────────────────────────────────────────────────────
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, name, weightage }: any) {
  if (weightage < 3) return null; // skip tiny slices
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600}>
      {name}
    </text>
  );
}

export default function WeightageChart() {
  const [mode, setMode] = useState<ChartMode>('bar');

  const { data: response, isLoading, isError, error, isFetching, refetch } =
    useQuery<WeightageApiResponse, Error>({
      queryKey: ['weightage'],
      queryFn: fetchWeightage,
      staleTime: 5 * 60 * 1000, // 5 minutes
      placeholderData: (prev) => prev,
    });

  // Use API data if available, otherwise fall back to static
  const weightageData = response?.data ?? BANK_NIFTY_WEIGHTAGE;
  const source = response?.source ?? 'static';

  // Sort descending for bar chart
  const sorted = [...weightageData].sort((a, b) => b.weightage - a.weightage);

  return (
    <Card
      title="Bank Nifty Constituent Weightage"
      titleRight={
        <div className="flex items-center gap-2">
          {source === 'supabase' && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
              Supabase
            </span>
          )}
          {source === 'static' && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20">
              Static
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh weightage"
            className="rounded p-1 text-slate-500 hover:text-blue-400 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex gap-1">
            {(['bar', 'pie'] as ChartMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium capitalize transition-colors ${
                  mode === m
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {/* Error banner */}
      {isError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Failed to fetch weightage</p>
            <p className="mt-0.5 text-red-400/70">{error?.message}</p>
            <p className="mt-1 text-red-400/50">Showing static fallback data.</p>
          </div>
        </div>
      )}

      {/* Warning from API (e.g. Supabase unavailable) */}
      {response?.warning && !isError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{response.warning}</p>
        </div>
      )}

      <p className="mb-4 text-xs text-slate-500">
        {source === 'supabase'
          ? 'Constituent weightage from Supabase. Source: NSE.'
          : 'Static index weightage — approximate as of June 2025. Source: NSE.'}
      </p>

      {/* Loading state */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading weightage data…" />
        </div>
      ) : mode === 'bar' ? (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} layout="vertical" margin={{ left: 16, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 30]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={{ stroke: '#2a2d3e' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={88}
                tick={{ fill: '#cbd5e1', fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="weightage" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {sorted.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={weightageData}
                dataKey="weightage"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={120}
                labelLine={false}
                label={<PieLabel />}
              >
                {weightageData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value, entry: any) => (
                  <span className="text-xs text-slate-400">
                    {value} <span className="text-slate-500">({entry.payload.weightage}%)</span>
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary row */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {weightageData
          .filter((e) => e.name !== 'Others')
          .slice(0, 6)
          .map((entry) => (
            <div
              key={entry.name}
              className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-3 py-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-[11px] font-semibold text-slate-200">{entry.name}</span>
              </div>
              <p className="mt-1 text-lg font-bold" style={{ color: entry.color }}>
                {entry.weightage}%
              </p>
            </div>
          ))}
      </div>
    </Card>
  );
}
