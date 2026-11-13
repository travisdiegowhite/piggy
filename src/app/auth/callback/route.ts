import { NextResponse, type NextRequest } from "next/server";
import { createClient, isAllowedEmail } from "@/lib/supabase/server";

// Magic-link landing. Supports PKCE (?code=) and token-hash (?token_hash=&type=) links.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const supabase = await createClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "email" | "magiclink" })).error;
  }

  const dest = new URL(ok ? "/" : "/login?error=link", url.origin);
  if (ok) {
    const { data } = await supabase.auth.getUser();
    if (!isAllowedEmail(data.user?.email)) {
      await supabase.auth.signOut();
      dest.pathname = "/login";
      dest.search = "?error=not-allowed";
    }
  }
  return NextResponse.redirect(dest);
}
