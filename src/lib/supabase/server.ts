import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server client, scoped to the signed-in user. Use in Server Components,
 * route handlers and server actions. RLS applies — this is the client that
 * enforces the deterministic policy layer.
 *
 * Never share across requests: call it fresh each time.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, which cannot set cookies.
            // Safe to ignore — middleware refreshes the session.
          }
        },
      },
    },
  );
}
