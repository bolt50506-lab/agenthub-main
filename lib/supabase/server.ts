import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { headers } from 'next/headers';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Server-side Supabase client that forwards the user's auth token.
 * Supports both the legacy sb-access-token cookie and an Authorization
 * bearer token supplied by authenticated client-side requests.
 */
export async function createServerClient(): Promise<SupabaseClient> {
  const cookieStore = cookies();
  const headerStore = headers();
  const cookieToken = cookieStore.get('sb-access-token')?.value;
  const authorization = headerStore.get('authorization') || '';
  const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearerToken || cookieToken;

  if (token) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Service-role client with full bypass of RLS.
 * NEVER expose this client or the service role key to the browser.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
