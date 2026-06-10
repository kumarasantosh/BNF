/**
 * Supabase client singleton — used by both server-side API routes
 * and client-side components via NEXT_PUBLIC_ env vars.
 *
 * NOTE: This uses the anon key (public). For admin operations in the
 * future, create a separate server-only client with the service_role key.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase calls will fail.',
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
