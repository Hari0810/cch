import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Server-only — never import this into a Client Component. Use it for
 * seeding demo data and for writing agent verdicts back into the audit
 * trail, where there is no user session to act on behalf of.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
