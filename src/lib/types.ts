// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types for Bank Nifty Dashboard
// ─────────────────────────────────────────────────────────────────────────────

// ── Live BNF Data ─────────────────────────────────────────────────────────────

export type SignalDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface BNFInstrumentData {
  instrument: string;
  /** Current Market Price */
  cmp: number | null;
  /** Futures price */
  future: number | null;
  /** Options max pain level */
  maxPain: number | null;
  /** 2-hour timeframe signal */
  signal2h: SignalDirection | null;
  /** Active option strike level */
  strike: number | null;
  /** Approx entry at 5% above CMP */
  entry5pct: number | null;
  /** Whether price has broken out above strike */
  breakout: 'YES' | 'NO' | null;
}

export interface BNFApiResponse {
  data: BNFInstrumentData[];
  lastUpdated: string; // ISO 8601
  source: 'live' | 'mock';
  warning?: string;
}

// ── ATM Vega Trend Dashboard ─────────────────────────────────────────────────

export type VegaTrendSignal =
  | 'BULLISH'
  | 'BEARISH'
  | 'SIDEWAYS BULLISH'
  | 'SIDEWAYS BEARISH'
  | 'SIDEWAYS';

export interface VegaTrendRule {
  signal: VegaTrendSignal;
  minDiff: number;
  maxDiff: number;
}

export interface VegaTrendConfig {
  symbol: string;
  expiryDate: string;
  strikeWindow: number;
  captureStartTime: string;
  captureEndTime: string;
  pollIntervalMs: number;
  rules: VegaTrendRule[];
}

export interface VegaMetricRow {
  label: 'DAY OPEN' | 'CURRENT' | 'DIFFERENCE';
  callVega: number | null;
  putVega: number | null;
  diff: number | null;
  trend: VegaTrendSignal | null;
}

export interface VegaHistoryRow {
  time: string;
  capturedAt: string;
  callVega: number;
  putVega: number;
  diff: number;
  trend: VegaTrendSignal;
}

export interface VegaDashboardData {
  symbol: string;
  expiryDate: string | null;
  underlyingValue: number | null;
  atmStrike: number | null;
  selectedStrikeCount: number;
  summary: VegaMetricRow[];
  history: VegaHistoryRow[];
  config: VegaTrendConfig;
}

export interface VegaApiResponse {
  data: VegaDashboardData;
  lastUpdated: string;
  source: 'live' | 'mock';
  warning?: string;
}

// ── Admin Notes ───────────────────────────────────────────────────────────────

export interface AdminNote {
  id: string;
  title: string;
  description: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ── Weightage Chart ───────────────────────────────────────────────────────────

export interface WeightageEntry {
  /** Short ticker symbol */
  name: string;
  /** Full company name */
  fullName: string;
  /** Index weightage as a percentage, e.g. 26.5 */
  weightage: number;
  /** Hex color for chart */
  color: string;
}

// ── Auth scaffold (no-op now, ready to extend) ────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
}

export type AuthContext = {
  user: User | null;
  isAuthenticated: boolean;
};
