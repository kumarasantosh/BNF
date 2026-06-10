import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * PATCH /api/notes/:id
 * Update an existing admin note.
 * Body: { title?: string, description?: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: { title?: string; description?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.description !== undefined) updates.description = body.description.trim();

  const { data, error } = await supabase
    .from('admin_notes')
    .update(updates)
    .eq('id', params.id)
    .select('id, title, description, created_at, updated_at')
    .single();

  if (error) {
    console.error('[Notes API] PATCH failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: data.id,
      title: data.title,
      description: data.description ?? '',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

/**
 * DELETE /api/notes/:id
 * Delete an admin note.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error } = await supabase
    .from('admin_notes')
    .delete()
    .eq('id', params.id);

  if (error) {
    console.error('[Notes API] DELETE failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
