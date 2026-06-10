/**
 * Black-Scholes Options Pricing & Greeks Calculator
 */

// Standard Normal probability density function
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Standard Normal cumulative distribution function (Abramowitz and Stegun approximation)
function normalCDF(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const xAbs = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + 0.3275911 * xAbs);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-xAbs * xAbs);
  return 0.5 * (1.0 + sign * erf);
}

export interface OptionGreeks {
  delta: number;
  gamma: number;
  theta: number; // Daily theta
  vega: number;  // Vega per 1% change in IV
}

/**
 * Calculates the Greeks for a European option using the Black-Scholes model.
 * 
 * @param S Underlying price
 * @param K Strike price
 * @param T Time to expiry in years
 * @param r Risk-free interest rate (e.g., 0.10 for 10%)
 * @param v Implied volatility (e.g., 0.20 for 20%)
 * @param isCall True for Call option, False for Put option
 */
export function calculateGreeks(
  S: number,
  K: number,
  T: number,
  r: number,
  v: number,
  isCall: boolean
): OptionGreeks {
  // If expired or zero volatility, intrinsic values
  if (T <= 0 || v <= 0) {
    return {
      delta: isCall ? (S >= K ? 1 : 0) : (S <= K ? -1 : 0),
      gamma: 0,
      theta: 0,
      vega: 0,
    };
  }

  const d1 = (Math.log(S / K) + (r + 0.5 * v * v) * T) / (v * Math.sqrt(T));
  const d2 = d1 - v * Math.sqrt(T);

  const nd1 = normalPDF(d1);
  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const N_minus_d1 = normalCDF(-d1);
  const N_minus_d2 = normalCDF(-d2);

  let delta: number;
  let theta: number;

  if (isCall) {
    delta = Nd1;
    theta = -(S * nd1 * v) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * Nd2;
  } else {
    delta = Nd1 - 1; // equivalent to -normalCDF(-d1)
    theta = -(S * nd1 * v) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * N_minus_d2;
  }

  const gamma = nd1 / (S * v * Math.sqrt(T));
  const vega = (S * Math.sqrt(T) * nd1) / 100; // Divided by 100 for a 1% change in vol
  
  return {
    delta,
    gamma,
    theta: theta / 365, // Convert annualized theta to daily
    vega,
  };
}
