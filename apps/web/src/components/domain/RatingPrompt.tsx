"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type RatingsActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

interface RatingPromptProps {
  readonly rideId: string;
  /** Whose voice the copy speaks in — "Rate your driver" on the rider side, "Rate your rider" on the driver's. */
  readonly ratee: "driver" | "rider";
  /**
   * The route's own `"use server"` bridge — `(rider)/request/actions.ts` and
   * `(driver)/drive/actions.ts` both wrap `src/lib/ratings/server.ts` identically, but this
   * component takes them as props rather than importing either route's actions module directly:
   * `src/components/domain/` is meant to be reachable from any route, and a route-specific
   * `"use server"` file is the opposite of that. `CardForm`'s `onSaved`/`onCancel` callbacks are
   * the same shape of boundary, one layer up.
   */
  readonly getStatus: (rideId: string) => Promise<RatingsActionResult<{ alreadyRated: boolean }>>;
  readonly submit: (
    rideId: string,
    stars: number,
    comment: string | null,
  ) => Promise<RatingsActionResult<null>>;
}

/**
 * The `rate` state `brand/design-system.md`'s rider blueprint has named since before there was
 * anything to build it against — one star picker and an optional comment, shared by the rider's
 * trip-complete summary (`RequestPanel`) and the driver's post-completion card
 * (`CurrentRidePanel`). Direction and the ratee's identity are never this component's business;
 * `src/lib/ratings/server.ts` derives both from who's signed in and the ride itself.
 *
 * Checks `getStatus` once on mount rather than assuming a fresh prompt: the rider's trip-complete
 * summary can still be showing on a reload minutes after a rating was already submitted
 * (`getRecentlyCompletedRide`'s freshness window), and re-asking would read as not having
 * listened the first time — the opposite of `brand/brand-guide.md`'s warmth-inward voice.
 */
export function RatingPrompt({ rideId, ratee, getStatus, submit }: RatingPromptProps) {
  const [phase, setPhase] = useState<"loading" | "prompting" | "submitting" | "done" | "skipped">(
    "loading",
  );
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStatus(rideId).then((result) => {
      if (cancelled) return;
      setPhase(result.ok && result.data.alreadyRated ? "done" : "prompting");
    });
    return () => {
      cancelled = true;
    };
  }, [rideId, getStatus]);

  async function handleSubmit() {
    if (stars < 1) {
      setError("Choose a star rating first.");
      return;
    }
    setError(null);
    setPhase("submitting");
    const result = await submit(rideId, stars, comment.trim() || null);
    if (result.ok) {
      setPhase("done");
    } else {
      setPhase("prompting");
      setError(result.message);
    }
  }

  if (phase === "loading" || phase === "skipped") return null;

  if (phase === "done") {
    return <p className="text-left text-[13px] text-slate">Thanks for rating your {ratee}.</p>;
  }

  const label = ratee === "driver" ? "Rate your driver" : "Rate your rider";
  const submitting = phase === "submitting";

  return (
    <div className="space-y-3 border-t border-mist pt-4 text-left">
      <p className="font-sora text-heading font-semibold text-ink">{label}</p>
      {/* <fieldset>/<legend>, not role="radiogroup" — the same native-first idiom
          `SegmentedControl` uses for its own single-choice row: no ARIA needed, and a plain
          <button> with `aria-pressed` is exactly what biome's a11y/useSemanticElements rule asks
          for in place of role="radio" on a non-<input>. */}
      <fieldset className="m-0 flex gap-1 border-0 p-0">
        <legend className="sr-only">Star rating</legend>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={stars === value}
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            disabled={submitting}
            onClick={() => setStars(value)}
            className="p-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/50"
          >
            <Star size={26} className={value <= stars ? "fill-signal text-signal" : "text-mist"} />
          </button>
        ))}
      </fieldset>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Add a comment (optional)"
        rows={2}
        disabled={submitting}
        className="w-full rounded-input border border-mist bg-white p-3 text-[14px] text-ink placeholder:text-slate focus:border-signal focus:outline-none focus:ring-[3px] focus:ring-signal/50 disabled:opacity-50"
      />
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" size="md" fullWidth onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit rating"}
        </Button>
        <Button variant="ghost" size="md" onClick={() => setPhase("skipped")} disabled={submitting}>
          Not now
        </Button>
      </div>
    </div>
  );
}
