/**
 * Firstock API Adapter — corrected per official docs
 * ─────────────────────────────────────────────────────────────────────────────
 * Docs: https://firstock.in/api/docs/login/
 *       https://firstock.in/api/docs/get-quote/
 *
 * Key facts confirmed from docs:
 *  • Base URL: https://api.firstock.in/V1  (NOT connect.thefirstock.com)
 *  • Login body fields: userId, password (SHA256), TOTP/factor2, vendorCode, apiKey
 *  • Session token field: data.susertoken  (also called jKey in subsequent calls)
 *  • Get Quote body: userId, jKey, exchange, tradingSymbol
 *  • Prices returned as integer strings scaled by pricePrecision
 *    e.g. lastTradedPrice "2417780" with pricePrecision "2" → 24177.80
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { BNFInstrumentData, SignalDirection } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

const FIRSTOCK_BASE = 'https://api.firstock.in/V1';

// Instrument → Firstock tradingSymbol + exchange mapping
// NSE equity: "SYMBOL-EQ" on exchange "NSE"
// NSE index:  "BANKNIFTY" on exchange "NSE"
const INSTRUMENT_MAP: Record<string, { exchange: string; tradingSymbol: string }> = {
  BNF:        { exchange: 'NSE', tradingSymbol: 'BANKNIFTY'      },
  HDFCBANK:   { exchange: 'NSE', tradingSymbol: 'HDFCBANK-EQ'    },
  ICICIBANK:  { exchange: 'NSE', tradingSymbol: 'ICICIBANK-EQ'   },
  AXISBANK:   { exchange: 'NSE', tradingSymbol: 'AXISBANK-EQ'    },
  KOTAKBANK:  { exchange: 'NSE', tradingSymbol: 'KOTAKBANK-EQ'   },
  SBIN:       { exchange: 'NSE', tradingSymbol: 'SBIN-EQ'        },
  FEDERALBNK: { exchange: 'NSE', tradingSymbol: 'FEDERALBNK-EQ'  },
  INDUSINDBK: { exchange: 'NSE', tradingSymbol: 'INDUSINDBK-EQ'  },
  AUBANK:     { exchange: 'NSE', tradingSymbol: 'AUBANK-EQ'      },
  BANKBARODA: { exchange: 'NSE', tradingSymbol: 'BANKBARODA-EQ'  },
  IDFCFIRSTB: { exchange: 'NSE', tradingSymbol: 'IDFCFIRSTB-EQ'  },
};

export const BNF_INSTRUMENTS = Object.keys(INSTRUMENT_MAP) as (keyof typeof INSTRUMENT_MAP)[];
export type BNFInstrument = (typeof BNF_INSTRUMENTS)[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** SHA256 hash — required for Firstock password field */
function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Firstock returns prices as integer strings scaled by pricePrecision.
 * e.g. "2417780" with precision "2" → 24177.80
 * Default precision is 2 (paise).
 */
function parsePrice(raw: string | undefined, precision = 2): number | null {
  const value = raw?.trim() ?? '';
  const n = parseFloat(value);
  if (isNaN(n) || n === 0) return null;

  if (value.includes('.')) {
    return parseFloat(n.toFixed(2));
  }

  return parseFloat((n / Math.pow(10, precision)).toFixed(2));
}

