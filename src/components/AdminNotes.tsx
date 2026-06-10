'use client';

/**
 * AdminNotes — Supabase-backed trading notes with full CRUD.
 *
 * Uses React Query for data fetching and optimistic mutations.
 * All persistence flows through /api/notes API routes → Supabase.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X, Check, StickyNote, RefreshCw, AlertTriangle } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { AdminNote } from '@/lib/types';
import Card from './ui/Card';
import LoadingSpinner from './ui/LoadingSpinner';

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchNotes(): Promise<AdminNote[]> {
  const res = await fetch('/api/notes', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}

async function createNote(body: { title: string; description: string }): Promise<AdminNote> {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data;
}

async function updateNote(id: string, body: { title: string; description: string }): Promise<AdminNote> {
  const res = await fetch(`/api/notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data;
}

async function deleteNoteApi(id: string): Promise<void> {
  const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface NoteFormValues {
  title: string;
  description: string;
}

interface NoteFormProps {
  initial?: NoteFormValues;
  onSubmit: (v: NoteFormValues) => void;
  onCancel?: () => void;
  submitLabel: string;
  isSubmitting?: boolean;
}

function NoteForm({ initial, onSubmit, onCancel, submitLabel, isSubmitting }: NoteFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  const canSubmit = title.trim().length > 0 && !isSubmitting;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ title: title.trim(), description: description.trim() });
    if (!initial) {
      // Only clear for "new note" form, not edit
      setTitle('');
      setDescription('');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        placeholder="Note title *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        required
        className="w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
      />
      <textarea
        placeholder="Description / trading observation…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="w-full resize-y rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-lg border border-[#2a2d3e] px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// ── Note Card ─────────────────────────────────────────────────────────────────

interface NoteCardProps {
  note: AdminNote;
  onEdit: (note: AdminNote, values: NoteFormValues) => void;
  onDelete: (id: string) => void;
  isDeleting?: boolean;
}

function NoteCard({ note, onEdit, onDelete, isDeleting }: NoteCardProps) {
  const [editMode, setEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function handleSave(v: NoteFormValues) {
    setIsSaving(true);
    onEdit(note, v);
    setEditMode(false);
    setIsSaving(false);
  }

  if (editMode) {
    return (
      <div className="rounded-xl border border-blue-500/40 bg-[#0f1117] p-4">
        <NoteForm
          initial={{ title: note.title, description: note.description }}
          onSubmit={handleSave}
          onCancel={() => setEditMode(false)}
          submitLabel="Save Changes"
          isSubmitting={isSaving}
        />
      </div>
    );
  }

  return (
    <div className={`group rounded-xl border border-[#2a2d3e] bg-[#0f1117] p-4 transition-colors hover:border-[#3a3d4e] ${isDeleting ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-100">{note.title}</h3>
          {note.description && (
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-400">
              {note.description}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600">
            <span>Created: {formatDateTime(note.createdAt)}</span>
            {note.updatedAt !== note.createdAt && (
              <span>Edited: {formatDateTime(note.updatedAt)}</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditMode(true)}
            title="Edit note"
            className="rounded p-1.5 text-slate-500 hover:bg-[#2a2d3e] hover:text-blue-400 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(note.id)}
            title="Delete note"
            disabled={isDeleting}
            className="rounded p-1.5 text-slate-500 hover:bg-[#2a2d3e] hover:text-red-400 transition-colors disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AdminNotes() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  // Fetch notes from Supabase via API
  const { data: notes = [], isLoading, isError, error, isFetching, refetch } =
    useQuery<AdminNote[], Error>({
      queryKey: ['admin-notes'],
      queryFn: fetchNotes,
      staleTime: 30_000, // 30 seconds
    });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (body: { title: string; description: string }) => createNote(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notes'] });
      setShowForm(false);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; title: string; description: string }) =>
      updateNote(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notes'] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNoteApi(id),
    onMutate: async (deletedId) => {
      // Optimistic removal
      await queryClient.cancelQueries({ queryKey: ['admin-notes'] });
      const previous = queryClient.getQueryData<AdminNote[]>(['admin-notes']);
      queryClient.setQueryData<AdminNote[]>(['admin-notes'], (old) =>
        (old ?? []).filter((n) => n.id !== deletedId),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['admin-notes'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notes'] });
    },
  });

  function handleAdd(values: NoteFormValues) {
    createMutation.mutate(values);
  }

  function handleEdit(note: AdminNote, values: NoteFormValues) {
    updateMutation.mutate({ id: note.id, ...values });
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this note?')) return;
    deleteMutation.mutate(id);
  }

  return (
    <Card
      title="Admin Notes"
      titleRight={
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh notes"
            className="rounded p-1 text-slate-500 hover:text-blue-400 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      {/* Error banner */}
      {isError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Failed to load notes</p>
            <p className="mt-0.5 text-red-400/70">{error?.message}</p>
          </div>
        </div>
      )}

      {/* Mutation error banners */}
      {createMutation.isError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Failed to create note: {(createMutation.error as Error)?.message}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading notes…" />
        </div>
      ) : (
        <>
          {/* Add new note toggle */}
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#2a2d3e] py-3 text-xs text-slate-500 hover:border-blue-500/50 hover:text-blue-400 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Trading Note
            </button>
          ) : (
            <div className="rounded-xl border border-[#2a2d3e] bg-[#0f1117] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                New Note
              </p>
              <NoteForm
                onSubmit={handleAdd}
                onCancel={() => setShowForm(false)}
                submitLabel="Save Note"
                isSubmitting={createMutation.isPending}
              />
            </div>
          )}

          {/* Notes list */}
          {notes.length > 0 ? (
            <div className="mt-4 space-y-3">
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === note.id}
                />
              ))}
            </div>
          ) : (
            <div className="mt-6 flex flex-col items-center gap-2 py-6 text-slate-600">
              <StickyNote className="h-8 w-8 opacity-30" />
              <p className="text-xs">No notes yet. Add your first trading observation above.</p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
