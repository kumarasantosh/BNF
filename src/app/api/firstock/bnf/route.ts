/**
 * GET /api/firstock/bnf
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side API route that fetches Bank Nifty data from Firstock.
 * Credentials are read from environment variables — NEVER exposed to client.
 *
 * Response shape: BNFApiResponse (see src/lib/types.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchBNFData } from '@/lib/firstock';
import type { BNFApiResponse } from '@/lib/types';

// Instruct Next.js not to cache this route
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const { data, source, warning } = await fetchBNFData();

    const body: BNFApiResponse = {
      data,
      lastUpdated: new Date().toISOString(),
      source,
      warning,
    };

    return NextResponse.json(body, {
      status: 200,
      headers: {
        // Allow the browser to cache for 50 seconds (just under the 60s poll)
        'Cache-Control': 'public, max-age=50, stale-while-revalidate=10',
      },
    });
  } catch (err) {
    console.error('[API /api/firstock/bnf]', err);

    return NextResponse.json(
      { error: 'Failed to fetch Bank Nifty data. Please try again shortly.' },
      { status: 503 },
    );
  }
}
