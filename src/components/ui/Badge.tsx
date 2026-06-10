import { cn } from '@/lib/utils';
import type { SignalDirection } from '@/lib/types';

interface SignalBadgeProps {
  signal: SignalDirection | null;
  size?: 'sm' | 'md';
}

const SIGNAL_STYLES: Record<SignalDirection, string> = {
  BULLISH: 'bg-green-500/15 text-green-400 border border-green-500/30',
  BEARISH: 'bg-red-500/15 text-red-400 border border-red-500/30',
  NEUTRAL: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
};

export function SignalBadge({ signal, size = 'md' }: SignalBadgeProps) {
  if (!signal) return <span className="text-slate-600">—</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded font-semibold tracking-wide',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
        SIGNAL_STYLES[signal],
      )}
    >
      {signal}
    </span>
  );
}

interface BreakoutBadgeProps {
  breakout: 'YES' | 'NO' | null;
}

export function BreakoutBadge({ breakout }: BreakoutBadgeProps) {
  if (!breakout) return <span className="text-slate-600">—</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold',
        breakout === 'YES'
          ? 'bg-green-500/15 text-green-400 border border-green-500/30'
          : 'bg-slate-700/60 text-slate-400 border border-slate-600/30',
      )}
    >
      {breakout}
    </span>
  );
}

interface SourceBadgeProps {
  source: 'live' | 'mock';
}

export function SourceBadge({ source }: SourceBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium',
        source === 'live'
          ? 'bg-green-500/15 text-green-400'
          : 'bg-amber-500/15 text-amber-400',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', source === 'live' ? 'bg-green-400 live-dot' : 'bg-amber-400')} />
      {source === 'live' ? 'LIVE' : 'MOCK'}
    </span>
  );
}
