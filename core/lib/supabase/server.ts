import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components / Server Actions / Route Handlers.
 *
 * Reads/writes auth cookies via Next.js cookies() API. Note that writing
 * cookies from a Server Component will throw; that case is handled below
 * by swallowing the error (the middleware will refresh the session on the
 * next request).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as CookieOptions);
            }
          } catch {
            // Called from a Server Component: ignore. Middleware refreshes sessions.
          }
        },
      },
    }
  );
}
