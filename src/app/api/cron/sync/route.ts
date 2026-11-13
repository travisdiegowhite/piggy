import { NextResponse, type NextRequest } from "next/server";
import { syncAll } from "@/lib/sync";

export const maxDuration = 300;

// Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await syncAll();
  return NextResponse.json({ ok: true, results });
}
