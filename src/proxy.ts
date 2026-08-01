import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the auth session on every request and writes rotated tokens
 * back to the response. Without this, Server Components read stale tokens
 * and users get randomly logged out.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Responses that set auth cookies must never be cached.
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Must be getUser(), not getSession() — getUser() revalidates the token
  // against Supabase. Do not put any logic between this call and the return.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and images.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
