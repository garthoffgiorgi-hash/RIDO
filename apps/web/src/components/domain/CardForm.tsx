"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { type CardFormHandle, mountCardForm } from "@/lib/payments/browser";

/**
 * Collecting a card, in RIDO's clothes.
 *
 * **The only Client Component permitted to reach `src/lib/payments/browser.ts`**, exactly as
 * `RideMap.tsx` is the only one permitted to reach `src/lib/maps/map.ts`. It receives a handle and
 * drives it; no Stripe type crosses this boundary, and no other component imports the wrapper.
 *
 * The form itself is Stripe's iframe. That is the point: the card number is typed into Stripe's
 * document, not RIDO's, so it never enters this app's memory, network or logs.
 */
export function CardForm({
  clientSecret,
  submitLabel,
  onSaved,
  onCancel,
}: {
  /** From `startCardSetup()`. Single-use — a fresh one per attempt. */
  clientSecret: string;
  submitLabel: string;
  onSaved: (setupIntentId: string) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<CardFormHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = container.current;
    if (!node) return;

    let cancelled = false;

    mountCardForm({ container: node, clientSecret })
      .then((mounted) => {
        // The effect can lose its race with an unmount — tear down immediately rather than
        // leaving an orphaned iframe, the same cleanup shape RideMap uses.
        if (cancelled) {
          mounted.destroy();
          return;
        }
        handle.current = mounted;
        setReady(true);
      })
      .catch((cause) => {
        if (cancelled) return;
        console.error("payments: the card form failed to mount", { cause });
        setError("We couldn't load the card form. Refresh and try again.");
      });

    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
    };
  }, [clientSecret]);

  async function handleSubmit() {
    if (!handle.current) return;
    setBusy(true);
    setError(null);

    const result = await handle.current.confirmSetup();

    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }

    // Deliberately stays busy through the caller's work: the card is saved at Stripe but not yet
    // recorded here, and re-enabling the button in that gap invites a second submit.
    await onSaved(result.setupIntentId);
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div ref={container} />

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={handleSubmit}
        disabled={!ready || busy}
      >
        {busy ? "Saving…" : submitLabel}
      </Button>

      {onCancel && (
        <Button variant="ghost" size="lg" fullWidth onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      )}
    </div>
  );
}
