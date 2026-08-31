"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Fare, formatCents } from "@/components/ui/Fare";
import type { PayoutSummary } from "@/lib/payouts/server";
import { retryPayout, startConnectOnboarding } from "./actions";

/**
 * Where a driver's money is: connected or not, sent or waiting.
 *
 * Every figure here is a stored `driver_payouts.amount_cents`, which a database trigger copied
 * from the ride's write-once commission snapshot. Nothing is computed in this component — the
 * totals arrive already summed from `getPayoutSummary`, and `Fare` only formats
 * (`apps/web/CLAUDE.md`: a driver-facing figure comes from a snapshot, never arithmetic in JSX).
 *
 * The distinction the copy works hardest at: **pending is not failure.** A driver who hasn't
 * finished Connect onboarding, or whose transfer hit a retryable error, has money that is recorded
 * and theirs. Saying "failed" there would be both wrong and alarming.
 */
export function PayoutCard({ summary }: { summary: PayoutSummary }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = summary.connectStatus === "enabled";

  async function handleConnect() {
    setBusy(true);
    setError(null);
    const result = await startConnectOnboarding();
    setBusy(false);

    if (result.ok) {
      // A full navigation, not a client-side route change: Stripe's onboarding is an external
      // origin, so Next's router has no business handling it.
      window.location.href = result.data.url;
    } else {
      setError(result.message);
    }
  }

  async function handleRetry(payoutId: string) {
    setBusy(true);
    setError(null);
    const result = await retryPayout(payoutId);
    setBusy(false);

    if (result.ok) {
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <Card size="sm" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-sora text-lg font-bold text-midnight">Earnings</h2>
      </div>

      <div>
        <Fare cents={summary.paidCents} />
        <p className="tabular text-[13px] text-slate">sent to your bank</p>
      </div>

      {summary.pendingCents > 0 && (
        <p className="tabular text-[13px] text-slate">
          {formatCents(summary.pendingCents)} earned and waiting to be sent
        </p>
      )}

      {summary.failedCents > 0 && (
        <p className="tabular text-[13px] text-danger">
          {formatCents(summary.failedCents)} couldn&apos;t be sent
        </p>
      )}

      <p className="text-[13px] text-slate">{summary.connectMessage}</p>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {!connected && (
        <Button variant="accent" size="lg" fullWidth onClick={handleConnect} disabled={busy}>
          {busy
            ? "Opening Stripe…"
            : summary.connectStatus === "not_started"
              ? "Connect your bank"
              : "Finish payout setup"}
        </Button>
      )}

      {/* Only failed rows get a retry button. A pending one is either already going to be retried
          or is waiting on onboarding, and offering a button that changes nothing is worse than
          offering none. */}
      {summary.unsettled
        .filter((payout) => payout.status === "failed")
        .map((payout) => (
          <div key={payout.id} className="flex items-center justify-between gap-3">
            <p className="tabular text-[13px] text-slate">{formatCents(payout.amount_cents)}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleRetry(payout.id)}
              disabled={busy}
            >
              Retry
            </Button>
          </div>
        ))}
    </Card>
  );
}
