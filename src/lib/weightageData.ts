/**
 * Static Bank Nifty constituent weightage data.
 * Source: NSE Bank Nifty index factsheet.
 * Update these values periodically from https://www.niftyindices.com
 */

import type { WeightageEntry } from './types';

export const BANK_NIFTY_WEIGHTAGE: WeightageEntry[] = [
  { name: 'HDFCBANK',   fullName: 'HDFC Bank',            weightage: 17.93, color: '#3b82f6' },
  { name: 'ICICIBANK',  fullName: 'ICICI Bank',            weightage: 13.63, color: '#8b5cf6' },
  { name: 'AXISBANK',   fullName: 'Axis Bank',             weightage: 10.28, color: '#10b981' },
  { name: 'KOTAKBANK',  fullName: 'Kotak Mahindra Bank',   weightage:  9.81, color: '#06b6d4' },
  { name: 'SBIN',       fullName: 'State Bank of India',   weightage:  9.07, color: '#f59e0b' },
  { name: 'FEDERALBNK', fullName: 'Federal Bank',          weightage:  6.38, color: '#14b8a6' },
  { name: 'INDUSINDBK', fullName: 'IndusInd Bank',         weightage:  5.40, color: '#ef4444' },
  { name: 'AUBANK',     fullName: 'AU Small Finance Bank', weightage:  4.87, color: '#f97316' },
  { name: 'BANKBARODA', fullName: 'Bank of Baroda',        weightage:  4.47, color: '#a855f7' },
  { name: 'IDFCFIRSTB', fullName: 'IDFC First Bank',       weightage:  4.27, color: '#64748b' },
  { name: 'Others',     fullName: 'Others',                weightage: 13.89, color: '#374151' },
];

/** Total for validation — should be ~100 */
export const TOTAL_WEIGHTAGE = BANK_NIFTY_WEIGHTAGE.reduce((s, e) => s + e.weightage, 0);
