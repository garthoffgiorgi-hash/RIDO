import { type NextRequest, NextResponse } from "next/server";
import { runStuckMoneySweep } from "@/lib/ops/sweep";

/**
 * The repo's first scheduled job (ADR-0025). Vercel Cron calls this on the schedule in
 * `../../../../../../vercel.json`; the sweep's entire logic lives in `@/lib/ops/`, so this file's
 * only two jobs are proving the caller is really Vercel Cron and shaping the response.
 *
 * **Unauthenticated by session, deliberately, like `api/stripe/webhook`.** Vercel Cron has no
 * RIDO login; it proves identity with `CRON_SECRET`, a value only Vercel's scheduler and this
 * server hold. `src/proxy.ts` excludes `api/cron` from session refresh for that reason.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;

  // A missing secret fails closed rather than accepting every caller — an unset env var must
  // never silently become "no auth required" on a route that moves money.
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const report = await runStuckMoneySweep();
  return NextResponse.json(report);
}
