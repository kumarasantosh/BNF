import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/notes
 * Fetch all admin notes from Supabase, newest first.
 */
export async function GET() {
  const { data, error } = await supabase
    .from('admin_notes')
    .select('id, title, description, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Notes API] GET failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Map snake_case → camelCase
  const notes = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json({ data: notes });
}

/**
 * POST /api/notes
 * Create a new admin note.
 * Body: { title: string, description?: string }
 */
export async function POST(req: NextRequest) {
  let body: { title?: string; description?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('admin_notes')
    .insert({ title, description: body.description?.trim() ?? '' })
    .select('id, title, description, created_at, updated_at')
    .single();

  if (error) {
    console.error('[Notes API] POST failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      id: data.id,
      title: data.title,
      description: data.description ?? '',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  }, { status: 201 });
}
