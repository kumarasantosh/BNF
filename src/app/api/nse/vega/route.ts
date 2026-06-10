import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchNseVegaDashboard } from '@/lib/nseVega';
import type { VegaApiResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const { data, source, warning } = await fetchNseVegaDashboard();

    const body: VegaApiResponse = {
      data,
      source,
      warning,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(body, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=50, stale-while-revalidate=10',
      },
    });
  } catch (err) {
    console.error('[API /api/nse/vega]', err);

    return NextResponse.json(
      { error: 'Failed to fetch NSE vega data. Please try again shortly.' },
      { status: 503 },
    );
  }
}
