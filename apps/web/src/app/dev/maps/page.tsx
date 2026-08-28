import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { DevMapsPanel } from "./DevMapsPanel";

/**
 * The maps proving ground. Not linked from anywhere — this is where the two tokens in
 * `.env.local` get exercised against real Mapbox services for the first time: search, render,
 * `measureRoute()`, and `quoteFare()`, end to end.
 *
 * 404s outside development so it never ships as a reachable route. `requireUser()` gates it the
 * same way `/account` and `/drive` are gated, because the fare quote underneath it reads
 * `fare_rate_cards`, which RLS restricts to `authenticated`.
 */
export default async function DevMapsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  await requireUser();

  return (
    <main className="min-h-screen bg-ivory p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="font-display text-2xl text-ink">Maps proving ground</h1>
          <p className="text-[14px] text-slate">
            Search a pickup and a dropoff. This measures the trip with a real Mapbox account and
            prices it with the live rate card — the same path a rider's quote will use.
          </p>
        </div>
        <DevMapsPanel />
      </div>
    </main>
  );
}
