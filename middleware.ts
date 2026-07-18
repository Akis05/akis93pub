import type { NextRequest } from "next/server";
import { updateSession } from "@/core/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

/**
 * Run the middleware on every request EXCEPT:
 * - Next.js internals (_next/static, _next/image)
 * - Static files (favicon, public assets matched by extension)
 * - The token bootstrap route (/api/auth/token) and the SMS API routes
 *   (/api/sms/send, /api/sms/status, /api/sms/cdr, /api/sms/dlr), which are
 *   themselves protected by Bearer tokens (see core/lib/api-auth.ts) and
 *   must remain reachable without a Supabase session (e.g. from Postman/cURL).
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$|api/auth/token|api/sms/send|api/sms/status|api/sms/cdr|api/sms/dlr).*)",
  ],
};
