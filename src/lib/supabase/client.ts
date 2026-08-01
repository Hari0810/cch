import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. Use in Client Components — including anything that
 * subscribes to realtime (the approval feed, live verdict updates).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