function parseEnvValue(raw: string): string {
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readLocalEnvValue(name: string): { found: boolean; value?: string } {
  if (process.env.NODE_ENV === 'production') return { found: false };

  const envPath = join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return { found: false };

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lineRegex = new RegExp(`^\\s*(?:export\\s+)?${escapedName}\\s*=\\s*(.*)$`, 'm');
  const match = readFileSync(envPath, 'utf8').match(lineRegex);

  return match ? { found: true, value: parseEnvValue(match[1]) } : { found: false };
}

function readEnv(name: string): string | undefined {
  const localValue = readLocalEnvValue(name);
  const rawValue = localValue.found ? localValue.value : process.env[name];
  const value = rawValue?.trim();
  return value ? value : undefined;
}

interface FirstockCredentialFile {
  userId?: string;
  password?: string;
  TOTP?: string;
  factor2?: string;
  vendorCode?: string;
  apiKey?: string;
}

interface FirstockQuoteRow {
  exchange?: string;
  tradingSymbol?: string;
  lastTradedPrice?: string;
  pricePrecision?: string;
}

interface NfoSymbolRow {
  symbol: string;
  tradingSymbol: string;
  expiry: string;
  instrument: string;
  optionType: string;
  strikePrice: number;
}

interface OptionChainGreekRow {
  optionType?: string;
  strikePrice?: string;
  oi?: string;
}

interface SupertrendRow {
  tradingSymbol?: string;
  lastTradedPrice?: number | string;
  superTrend?: number | string;
  error?: string;
}

function readCredentialFile(): FirstockCredentialFile {
  // 1. Support inline JSON via env var (works on Vercel / serverless)
  const inlineJson = readEnv('FIRSTOCK_CREDENTIALS_JSON');
  if (inlineJson) {
    try {
      return JSON.parse(inlineJson) as FirstockCredentialFile;
    } catch (err) {
      console.warn('[Firstock] Could not parse FIRSTOCK_CREDENTIALS_JSON:', (err as Error).message);
      return {};
    }
  }

  // 2. Fall back to credentials file on disk (local dev only)
  const credentialsPath = readEnv('FIRSTOCK_CREDENTIALS_FILE');
  if (!credentialsPath) return {};

  const absolutePath = credentialsPath.startsWith('/')
    ? credentialsPath
    : join(process.cwd(), credentialsPath);

  if (!existsSync(absolutePath)) {
    // Soft warning instead of hard error — env vars are the primary source
    console.warn(`[Firstock] FIRSTOCK_CREDENTIALS_FILE not found: ${absolutePath} (falling back to env vars)`);
    return {};
  }

  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8')) as FirstockCredentialFile;
  } catch (err) {
    console.warn(`[Firstock] Could not read FIRSTOCK_CREDENTIALS_FILE: ${(err as Error).message}`);
    return {};
  }
}

function firstSet(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value != null && value.trim() !== '')?.trim();
}

const MONTHS: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

function parseFirstockCsv(text: string): Record<string, string>[] {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(',');

  return lines
    .filter(Boolean)
    .map((line) => {
      const cells = line.split(',');
      return headers.reduce<Record<string, string>>((row, header, index) => {
        row[header] = cells[index] ?? '';
        return row;
      }, {});
    });
}

function parseExpiryDate(expiry: string): Date | null {
  const match = expiry.toUpperCase().match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  const monthIndex = MONTHS[month];
  if (monthIndex == null) return null;

  return new Date(Number(year), monthIndex, Number(day), 23, 59, 59);
}

function formatExpiryForOptionChain(expiry: string): string {
  const match = expiry.toUpperCase().match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/);
  if (!match) return expiry;

  const [, day, month, year] = match;
  return `${day.padStart(2, '0')}${month}${year.slice(-2)}`;
}

function instrumentToNfoSymbol(instrument: string): string {
  return instrument === 'BNF' ? 'BANKNIFTY' : instrument;
}

function nearestStrike(strikes: number[], cmp: number | null | undefined): number | null {
  if (!cmp || strikes.length === 0) return null;
  return strikes.reduce((best, strike) => (
    Math.abs(strike - cmp) < Math.abs(best - cmp) ? strike : best
  ), strikes[0]);
}

function addLoginFactorHint(message: string): string {
  if (!/otp|totp|factor/i.test(message)) return message;

  return `${message}. This adapter now follows the working firstock Python SDK method: it sends the raw configured login factor as the TOTP field. Verify FIRSTOCK_FACTOR2 or the TOTP value in FIRSTOCK_CREDENTIALS_FILE matches the value used by /Users/santosh/Downloads/10-firstock.`;
}

// ── Session token cache (server-side in-memory) ────────────────────────────────
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

function clearSessionToken() {
  _cachedToken = null;
  _tokenExpiry = 0;
}

