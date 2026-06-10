import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { BANK_NIFTY_WEIGHTAGE } from '@/lib/weightageData';

/**
 * GET /api/weightage
 * Fetch Bank Nifty constituent weightage from Supabase.
 * Falls back to static data if Supabase is unavailable.
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('weightage')
      .select('name, full_name, weightage, color')
      .order('weightage', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      // No rows in Supabase — return static fallback
      return NextResponse.json({
        data: BANK_NIFTY_WEIGHTAGE,
        source: 'static' as const,
      });
    }

    // Map snake_case DB columns → camelCase frontend shape
    const mapped = data.map((row) => ({
      name: row.name,
      fullName: row.full_name,
      weightage: Number(row.weightage),
      color: row.color,
    }));

    return NextResponse.json({ data: mapped, source: 'supabase' as const });
  } catch (err) {
    console.error('[Weightage API] Supabase fetch failed, using static fallback:', (err as Error).message);
    return NextResponse.json({
      data: BANK_NIFTY_WEIGHTAGE,
      source: 'static' as const,
      warning: 'Supabase unavailable — showing static data.',
    });
  }
}
