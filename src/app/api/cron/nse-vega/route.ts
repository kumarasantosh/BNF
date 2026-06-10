import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchNseVegaDashboard, getNseVegaCaptureStatus } from '@/lib/nseVega';

export const dynamic = 'force-dynamic';

function cronAuthError(req: NextRequest): string | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return process.env.NODE_ENV === 'production'
      ? 'CRON_SECRET is required in production'
      : null;
  }

  const authHeader = req.headers.get('authorization');
  return authHeader === `Bearer ${secret}` ? null : 'Unauthorized cron request';
}

export async function GET(req: NextRequest) {
  const authError = cronAuthError(req);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError === 'Unauthorized cron request' ? 401 : 500 });
  }

  const capture = getNseVegaCaptureStatus();

  if (!capture.shouldCapture) {
    return NextResponse.json(
      {
        status: 'skipped',
        reason: !capture.isWeekday ? 'outside_weekdays' : 'outside_capture_window',
        capture,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  const result = await fetchNseVegaDashboard();

  return NextResponse.json(
    {
      status:
        result.source === 'live'
          ? result.warning
            ? 'captured_with_warning'
            : 'captured'
          : 'fallback_not_saved',
      capture,
      ...result,
      lastUpdated: new Date().toISOString(),
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
