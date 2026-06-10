import type {
  VegaApiResponse,
  VegaDashboardData,
  VegaHistoryRow,
  VegaMetricRow,
  VegaTrendConfig,
  VegaTrendRule,
  VegaTrendSignal,
} from './types';
import { supabase } from './supabase';
import { calculateGreeks } from './greeks';

const NSE_BASE = 'https://www.nseindia.com';
const IST_TIME_ZONE = 'Asia/Kolkata';
const DEFAULT_SYMBOL = 'NIFTY';
const DEFAULT_EXPIRY_DATE = '16-Jun-2026';
const DEFAULT_CAPTURE_START_TIME = '09:15';
const DEFAULT_CAPTURE_END_TIME = '15:30';
const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_NSE_TIMEOUT_MS = 7_000;
const MAX_HISTORY_ROWS = 420;
const VERY_LARGE_DIFF = 1_000_000;

const NSE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${NSE_BASE}/option-chain`,
  Origin: NSE_BASE,
};

interface NseLeg {
  expiryDate?: string;
  impliedVolatility?: number | string;
  strikePrice?: number | string;
  underlying?: string;
  underlyingValue?: number | string;
}

interface NseOptionRow {
  strikePrice?: number | string;
  expiryDate?: string;
  expiryDates?: string;
  CE?: NseLeg;
  PE?: NseLeg;
}

interface NseOptionChainResponse {
  data?: NseOptionRow[];
  records?: {
    data?: NseOptionRow[];
    expiryDates?: string[];
    underlyingValue?: number | string;
    timestamp?: string;
  };
  filtered?: {
    data?: NseOptionRow[];
  };
}

interface VegaSnapshot {
  capturedAt: string;
  time: string;
  callTotal: number;
  putTotal: number;
  rawDiff: number;
  expiryDate: string | null;
  underlyingValue: number | null;
  atmStrike: number | null;
  selectedStrikeCount: number;
}

interface VegaSessionState {
  dateKey: string;
  dayOpen: VegaSnapshot | null;
  history: VegaHistoryRow[];
  reBaselinedAt: string | null; // ISO timestamp when we re-baselined due to calc method change
}

interface VegaDbRow {
  captured_at: string;
  captured_time: string;
  call_vega: number | string;
  put_vega: number | string;
  diff: number | string;
  call_vega_change: number | string;
  put_vega_change: number | string;
  diff_change: number | string;
  trend: VegaTrendSignal;
  expiry_date: string;
  underlying_value: number | string | null;
  atm_strike: number | string | null;
  selected_strike_count: number | string;
  day_open_call_vega: number | string;
  day_open_put_vega: number | string;
}

interface DashboardBuildResult {
  data: VegaDashboardData;
  warning?: string;
}

let nseCookieCache: { value: string; expiresAt: number } | null = null;
let vegaSession: VegaSessionState | null = null;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = Number(readEnv(name));
  return Number.isFinite(value) ? value : fallback;
}

function readTimeEnv(name: string, fallback: string): string {
  const value = readEnv(name);
  return value && /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  const abortSignal = AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal;
  };

  return abortSignal.timeout?.(ms);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toNumber(value: unknown): number | null {
  const numeric = typeof value === 'string' ? Number(value.trim()) : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function isAtOrAfterTime(time: string, startTime: string): boolean {
  return parseTimeToMinutes(time) >= parseTimeToMinutes(startTime);
}

function isWithinCaptureWindow(time: string, config: VegaTrendConfig): boolean {
  const minutes = parseTimeToMinutes(time);
  return (
    minutes >= parseTimeToMinutes(config.captureStartTime) &&
    minutes <= parseTimeToMinutes(config.captureEndTime)
  );
}

function getIstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';

  return {
    dateKey: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  };
}

function getConfig(): VegaTrendConfig {
  const strongThreshold = readNumberEnv('VEGA_TREND_THRESHOLD', 5);
  const neutralBand = readNumberEnv('VEGA_NEUTRAL_BAND', 0.05);
  const envRules = readEnv('VEGA_TREND_RULES_JSON');
  let rules: VegaTrendRule[] | null = null;

  if (envRules) {
    try {
      const parsed = JSON.parse(envRules) as VegaTrendRule[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        rules = parsed
          .filter((rule) => (
            typeof rule.signal === 'string' &&
            Number.isFinite(rule.minDiff) &&
            Number.isFinite(rule.maxDiff)
          ))
          .map((rule) => ({
            signal: rule.signal,
            minDiff: rule.minDiff,
            maxDiff: rule.maxDiff,
          }));
      }
    } catch (err) {
      console.warn('[NSE Vega] Could not parse VEGA_TREND_RULES_JSON:', (err as Error).message);
    }
  }

  return {
    symbol: readEnv('VEGA_SYMBOL') ?? DEFAULT_SYMBOL,
    expiryDate: readEnv('VEGA_EXPIRY_DATE') ?? DEFAULT_EXPIRY_DATE,
    strikeWindow: Math.max(1, Math.floor(readNumberEnv('VEGA_STRIKE_WINDOW', 12))),
    captureStartTime: readTimeEnv('VEGA_CAPTURE_START_TIME', DEFAULT_CAPTURE_START_TIME),
    captureEndTime: readTimeEnv('VEGA_CAPTURE_END_TIME', DEFAULT_CAPTURE_END_TIME),
    pollIntervalMs: Math.max(10_000, Math.floor(readNumberEnv('VEGA_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS))),
    rules: rules?.length
      ? rules
      : [
          { signal: 'BEARISH', minDiff: -VERY_LARGE_DIFF, maxDiff: -strongThreshold },
          { signal: 'BULLISH', minDiff: strongThreshold, maxDiff: VERY_LARGE_DIFF },
          { signal: 'SIDEWAYS BEARISH', minDiff: -strongThreshold, maxDiff: -neutralBand },
          { signal: 'SIDEWAYS BULLISH', minDiff: neutralBand, maxDiff: strongThreshold },
          { signal: 'SIDEWAYS', minDiff: -neutralBand, maxDiff: neutralBand },
        ],
  };
}

interface TrendInput {
  callVega: number;   // Call Vega change from baseline
  putVega: number;    // Put Vega change from baseline
  diff: number;       // Put Vega - Call Vega (current)
  diffHistory: number[]; // Array of previous diff values
}

function getTrend(input: TrendInput): VegaTrendSignal {
  const { callVega, putVega, diff, diffHistory } = input;

  const GAP_THRESHOLD = 2.0;
  const NEUTRAL_BAND = 2.0;
  const REVERSAL_DROP = 10.0;
  const REVERSAL_PEAK = 15;

  // ── Method A: Individual Call vs Put Vega sign analysis ──
  // When call and put vega are moving in clearly opposite directions,
  // this gives the strongest and most unambiguous signal.
  const callPositive = callVega > NEUTRAL_BAND;
  const callNegative = callVega < -NEUTRAL_BAND;
  const putPositive = putVega > NEUTRAL_BAND;
  const putNegative = putVega < -NEUTRAL_BAND;

  // Call Vega +ve & Put Vega -ve → Bullish (call writers losing, put writers gaining)
  if (callPositive && putNegative) return 'BULLISH';
  // Put Vega +ve & Call Vega -ve → Bearish (put writers losing, call writers gaining)
  if (putPositive && callNegative) return 'BEARISH';
  // Both negative → Sideways (both decaying, consolidation)
  if (callNegative && putNegative) return 'SIDEWAYS';

  // ── Method B: Single Vega (Put - Call) gap/momentum analysis ──
  // Used when Method A doesn't give a clear opposite-sign signal.

  // Reversal detection: check for peaks in recent history
  if (diffHistory.length >= 3) {
    const window = [...diffHistory.slice(-10), diff];
    const maxPos = Math.max(...window);
    const minNeg = Math.min(...window);

    // Was bearish (high positive peak), now dropping → reversal to Bullish
    if (maxPos > REVERSAL_PEAK && (maxPos - diff) >= REVERSAL_DROP) {
      return 'BULLISH';
    }
    // Was bullish (deep negative peak), now rising → reversal to Bearish
    if (minNeg < -REVERSAL_PEAK && (diff - minNeg) >= REVERSAL_DROP) {
      return 'BEARISH';
    }
  }

  // Sideways: diff fluctuates tightly around zero
  if (Math.abs(diff) <= NEUTRAL_BAND) {
    return 'SIDEWAYS';
  }

  // Gap analysis: measure momentum over last 3 data points
  let avgGap = 0;
  if (diffHistory.length >= 2) {
    const recent = [...diffHistory.slice(-2), diff];
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      gaps.push(Math.abs(recent[i] - recent[i - 1]));
    }
    avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  } else {
    avgGap = Math.abs(diff); // First data point, use magnitude
  }

  // Negative diff with gaps → Bullish; without gaps → Sideways Bullish
  if (diff < -NEUTRAL_BAND) {
    return avgGap >= GAP_THRESHOLD ? 'BULLISH' : 'SIDEWAYS BULLISH';
  }

  // Positive diff with gaps → Bearish; without gaps → Sideways Bearish
  if (diff > NEUTRAL_BAND) {
    return avgGap >= GAP_THRESHOLD ? 'BEARISH' : 'SIDEWAYS BEARISH';
  }

  return 'SIDEWAYS';
}

function getIstWeekday(date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIME_ZONE,
    weekday: 'short',
  }).format(date);
}

function isIstWeekday(date = new Date()): boolean {
  return !['Sat', 'Sun'].includes(getIstWeekday(date));
}

export function getNseVegaCaptureStatus(date = new Date()) {
  const config = getConfig();
  const { dateKey, time } = getIstParts(date);
  const isInWindow = isWithinCaptureWindow(time, config);
  const isWeekday = isIstWeekday(date);

  return {
    config,
    dateKey,
    time,
    weekday: getIstWeekday(date),
    isInWindow,
    isWeekday,
    shouldCapture: isWeekday && isInWindow,
  };
}

function splitSetCookie(header: string): string[] {
  return header.split(/,(?=\s*[^;,=]+=[^;,]+)/g);
}

function responseSummary(text: string): string {
  const title = text.match(/<title>([^<]+)<\/title>/i)?.[1];
  return (title ?? text).replace(/\s+/g, ' ').trim().slice(0, 180);
}

function buildOptionChainUrl(config: VegaTrendConfig): string {
  return `${NSE_BASE}/api/NextApi/apiClient/GetQuoteApi?functionName=getOptionChainData&symbol=${encodeURIComponent(config.symbol)}&params=expiryDate=${encodeURIComponent(config.expiryDate)}`;
}

async function getNseCookie(forceRefresh = false): Promise<string> {
  if (!forceRefresh && nseCookieCache && Date.now() < nseCookieCache.expiresAt) {
    return nseCookieCache.value;
  }

  const res = await fetch(`${NSE_BASE}/option-chain`, {
    headers: {
      ...NSE_HEADERS,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    cache: 'no-store',
    signal: timeoutSignal(readNumberEnv('VEGA_NSE_TIMEOUT_MS', DEFAULT_NSE_TIMEOUT_MS)),
  });

  if (!res.ok) {
    throw new Error(`NSE session warm-up failed: HTTP ${res.status}`);
  }

  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headers.getSetCookie?.() ?? (
    res.headers.get('set-cookie') ? splitSetCookie(res.headers.get('set-cookie') as string) : []
  );
  const cookie = setCookies
    .map((value) => value.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');

  nseCookieCache = {
    value: cookie,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };

  return cookie;
}

async function fetchOptionChain(config: VegaTrendConfig, forceCookieRefresh = false): Promise<NseOptionChainResponse> {
  const cookie = forceCookieRefresh ? await getNseCookie(true) : '';
  const res = await fetch(buildOptionChainUrl(config), {
    headers: {
      ...NSE_HEADERS,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    cache: 'no-store',
    signal: timeoutSignal(readNumberEnv('VEGA_NSE_TIMEOUT_MS', DEFAULT_NSE_TIMEOUT_MS)),
  });

  if ((res.status === 401 || res.status === 403) && !forceCookieRefresh) {
    return fetchOptionChain(config, true);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`NSE option-chain API failed: HTTP ${res.status} ${responseSummary(text)}`);
  }

  if (text.trimStart().startsWith('<')) {
    throw new Error(`NSE option-chain API returned HTML instead of JSON: ${responseSummary(text)}`);
  }

  try {
    return JSON.parse(text) as NseOptionChainResponse;
  } catch {
    throw new Error(`NSE option-chain response is not JSON: ${text.slice(0, 120)}`);
  }
}

function nearestStrike(strikes: number[], underlyingValue: number | null): number | null {
  if (underlyingValue == null || strikes.length === 0) return null;

  return strikes.reduce((best, strike) => (
    Math.abs(strike - underlyingValue) < Math.abs(best - underlyingValue) ? strike : best
  ), strikes[0]);
}

function impliedVolatility(leg: NseLeg | undefined): number {
  const value = toNumber(leg?.impliedVolatility);
  return value != null && value > 0 ? value : 0;
}

function rowExpiryDate(row: NseOptionRow): string | null {
  return row.expiryDate ?? row.expiryDates ?? row.CE?.expiryDate ?? row.PE?.expiryDate ?? null;
}

function normalizeExpiryDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const upper = value.trim().toUpperCase();
  const monthMatch = upper.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/);
  if (monthMatch) {
    const [, day, month, year] = monthMatch;
    const months: Record<string, string> = {
      JAN: '01',
      FEB: '02',
      MAR: '03',
      APR: '04',
      MAY: '05',
      JUN: '06',
      JUL: '07',
      AUG: '08',
      SEP: '09',
      OCT: '10',
      NOV: '11',
      DEC: '12',
    };
    const monthNumber = months[month];

    return monthNumber ? `${year}-${monthNumber}-${day.padStart(2, '0')}` : upper;
  }

  const numericMatch = upper.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (numericMatch) {
    const [, day, month, year] = numericMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return upper;
}

function getTimeToExpiryYears(expiryDateStr: string | null): number {
  if (!expiryDateStr) return 0;
  // Normalize date format if necessary
  const normalized = normalizeExpiryDate(expiryDateStr) ?? expiryDateStr;
  const expiryDate = new Date(normalized);
  if (isNaN(expiryDate.getTime())) return 0;
  
  // Expiry is generally 15:30 IST (10:00 UTC)
  expiryDate.setUTCHours(10, 0, 0, 0); 
  
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, diffYears);
}

function buildSnapshotFromNse(json: NseOptionChainResponse, config: VegaTrendConfig): VegaSnapshot {
  const { time } = getIstParts();
  const allRows = json.data?.length
    ? json.data
    : json.filtered?.data?.length
    ? json.filtered.data
    : json.records?.data ?? [];
  const requestedExpiry = normalizeExpiryDate(config.expiryDate);
  const matchingRows = requestedExpiry
    ? allRows.filter((row) => normalizeExpiryDate(rowExpiryDate(row)) === requestedExpiry)
    : [];
  const expiryDate =
    config.expiryDate ??
    json.records?.expiryDates?.[0] ??
    allRows.map(rowExpiryDate).find((value) => value != null) ??
    null;

  const expiryRows = matchingRows.length > 0 ? matchingRows : allRows;
  const underlyingValue =
    toNumber(json.records?.underlyingValue) ??
    expiryRows.map((row) => toNumber(row.CE?.underlyingValue) ?? toNumber(row.PE?.underlyingValue)).find((value) => value != null) ??
    null;

  const strikes = Array.from(
    new Set(
      expiryRows
        .map((row) => toNumber(row.strikePrice))
        .filter((value): value is number => value != null),
    ),
  ).sort((a, b) => a - b);
  const atmStrike = nearestStrike(strikes, underlyingValue);

  if (atmStrike == null) {
    throw new Error('NSE option-chain response did not include a usable ATM strike');
  }

  const atmIndex = strikes.indexOf(atmStrike);
  const selectedStrikes = new Set(strikes); // Delta filter will naturally narrow this down

  let callTotal = 0;
  let putTotal = 0;
  let validStrikes = 0;

  const T = getTimeToExpiryYears(expiryDate);
  const r = 0.10; // Standard assumed 10% risk-free rate for Indian markets

  for (const row of expiryRows) {
    const strike = toNumber(row.strikePrice);
    if (strike == null || !selectedStrikes.has(strike)) continue;

    const callIv = impliedVolatility(row.CE) / 100;
    const putIv = impliedVolatility(row.PE) / 100;

    let includeCall = false;
    let includePut = false;

    if (callIv > 0 && underlyingValue != null) {
      const callGreeks = calculateGreeks(underlyingValue, strike, T, r, callIv, true);
      if (callGreeks.delta >= 0.05 && callGreeks.delta <= 0.60) {
        callTotal += callGreeks.vega;
        includeCall = true;
      }
    }

    if (putIv > 0 && underlyingValue != null) {
      const putGreeks = calculateGreeks(underlyingValue, strike, T, r, putIv, false);
      const absPutDelta = Math.abs(putGreeks.delta);
      if (absPutDelta >= 0.05 && absPutDelta <= 0.60) {
        putTotal += putGreeks.vega;
        includePut = true;
      }
    }

    if (includeCall || includePut) validStrikes++;
  }

  if (callTotal <= 0 && putTotal <= 0) {
    throw new Error('NSE option-chain response did not include implied-volatility data');
  }

  const roundedCall = round2(callTotal);
  const roundedPut = round2(putTotal);

  return {
    capturedAt: new Date().toISOString(),
    time,
    callTotal: roundedCall,
    putTotal: roundedPut,
    rawDiff: round2(roundedPut - roundedCall),
    expiryDate,
    underlyingValue,
    atmStrike,
    selectedStrikeCount: validStrikes,
  };
}

function getSession(now = new Date()): VegaSessionState {
  const { dateKey } = getIstParts(now);
  if (!vegaSession || vegaSession.dateKey !== dateKey) {
    // Hardcoded Day Open for 2026-06-10 — the 09:15 snapshot wasn't captured
    // with the new Black-Scholes method. Remove this override after today.
    const OVERRIDE_DATE = '2026-06-10';
    const overrideDayOpen: VegaSnapshot | null = dateKey === OVERRIDE_DATE
      ? {
          capturedAt: `${OVERRIDE_DATE}T03:45:00.000+00:00`, // 09:15 IST
          time: '09:15',
          callTotal: 197.73,
          putTotal: 194.84,
          rawDiff: -2.89,
          expiryDate: '16-Jun-2026',
          underlyingValue: null,
          atmStrike: null,
          selectedStrikeCount: 0,
        }
      : null;

    vegaSession = {
      dateKey,
      dayOpen: overrideDayOpen,
      history: [],
      // Set to current time so all previously written (stale) DB rows are excluded
      reBaselinedAt: overrideDayOpen ? new Date().toISOString() : null,
    };
  }

  return vegaSession;
}

function snapshotFromDbRow(row: VegaDbRow): VegaSnapshot {
  const callTotal = Number(row.call_vega);
  const putTotal = Number(row.put_vega);

  return {
    capturedAt: row.captured_at,
    time: row.captured_time,
    callTotal: Number.isFinite(callTotal) ? callTotal : 0,
    putTotal: Number.isFinite(putTotal) ? putTotal : 0,
    rawDiff: Number(row.diff),
    expiryDate: row.expiry_date,
    underlyingValue: toNumber(row.underlying_value),
    atmStrike: toNumber(row.atm_strike),
    selectedStrikeCount: Number(row.selected_strike_count),
  };
}

function historyFromDbRow(row: VegaDbRow, dayOpen: VegaSnapshot): VegaHistoryRow {
  const callVega = round2(Number(row.call_vega) - dayOpen.callTotal);
  const putVega = round2(Number(row.put_vega) - dayOpen.putTotal);
  const diff = round2(putVega - callVega);
  return {
    time: row.captured_time,
    capturedAt: row.captured_at,
    callVega,
    putVega,
    diff,
    trend: row.trend,
  };
}

async function fetchDbRows(dateKey: string, config: VegaTrendConfig): Promise<VegaDbRow[] | null> {
  const { data, error } = await supabase
    .from('vega_snapshots')
    .select(
      [
        'captured_at',
        'captured_time',
        'call_vega',
        'put_vega',
        'diff',
        'call_vega_change',
        'put_vega_change',
        'diff_change',
        'trend',
        'expiry_date',
        'underlying_value',
        'atm_strike',
        'selected_strike_count',
        'day_open_call_vega',
        'day_open_put_vega',
      ].join(', '),
    )
    .eq('trading_date', dateKey)
    .eq('symbol', config.symbol)
    .eq('expiry_date', config.expiryDate)
    .order('captured_at', { ascending: true });

  if (error) {
    console.warn('[NSE Vega] DB history fetch failed:', error.message);
    return null;
  }

  return (data ?? []) as unknown as VegaDbRow[];
}

async function fetchDbDayOpen(dateKey: string, config: VegaTrendConfig): Promise<VegaSnapshot | null> {
  const rows = await fetchDbRows(dateKey, config);
  return rows?.[0] ? snapshotFromDbRow(rows[0]) : null;
}

function buildSummary(
  dayOpen: VegaSnapshot,
  current: VegaSnapshot,
  diffHistory: number[],
): VegaMetricRow[] {
  const callChange = round2(current.callTotal - dayOpen.callTotal);
  const putChange = round2(current.putTotal - dayOpen.putTotal);
  const diffChange = round2(current.rawDiff - dayOpen.rawDiff);

  return [
    {
      label: 'DAY OPEN',
      callVega: dayOpen.callTotal,
      putVega: dayOpen.putTotal,
      diff: dayOpen.rawDiff,
      trend: null,
    },
    {
      label: 'CURRENT',
      callVega: current.callTotal,
      putVega: current.putTotal,
      diff: current.rawDiff,
      trend: null,
    },
    {
      label: 'DIFFERENCE',
      callVega: callChange,
      putVega: putChange,
      diff: diffChange,
      trend: getTrend({ callVega: callChange, putVega: putChange, diff: diffChange, diffHistory }),
    },
  ];
}

function upsertHistory(session: VegaSessionState, row: VegaHistoryRow) {
  const existingIndex = session.history.findIndex((item) => item.time === row.time);
  if (existingIndex >= 0) {
    session.history[existingIndex] = row;
  } else {
    session.history.push(row);
  }

  session.history = session.history
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    .slice(-MAX_HISTORY_ROWS);
}

async function persistSnapshot(
  snapshot: VegaSnapshot,
  dayOpen: VegaSnapshot,
  summary: VegaMetricRow[],
  config: VegaTrendConfig,
  dateKey: string,
) {
  const difference = summary.find((row) => row.label === 'DIFFERENCE');
  const captureStatus = getNseVegaCaptureStatus(new Date(snapshot.capturedAt));

  if (
    !captureStatus.shouldCapture ||
    difference?.callVega == null ||
    difference.putVega == null ||
    difference.diff == null ||
    !difference.trend
  ) {
    return;
  }

  const { error } = await supabase
    .from('vega_snapshots')
    .upsert(
      {
        trading_date: dateKey,
        symbol: config.symbol,
        expiry_date: config.expiryDate,
        captured_at: snapshot.capturedAt,
        captured_time: snapshot.time,
        underlying_value: snapshot.underlyingValue,
        atm_strike: snapshot.atmStrike,
        selected_strike_count: snapshot.selectedStrikeCount,
        day_open_call_vega: dayOpen.callTotal,
        day_open_put_vega: dayOpen.putTotal,
        day_open_diff: dayOpen.rawDiff,
        call_vega: snapshot.callTotal,
        put_vega: snapshot.putTotal,
        diff: snapshot.rawDiff,
        call_vega_change: difference.callVega,
        put_vega_change: difference.putVega,
        diff_change: difference.diff,
        trend: difference.trend,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'trading_date,symbol,expiry_date,captured_time' },
    );

  if (error) {
    const warning = `DB snapshot upsert failed: ${error.message}`;
    console.warn('[NSE Vega]', warning);
    return warning;
  }

  return undefined;
}

async function buildDashboardData(snapshot: VegaSnapshot, config: VegaTrendConfig): Promise<DashboardBuildResult> {
  const dateKey = getIstParts(new Date(snapshot.capturedAt)).dateKey;
  const session = getSession();

  // If we've already re-baselined this session, use the session Day Open and skip DB
  let isStaleBaseline = false;
  if (!session.reBaselinedAt) {
    const dbDayOpen = await fetchDbDayOpen(dateKey, config);

    if (!session.dayOpen && isAtOrAfterTime(snapshot.time, config.captureStartTime)) {
      session.dayOpen = dbDayOpen ?? snapshot;
    }

    const dayOpenCandidate = dbDayOpen ?? session.dayOpen ?? snapshot;

    // Guard against stale baselines: if the Day Open was captured with a different
    // calculation method (e.g. old IV-sum vs new Black-Scholes Vega), the scale
    // will be wildly different. Detect this and re-baseline with current snapshot.
    const dayOpenScale = Math.abs(dayOpenCandidate.callTotal) + Math.abs(dayOpenCandidate.putTotal);
    const currentScale = Math.abs(snapshot.callTotal) + Math.abs(snapshot.putTotal);
    const scaleRatio = currentScale > 0 ? dayOpenScale / currentScale : 1;
    isStaleBaseline = scaleRatio > 1.8 || scaleRatio < 0.55;

    if (isStaleBaseline) {
      console.warn(
        `[NSE Vega] Day Open scale mismatch detected (ratio ${scaleRatio.toFixed(2)}). ` +
        `DayOpen: ${dayOpenScale.toFixed(2)}, Current: ${currentScale.toFixed(2)}. Re-baselining.`
      );
      session.dayOpen = snapshot;
      session.history = []; // Clear stale history
      session.reBaselinedAt = snapshot.capturedAt;
    } else {
      session.dayOpen = dayOpenCandidate;
    }
  }

  const dayOpen = session.dayOpen ?? snapshot;
  const historyDiffs = session.history.map((row) => row.diff);
  const summary = buildSummary(dayOpen, snapshot, historyDiffs);
  const difference = summary.find((row) => row.label === 'DIFFERENCE');

  if (difference?.callVega != null && difference.putVega != null && difference.diff != null && difference.trend) {
    upsertHistory(session, {
      time: snapshot.time,
      capturedAt: snapshot.capturedAt,
      callVega: difference.callVega,
      putVega: difference.putVega,
      diff: difference.diff,
      trend: difference.trend,
    });
  }

  const dbWarning = await persistSnapshot(snapshot, dayOpen, summary, config, dateKey);

  // Recalculate ALL DB rows from their absolute values against the current Day Open
  let history: VegaHistoryRow[];
  const dbRows = await fetchDbRows(dateKey, config);
  if (dbRows?.length && dayOpen) {
    history = dbRows.map((r) => historyFromDbRow(r, dayOpen));
    // Recompute trends using recalculated values
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      const prevDiffs = history.slice(0, i).map((p) => p.diff);
      h.trend = getTrend({ callVega: h.callVega, putVega: h.putVega, diff: h.diff, diffHistory: prevDiffs });
    }
  } else {
    history = session.history;
  }

  return {
    data: {
      symbol: config.symbol,
      expiryDate: snapshot.expiryDate,
      underlyingValue: snapshot.underlyingValue,
      atmStrike: snapshot.atmStrike,
      selectedStrikeCount: snapshot.selectedStrikeCount,
      summary,
      history,
      config,
    },
    warning: dbWarning,
  };
}

function addMinutesToTime(startTime: string, offset: number): string {
  const minutes = parseTimeToMinutes(startTime) + offset;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function buildMockDashboard(config: VegaTrendConfig): VegaDashboardData {
  const now = new Date();
  const { dateKey, time } = getIstParts(now);
  const minutesSinceStart = Math.max(0, parseTimeToMinutes(time) - parseTimeToMinutes(config.captureStartTime));
  const rowCount = Math.min(36, Math.max(1, minutesSinceStart + 1));
  const firstOffset = Math.max(0, minutesSinceStart - rowCount + 1);
  const baseCall = 197.73;
  const basePut = 194.84;
  const history: VegaHistoryRow[] = [];

  for (let i = 0; i < rowCount; i += 1) {
    const minuteOffset = firstOffset + i;
    const callChange = round2(Math.sin(minuteOffset * 0.52) * 4.7 - minuteOffset * 0.16);
    const putChange = round2(Math.cos(minuteOffset * 0.41) * 3.2 - minuteOffset * 0.11);
    const diff = round2(putChange - callChange);
    const rowTime = addMinutesToTime(config.captureStartTime, minuteOffset);

    history.push({
      time: rowTime,
      capturedAt: `${dateKey}T${rowTime}:00+05:30`,
      callVega: callChange,
      putVega: putChange,
      diff: diff,
      trend: getTrend({ callVega: callChange, putVega: putChange, diff, diffHistory: history.map((r) => r.diff) }),
    });
  }

  const latest = history[history.length - 1];
  const currentCall = round2(baseCall + latest.callVega);
  const currentPut = round2(basePut + latest.putVega);
  const dayOpen: VegaSnapshot = {
    capturedAt: `${dateKey}T${config.captureStartTime}:00+05:30`,
    time: config.captureStartTime,
    callTotal: baseCall,
    putTotal: basePut,
    rawDiff: round2(basePut - baseCall),
    expiryDate: config.expiryDate,
    underlyingValue: 23_396.8,
    atmStrike: 23_400,
    selectedStrikeCount: config.strikeWindow * 2 + 1,
  };
  const current: VegaSnapshot = {
    ...dayOpen,
    capturedAt: latest.capturedAt,
    time: latest.time,
    callTotal: currentCall,
    putTotal: currentPut,
    rawDiff: round2(currentPut - currentCall),
  };

    return {
      symbol: config.symbol,
    expiryDate: current.expiryDate,
    underlyingValue: current.underlyingValue,
    atmStrike: current.atmStrike,
      selectedStrikeCount: current.selectedStrikeCount,
      summary: buildSummary(dayOpen, current, history.map((r) => r.diff)),
      history,
    config,
  };
}

export interface FetchVegaResult {
  data: VegaDashboardData;
  source: VegaApiResponse['source'];
  warning?: string;
}

export async function fetchNseVegaDashboard(): Promise<FetchVegaResult> {
  const config = getConfig();

  if (readEnv('USE_MOCK_DATA') === 'true') {
    return {
      data: buildMockDashboard(config),
      source: 'mock',
    };
  }

  try {
    const optionChain = await fetchOptionChain(config);
    const snapshot = buildSnapshotFromNse(optionChain, config);
    const dashboard = await buildDashboardData(snapshot, config);

    return {
      data: dashboard.data,
      source: 'live',
      warning: dashboard.warning,
    };
  } catch (err) {
    const warning = (err as Error).message.replace(/\s+/g, ' ').trim();
    console.error('[NSE Vega] Live fetch failed, falling back to mock:', warning);

    return {
      data: buildMockDashboard(config),
      source: 'mock',
      warning,
    };
  }
}
