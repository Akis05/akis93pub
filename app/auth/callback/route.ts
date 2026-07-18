import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/core/lib/supabase/server";

/**
 * Supabase Auth callback handler.
 * Used for OAuth flows (Google, GitHub, etc.) and email confirmation links.
 * Exchanges the auth code for a session and redirects to the dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // If something went wrong, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
