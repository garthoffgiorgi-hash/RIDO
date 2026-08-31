"use client";

import { useState } from "react";
import { CardForm } from "@/components/domain/CardForm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { PaymentProfile } from "@/lib/payments/server";
import { saveCard, startCardSetup } from "./actions";

/**
 * The card a rider pays with, on the one page they'd go looking for it.
 *
 * The booking sheet also collects a card, on a rider's first ride, so this is not the only way in —
 * it is the way to *change* one, and the answer to "which card am I paying with" asked outside a
 * booking. Two surfaces, one `CardForm`.
 *
 * Shows brand, last four and expiry and nothing else, because that is all this app ever stores:
 * Stripe's iframe takes the number and returns a reference (`src/lib/payments/browser.ts`).
 */
export function PaymentCard({ profile }: { profile: PaymentProfile }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleAdd() {
    setBusy(true);
    setError(null);
    const setup = await startCardSetup();
    setBusy(false);
    if (setup.ok) setClientSecret(setup.data.clientSecret);
    else setError(setup.message);
  }

  async function handleSaved(setupIntentId: string) {
    const result = await saveCard(setupIntentId);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setClientSecret(null);
    // Rather than refreshing the whole route for one line of text: the card is saved, and saying so
    // is more useful than a flash of re-rendered page. The real value arrives on the next load.
    setSaved(true);
  }

  return (
    <Card>
      <h2 className="mb-1 font-sora text-lg font-bold text-midnight">Payment</h2>

      {clientSecret ? (
        <div className="mt-4">
          <p className="mb-3 text-[13px] text-slate">
            Your card is held for each ride and charged when the trip ends.
          </p>
          <CardForm
            clientSecret={clientSecret}
            submitLabel="Save card"
            onSaved={handleSaved}
            onCancel={() => setClientSecret(null)}
          />
        </div>
      ) : (
        <>
          {saved ? (
            <p className="mb-4 text-sm text-slate">Your new card is saved.</p>
          ) : profile.hasCard ? (
            <p className="mb-4 text-sm text-slate">
              <span className="font-semibold text-ink">
                {profile.brand ? capitalize(profile.brand) : "Card"} ••••{" "}
                <span className="tabular">{profile.last4}</span>
              </span>
              {profile.expMonth && profile.expYear ? (
                <>
                  {" · expires "}
                  <span className="tabular">
                    {String(profile.expMonth).padStart(2, "0")}/{profile.expYear}
                  </span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="mb-4 text-sm text-slate">
              Add a card to book a ride. We&apos;ll hold your fare when you book and charge it when
              the trip ends.
            </p>
          )}

          {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}

          <Button variant="secondary" size="lg" fullWidth onClick={handleAdd} disabled={busy}>
            {busy ? "Opening…" : profile.hasCard || saved ? "Replace card" : "Add a card"}
          </Button>
        </>
      )}
    </Card>
  );
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