async function getSessionToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && _cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  if (forceRefresh) clearSessionToken();

  const fileCredentials = readCredentialFile();
  const userId = firstSet(readEnv('FIRSTOCK_USER_ID'), fileCredentials.userId);
  const password = firstSet(readEnv('FIRSTOCK_PASSWORD'), fileCredentials.password);
  const loginFactor = firstSet(
    readEnv('FIRSTOCK_FACTOR2'),
    readEnv('FIRSTOCK_DOB_OR_PAN'),
    fileCredentials.TOTP,
    fileCredentials.factor2,
    readEnv('FIRSTOCK_TOTP'),
    readEnv('FIRSTOCK_TOTP_CODE'),
  );
  const vendorCode = firstSet(readEnv('FIRSTOCK_VENDOR_CODE'), fileCredentials.vendorCode);
  const apiKey = firstSet(readEnv('FIRSTOCK_API_KEY'), fileCredentials.apiKey);

  if (!userId) throw new Error('[Firstock] FIRSTOCK_USER_ID not set');
  if (!password) throw new Error('[Firstock] FIRSTOCK_PASSWORD not set');
  if (!loginFactor) throw new Error('[Firstock] Login factor not set. Set FIRSTOCK_FACTOR2 or FIRSTOCK_CREDENTIALS_FILE.');
  if (!vendorCode) throw new Error('[Firstock] FIRSTOCK_VENDOR_CODE not set');
  if (!apiKey) throw new Error('[Firstock] FIRSTOCK_API_KEY not set');

  const body: Record<string, string | undefined> = {
    userId,
    password:   sha256(password),           // ← SHA256 required by Firstock
    TOTP:       loginFactor,                // ← raw factor2, matching the firstock Python SDK
    vendorCode,
    apiKey,                                 // ← "apiKey", not "apiSecret"
  };

  console.info('[Firstock] Attempting login for userId:', body.userId, '(SDK-style raw factor login)');

  const res = await fetch(`${FIRSTOCK_BASE}/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    cache:   'no-store',
  });

  const text = await res.text();

  // Guard: Firstock sometimes returns HTML on bad requests
  if (text.trimStart().startsWith('<')) {
    throw new Error(`[Firstock] Login returned HTML (likely wrong URL or network redirect). Status: ${res.status}`);
  }

  let json: any;
  try { json = JSON.parse(text); }
  catch { throw new Error(`[Firstock] Login response is not JSON: ${text.slice(0, 200)}`); }

  if (json?.status !== 'success') {
    const message = json?.error?.message ?? JSON.stringify(json);
    throw new Error(`[Firstock] Login failed: ${addLoginFactorHint(message)}`);
  }

  const token: string = json?.data?.susertoken;
  if (!token) throw new Error('[Firstock] No susertoken in login response');

  console.info('[Firstock] Login successful');
  _cachedToken = token;
  _tokenExpiry = Date.now() + 6 * 60 * 60 * 1000; // cache 6 hours
  return token;
}

// ── Quote fetcher ─────────────────────────────────────────────────────────────

async function fetchQuote(
  jKey: string,
  userId: string,
  instrument: string,
): Promise<Partial<BNFInstrumentData>> {
  const map = INSTRUMENT_MAP[instrument];
  if (!map) throw new Error(`[Firstock] Unknown instrument: ${instrument}`);

  const res = await fetch(`${FIRSTOCK_BASE}/getQuote`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    cache:   'no-store',
    body: JSON.stringify({
      userId,
      jKey,
      exchange:      map.exchange,
      tradingSymbol: map.tradingSymbol,
    }),
  });

  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error(`[Firstock] getQuote returned HTML for ${instrument}`);

  const json = JSON.parse(text);
  if (json?.status !== 'success') {
    throw new Error(`[Firstock] getQuote failed for ${instrument}: ${json?.error?.message ?? JSON.stringify(json)}`);
  }

  // Response: data is an array; take first element
  const d = Array.isArray(json.data) ? json.data[0] : json.data;
  const precision = parseInt(d?.pricePrecision ?? '2', 10);

  const cmp = parsePrice(d?.lastTradedPrice, precision);

  return {
    cmp,
    // Firstock getQuote doesn't return futures price — set to null; fetch separately via NFO if needed
    future:   null,
    maxPain:  null,  // Compute from option chain data (use /api/docs/option-chain-with-greeks/)
    signal2h: null,  // Compute from candle data (use /api/docs/time-price-regular-interval/)
    strike:   null,
  };
}

async function fetchMultiQuoteRows(
  jKey: string,
  userId: string,
  data: { exchange: string; tradingSymbol: string }[],
): Promise<FirstockQuoteRow[]> {
  const res = await fetch(`${FIRSTOCK_BASE}/getMultiQuotes`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    cache:   'no-store',
    body: JSON.stringify({
      userId,
      jKey,
      data,
    }),
  });

  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('[Firstock] getMultiQuotes returned HTML');

  let json: any;
  try { json = JSON.parse(text); }
  catch { throw new Error(`[Firstock] getMultiQuotes response is not JSON: ${text.slice(0, 200)}`); }

  if (json?.status !== 'success') {
    throw new Error(`[Firstock] getMultiQuotes failed: ${json?.error?.message ?? JSON.stringify(json)}`);
  }

  return Array.isArray(json.data) ? json.data : [];
}

async function fetchQuotes(
  jKey: string,
  userId: string,
): Promise<Record<string, Partial<BNFInstrumentData>>> {
  const rows = await fetchMultiQuoteRows(
    jKey,
    userId,
    BNF_INSTRUMENTS.map((inst) => INSTRUMENT_MAP[inst]),
  );

  const rowsBySymbol = new Map<string, FirstockQuoteRow>(
    rows
      .filter((row) => row.tradingSymbol)
      .map((row) => [row.tradingSymbol as string, row]),
  );

  return BNF_INSTRUMENTS.reduce<Record<string, Partial<BNFInstrumentData>>>((quotes, inst) => {
    const map = INSTRUMENT_MAP[inst];
    const row = rowsBySymbol.get(map.tradingSymbol);

    if (!row) {
      console.error(`[BNF] Quote missing for ${inst}`);
      quotes[inst] = { cmp: null, future: null, maxPain: null, signal2h: null, strike: null };
      return quotes;
    }

    const precision = parseInt(row?.pricePrecision ?? '2', 10);
    quotes[inst] = {
      cmp: parsePrice(row?.lastTradedPrice, precision),
      future:   null,
      maxPain:  null,
      signal2h: null,
      strike:   null,
    };

    return quotes;
  }, {});
}

let _nfoSymbolsCache: { expiresAt: number; rows: NfoSymbolRow[] } | null = null;

async function fetchNfoSymbolRows(): Promise<NfoSymbolRow[]> {
  if (_nfoSymbolsCache && Date.now() < _nfoSymbolsCache.expiresAt) {
    return _nfoSymbolsCache.rows;
  }

  const res = await fetch(`${FIRSTOCK_BASE}/symbols/NFO`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`[Firstock] NFO symbol download failed: HTTP ${res.status}`);

  const csv = await res.text();
  const rows = parseFirstockCsv(csv)
    .map<NfoSymbolRow>((row) => ({
      symbol: row.Symbol,
      tradingSymbol: row.TradingSymbol,
      expiry: row.Expiry,
      instrument: row.Instrument,
      optionType: row.OptionType,
      strikePrice: Number(row.StrikePrice),
    }))
    .filter((row) => row.symbol && row.tradingSymbol && row.expiry);

  _nfoSymbolsCache = {
    rows,
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
  };
  return rows;
}

function currentDerivativeRows(rows: NfoSymbolRow[], symbol: string, instruments: string[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return rows
    .filter((row) => {
      const expiry = parseExpiryDate(row.expiry);
      return (
        row.symbol === symbol &&
        instruments.includes(row.instrument) &&
        expiry != null &&
        expiry >= today
      );
    })
    .sort((a, b) => (
      (parseExpiryDate(a.expiry)?.getTime() ?? 0) -
      (parseExpiryDate(b.expiry)?.getTime() ?? 0)
    ));
}

function calculateMaxPain(rows: OptionChainGreekRow[]): number | null {
  const strikes = new Map<number, { ceOi: number; peOi: number }>();

  for (const row of rows) {
    const strike = Number(row.strikePrice);
    const oi = Number(row.oi);
    if (!Number.isFinite(strike) || !Number.isFinite(oi)) continue;

    const bucket = strikes.get(strike) ?? { ceOi: 0, peOi: 0 };
    if (row.optionType === 'CE') bucket.ceOi += oi;
    if (row.optionType === 'PE') bucket.peOi += oi;
    strikes.set(strike, bucket);
  }

  const strikePrices = Array.from(strikes.keys()).sort((a, b) => a - b);
  if (strikePrices.length === 0) return null;

  let bestStrike = strikePrices[0];
  let lowestPain = Number.POSITIVE_INFINITY;

  for (const settlement of strikePrices) {
    let pain = 0;

    for (const [strike, oi] of Array.from(strikes.entries())) {
      pain += oi.ceOi * Math.max(0, settlement - strike);
      pain += oi.peOi * Math.max(0, strike - settlement);
    }

    if (pain < lowestPain) {
      lowestPain = pain;
      bestStrike = settlement;
    }
  }

  return bestStrike;
}

async function fetchMaxPain(
  jKey: string,
  userId: string,
  symbol: string,
  expiry: string,
  strike: number,
): Promise<number | null> {
  const res = await fetch(`${FIRSTOCK_BASE}/optionChainGreeks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      userId,
      jKey,
      exchange: 'NFO',
      symbol,
      expiry: formatExpiryForOptionChain(expiry),
      strikePrice: String(strike),
      count: readEnv('FIRSTOCK_OPTION_CHAIN_COUNT') ?? '20',
    }),
  });

  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); }
  catch { throw new Error(`[Firstock] optionChainGreeks response is not JSON: ${text.slice(0, 200)}`); }

  if (json?.status !== 'success') {
    throw new Error(`[Firstock] optionChainGreeks failed for ${symbol}: ${json?.error?.message ?? JSON.stringify(json)}`);
  }

  return calculateMaxPain(Array.isArray(json.data) ? json.data : []);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSignals(
  jKey: string,
  userId: string,
): Promise<Record<string, SignalDirection | null>> {
  const signals: Record<string, SignalDirection | null> = {};
  const interval = readEnv('FIRSTOCK_SIGNAL_INTERVAL') ?? '30mi';
  const period = Number(readEnv('FIRSTOCK_SUPERTREND_PERIOD') ?? '10');
  const multiplier = Number(readEnv('FIRSTOCK_SUPERTREND_MULTIPLIER') ?? '3');

  for (let i = 0; i < BNF_INSTRUMENTS.length; i += 4) {
    const chunk = BNF_INSTRUMENTS.slice(i, i + 4);

    try {
      const res = await fetch(`${FIRSTOCK_BASE}/indicators/supertrend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          userId,
          jKey,
          exchange: 'NSE',
          tradingSymbol: chunk.map((inst) => INSTRUMENT_MAP[inst].tradingSymbol),
          interval,
          period,
          multiplier,
        }),
      });

      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); }
      catch { throw new Error(`[Firstock] supertrend response is not JSON: ${text.slice(0, 200)}`); }

      if (json?.status !== 'success') {
        throw new Error(json?.error?.message ?? JSON.stringify(json));
      }

      const rows: SupertrendRow[] = Array.isArray(json.data) ? json.data : [json.data];
      const rowsBySymbol = new Map(rows.map((row) => [row.tradingSymbol, row]));

      for (const inst of chunk) {
        const row = rowsBySymbol.get(INSTRUMENT_MAP[inst].tradingSymbol);
        const price = Number(row?.lastTradedPrice);
        const superTrend = Number(row?.superTrend);

        signals[inst] =
          Number.isFinite(price) && Number.isFinite(superTrend)
            ? Math.abs(price - superTrend) / superTrend < 0.001
              ? 'NEUTRAL'
              : price > superTrend
              ? 'BULLISH'
              : 'BEARISH'
            : null;
      }
    } catch (err) {
      console.warn('[BNF] Signal fetch failed:', (err as Error).message);
      for (const inst of chunk) signals[inst] = null;
    }

    if (i + 4 < BNF_INSTRUMENTS.length) await sleep(150);
  }

  return signals;
}

async function fetchDerivativeMetrics(
  jKey: string,
  userId: string,
  quotes: Record<string, Partial<BNFInstrumentData>>,
): Promise<Record<string, Partial<BNFInstrumentData>>> {
  const nfoRows = await fetchNfoSymbolRows();
  const metrics: Record<string, Partial<BNFInstrumentData>> = {};
  const futures: { inst: string; tradingSymbol: string }[] = [];
  const optionLookups: { inst: string; symbol: string; expiry: string; strike: number }[] = [];

  for (const inst of BNF_INSTRUMENTS) {
    const symbol = instrumentToNfoSymbol(inst);
    const future = currentDerivativeRows(nfoRows, symbol, ['FUTIDX', 'FUTSTK'])[0];
    if (future) futures.push({ inst, tradingSymbol: future.tradingSymbol });

    const optionRows = currentDerivativeRows(nfoRows, symbol, ['OPTIDX', 'OPTSTK']);
    const optionExpiry = optionRows[0]?.expiry;
    const strikes = Array.from(
      new Set(
        optionRows
          .filter((row) => row.expiry === optionExpiry && Number.isFinite(row.strikePrice))
          .map((row) => row.strikePrice),
      ),
    );
    const strike = nearestStrike(strikes, quotes[inst]?.cmp);

    metrics[inst] = { strike };
    if (optionExpiry && strike != null) {
      optionLookups.push({ inst, symbol, expiry: optionExpiry, strike });
    }
  }

  if (futures.length > 0) {
    const futureRows = await fetchMultiQuoteRows(
      jKey,
      userId,
      futures.map((future) => ({ exchange: 'NFO', tradingSymbol: future.tradingSymbol })),
    );
    const rowsBySymbol = new Map(futureRows.map((row) => [row.tradingSymbol, row]));

    for (const future of futures) {
      const row = rowsBySymbol.get(future.tradingSymbol);
      metrics[future.inst] = {
        ...metrics[future.inst],
        future: parsePrice(row?.lastTradedPrice, parseInt(row?.pricePrecision ?? '2', 10)),
      };
    }
  }

  for (const lookup of optionLookups) {
    try {
      const maxPain = await fetchMaxPain(jKey, userId, lookup.symbol, lookup.expiry, lookup.strike);
      metrics[lookup.inst] = { ...metrics[lookup.inst], maxPain };
    } catch (err) {
      console.warn(`[BNF] Max pain fetch failed for ${lookup.inst}:`, (err as Error).message);
    }

    await sleep(120);
  }

  return metrics;
}

// ── Mock data (fallback when credentials absent or USE_MOCK_DATA=true) ─────────

function buildMockData(): BNFInstrumentData[] {
  const seed: Record<string, Omit<BNFInstrumentData, 'instrument' | 'entry5pct' | 'breakout'>> = {
    BNF:        { cmp: 52340, future: 52410, maxPain: 52000, signal2h: 'BULLISH', strike: 52500 },
    HDFCBANK:   { cmp: 1720,  future: 1725,  maxPain: 1700,  signal2h: 'BULLISH', strike: 1750  },
    ICICIBANK:  { cmp: 1245,  future: 1248,  maxPain: 1200,  signal2h: 'NEUTRAL', strike: 1250  },
    AXISBANK:   { cmp: 1158,  future: 1162,  maxPain: 1150,  signal2h: 'BULLISH', strike: 1200  },
    KOTAKBANK:  { cmp: 1938,  future: 1942,  maxPain: 1900,  signal2h: 'NEUTRAL', strike: 1950  },
    SBIN:       { cmp: 832,   future: 835,   maxPain: 820,   signal2h: 'BEARISH', strike: 840   },
    FEDERALBNK: { cmp: 212,   future: 213,   maxPain: 205,   signal2h: 'NEUTRAL', strike: 215   },
    INDUSINDBK: { cmp: 1045,  future: 1048,  maxPain: 1000,  signal2h: 'BEARISH', strike: 1050  },
    AUBANK:     { cmp: 695,   future: 697,   maxPain: 680,   signal2h: 'NEUTRAL', strike: 700   },
    BANKBARODA: { cmp: 265,   future: 266,   maxPain: 260,   signal2h: 'BULLISH', strike: 270   },
    IDFCFIRSTB: { cmp: 78,    future: 78.5,  maxPain: 75,    signal2h: 'NEUTRAL', strike: 80    },
  };

  return BNF_INSTRUMENTS.map((inst) => {
    const row = seed[inst] ?? { cmp: null, future: null, maxPain: null, signal2h: null, strike: null };
    const entry5pct = row.cmp != null ? parseFloat((row.cmp * 1.05).toFixed(2)) : null;
    const breakout: BNFInstrumentData['breakout'] =
      row.cmp != null && row.strike != null
        ? row.cmp > row.strike ? 'YES' : 'NO'
        : null;
    return { instrument: inst, ...row, entry5pct, breakout };
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface FetchBNFResult {
  data: BNFInstrumentData[];
  source: 'live' | 'mock';
  warning?: string;
}

export async function fetchBNFData(): Promise<FetchBNFResult> {
  if (readEnv('USE_MOCK_DATA') === 'true') {
    console.info('[BNF] Using mock data');
    return { data: buildMockData(), source: 'mock' };
  }

  try {
    const fileCredentials = readCredentialFile();
    const userId = firstSet(readEnv('FIRSTOCK_USER_ID'), fileCredentials.userId);
    const apiKey = firstSet(readEnv('FIRSTOCK_API_KEY'), fileCredentials.apiKey);

    if (!userId || !apiKey) {
      console.info('[BNF] Using mock data');
      return { data: buildMockData(), source: 'mock' };
    }

    const jKey = await getSessionToken();
    let quotes: Record<string, Partial<BNFInstrumentData>>;

    try {
      quotes = await fetchQuotes(jKey, userId);
    } catch (err) {
      if (!/invalid credentials|session expired/i.test((err as Error).message)) throw err;

      console.warn('[Firstock] Cached session rejected; refreshing session token and retrying quotes');
      quotes = await fetchQuotes(await getSessionToken(true), userId);
    }

    const [derivativeResult, signalResult] = await Promise.allSettled([
      fetchDerivativeMetrics(jKey, userId, quotes),
      fetchSignals(jKey, userId),
    ]);

    const derivatives =
      derivativeResult.status === 'fulfilled' ? derivativeResult.value : {};
    const signals =
      signalResult.status === 'fulfilled' ? signalResult.value : {};

    if (derivativeResult.status === 'rejected') {
      console.warn('[BNF] Derivative enrichment failed:', derivativeResult.reason?.message ?? derivativeResult.reason);
    }
    if (signalResult.status === 'rejected') {
      console.warn('[BNF] Signal enrichment failed:', signalResult.reason?.message ?? signalResult.reason);
    }

    const data: BNFInstrumentData[] = BNF_INSTRUMENTS.map((inst) => {
      const partial = {
        ...(quotes[inst] ?? {}),
        ...(derivatives[inst] ?? {}),
        signal2h: signals[inst] ?? derivatives[inst]?.signal2h ?? quotes[inst]?.signal2h ?? null,
      };
      const entry5pct = partial.cmp ? parseFloat((partial.cmp * 1.05).toFixed(2)) : null;
      const breakout: BNFInstrumentData['breakout'] =
        partial.cmp && partial.strike ? (partial.cmp > partial.strike ? 'YES' : 'NO') : null;
      return {
        instrument: inst,
        cmp: null, future: null, maxPain: null, strike: null,
        ...partial,
        entry5pct,
        breakout,
      };
    });

    return { data, source: 'live' };
  } catch (err) {
    const warning = (err as Error).message;
    console.error('[BNF] Live fetch failed, falling back to mock:', warning);
    return { data: buildMockData(), source: 'mock', warning };
  }
}
