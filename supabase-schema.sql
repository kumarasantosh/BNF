-- ═══════════════════════════════════════════════════════════════════════════════
-- Bank Nifty Dashboard — Supabase Schema
-- Run this in your Supabase SQL Editor (https://app.supabase.com → SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Bank Nifty Constituent Weightage ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS weightage (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,       -- Ticker symbol, e.g. 'HDFCBANK'
  full_name   TEXT NOT NULL,              -- Full name, e.g. 'HDFC Bank'
  weightage   NUMERIC(5,2) NOT NULL,      -- Percentage, e.g. 17.93
  color       TEXT NOT NULL,              -- Hex color for charts, e.g. '#3b82f6'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with current Bank Nifty weightage (source: NSE)
INSERT INTO weightage (name, full_name, weightage, color) VALUES
  ('HDFCBANK',   'HDFC Bank',            17.93, '#3b82f6'),
  ('ICICIBANK',  'ICICI Bank',           13.63, '#8b5cf6'),
  ('AXISBANK',   'Axis Bank',            10.28, '#10b981'),
  ('KOTAKBANK',  'Kotak Mahindra Bank',   9.81, '#06b6d4'),
  ('SBIN',       'State Bank of India',   9.07, '#f59e0b'),
  ('FEDERALBNK', 'Federal Bank',          6.38, '#14b8a6'),
  ('INDUSINDBK', 'IndusInd Bank',         5.40, '#ef4444'),
  ('AUBANK',     'AU Small Finance Bank', 4.87, '#f97316'),
  ('BANKBARODA', 'Bank of Baroda',        4.47, '#a855f7'),
  ('IDFCFIRSTB', 'IDFC First Bank',       4.27, '#64748b'),
  ('Others',     'Others',               13.89, '#374151')
ON CONFLICT (name) DO NOTHING;

-- ── 2. Admin Notes ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_notes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Vega Minute Snapshots ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vega_snapshots (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trading_date          DATE NOT NULL,
  symbol                TEXT NOT NULL,
  expiry_date           TEXT NOT NULL,
  captured_at           TIMESTAMPTZ NOT NULL,
  captured_time         TEXT NOT NULL,       -- HH:MM in Asia/Kolkata
  underlying_value      NUMERIC(12,2),
  atm_strike            NUMERIC(12,2),
  selected_strike_count INTEGER NOT NULL,
  day_open_call_vega    NUMERIC(12,2) NOT NULL,
  day_open_put_vega     NUMERIC(12,2) NOT NULL,
  day_open_diff         NUMERIC(12,2) NOT NULL,
  call_vega             NUMERIC(12,2) NOT NULL,
  put_vega              NUMERIC(12,2) NOT NULL,
  diff                  NUMERIC(12,2) NOT NULL,
  call_vega_change      NUMERIC(12,2) NOT NULL,
  put_vega_change       NUMERIC(12,2) NOT NULL,
  diff_change           NUMERIC(12,2) NOT NULL,
  trend                 TEXT NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (trading_date, symbol, expiry_date, captured_time)
);

CREATE INDEX IF NOT EXISTS vega_snapshots_lookup_idx
  ON vega_snapshots (trading_date, symbol, expiry_date, captured_at);

-- ── 4. Row Level Security (permissive — no auth yet) ─────────────────────────

ALTER TABLE weightage ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vega_snapshots ENABLE ROW LEVEL SECURITY;

-- Weightage: read-only for everyone
CREATE POLICY "Public read weightage"
  ON weightage FOR SELECT
  USING (true);

-- Admin notes: full CRUD for everyone (tighten when auth is added)
CREATE POLICY "Public full access notes"
  ON admin_notes FOR ALL
  USING (true)
  WITH CHECK (true);

-- Vega snapshots: read/write for dashboard capture (tighten when auth is added)
CREATE POLICY "Public full access vega snapshots"
  ON vega_snapshots FOR ALL
  USING (true)
  WITH CHECK (true);
